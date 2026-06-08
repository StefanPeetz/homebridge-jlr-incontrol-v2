import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { SmartcarSession, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';
const CONNECT_BASE      = 'https://connect.smartcar.com';
const TOKEN_TTL_BUFFER  = 5 * 60 * 1000; // refresh 5 min before expiry

export class SmartcarClient {
  private http: AxiosInstance;
  private session: SmartcarSession = {};

  readonly clientId: string;
  private readonly clientSecret: string;
  private readonly log: Logger;
  private userId?: string;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    userId?: string;
    log: Logger;
  }) {
    this.clientId     = params.clientId;
    this.clientSecret = params.clientSecret;
    this.userId       = params.userId;
    this.log          = params.log;
    this.http         = axios.create({ timeout: 30_000 });
  }

  // ─── userId management ───────────────────────────────────────────────────

  hasUserId(): boolean {
    return !!this.userId;
  }

  setUserId(id: string): void {
    this.userId = id;
    this.log.info('[Smartcar] userId stored: %s', id);
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  // ─── Connect URL builder ─────────────────────────────────────────────────

  /**
   * Build the Smartcar Connect URL the user must open in a browser.
   * After authorization, Smartcar redirects to redirectUri?user_id=<uuid>
   */
  buildConnectUrl(redirectUri: string, mode: 'live' | 'simulated' = 'live'): string {
    const scopes = [
      'read_vehicle_info',
      'read_vin',
      'read_odometer',
      'read_location',
      'read_charge',
      'read_fuel',
      'control_security',
    ];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     this.clientId,
      redirect_uri:  redirectUri,
      scope:         scopes.join(' '),
      mode,
    });
    return `${CONNECT_BASE}/oauth/authorize?${params.toString()}`;
  }

  // ─── App-level access token (client_credentials) ─────────────────────────

  private async fetchAppToken(): Promise<string> {
    this.log.info('[Smartcar] Fetching app token (client_credentials)...');
    const resp = await this.http.post(
      SMARTCAR_IAM_URL,
      new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     this.clientId,
        client_secret: this.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const expiresIn: number = resp.data.expires_in ?? 3600;
    this.session.appToken          = resp.data.access_token;
    this.session.appTokenExpiresAt = Date.now() + expiresIn * 1000;
    this.log.info('[Smartcar] App token valid for %ds', expiresIn);
    return resp.data.access_token as string;
  }

  async getAppToken(): Promise<string> {
    if (
      this.session.appToken &&
      this.session.appTokenExpiresAt &&
      this.session.appTokenExpiresAt - Date.now() > TOKEN_TTL_BUFFER
    ) {
      return this.session.appToken;
    }
    return this.fetchAppToken();
  }

  // ─── Ensure ready ─────────────────────────────────────────────────────────

  async ensureAuthenticated(): Promise<void> {
    if (!this.userId) {
      throw new Error(
        '[Smartcar] No userId — connect your vehicle first via the Homebridge UI.',
      );
    }
    await this.getAppToken();
  }

  // ─── API helpers ─────────────────────────────────────────────────────────

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAppToken();
    return {
      'Authorization': `Bearer ${token}`,
      'sc-user-id':    this.userId!,
    };
  }

  private async get<T>(path: string): Promise<T> {
    return (await this.http.get<T>(`${SMARTCAR_API_BASE}${path}`, {
      headers: await this.authHeaders(),
    })).data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return (await this.http.post<T>(`${SMARTCAR_API_BASE}${path}`, body, {
      headers: { ...await this.authHeaders(), 'Content-Type': 'application/json' },
    })).data;
  }

  // ─── Vehicle discovery (official V3 tutorial pattern) ────────────────────

  /**
   * Step 1: GET /v3/connections  → list of { vehicleId, ... }
   * Step 2: GET /v3/vehicles/:id → make/model/year
   * Step 3: GET /v3/vehicles/:id/vin
   */
  async getVehicles(): Promise<JlrVehicleSummary[]> {
    // Use Connections API as the entry point (per official tutorial)
    const connData = await this.get<{ connections: { vehicleId: string }[] }>('/connections');
    const vehicleIds = (connData.connections ?? []).map(c => c.vehicleId);
    this.log.info('[Smartcar] Connections API returned %d vehicle(s)', vehicleIds.length);

    const summaries = await Promise.all(
      vehicleIds.map(async (id) => {
        try {
          const info    = await this.get<{ make: string; model: string; year: number }>(`/vehicles/${id}`);
          const vinData = await this.get<{ vin: string }>(`/vehicles/${id}/vin`);
          return {
            id,
            vin:      vinData.vin,
            nickname: `${info.year} ${info.make} ${info.model}`,
            model:    info.model,
          } as JlrVehicleSummary;
        } catch (err) {
          this.log.warn('[Smartcar] Could not load info for vehicle %s: %s', id, (err as Error).message);
          return { id, vin: id, nickname: id } as JlrVehicleSummary;
        }
      }),
    );
    return summaries;
  }

  // ─── Vehicle state ────────────────────────────────────────────────────────

  async getVehicleState(vehicleId: string, vin: string): Promise<JlrVehicleState> {
    const [chargeRes, locationRes, odometerRes] = await Promise.allSettled([
      this.get<{
        state: string;
        battery?: { percentRemaining: number; range: { value: number; unit: string } };
        fuel?:    { percentRemaining: number; range: { value: number; unit: string } };
      }>(`/vehicles/${vehicleId}/charge`),
      this.get<{ latitude: number; longitude: number; speed?: { value: number } }>(`/vehicles/${vehicleId}/location`),
      this.get<{ distance: { value: number; unit: string } }>(`/vehicles/${vehicleId}/odometer`),
    ]);

    let batteryLevel: number | undefined, charging: boolean | undefined,
        fuelLevelPercent: number | undefined, rangeKm: number | undefined;
    if (chargeRes.status === 'fulfilled') {
      const c = chargeRes.value;
      charging = c.state === 'CHARGING';
      if (c.battery) {
        batteryLevel = Math.round(c.battery.percentRemaining * 100);
        rangeKm = c.battery.range.unit === 'miles'
          ? Math.round(c.battery.range.value * 1.60934)
          : Math.round(c.battery.range.value);
      }
      if (c.fuel) { fuelLevelPercent = Math.round(c.fuel.percentRemaining * 100); }
    }

    let latitude: number | undefined, longitude: number | undefined, isMoving: boolean | undefined;
    if (locationRes.status === 'fulfilled') {
      ({ latitude, longitude } = locationRes.value);
      isMoving = (locationRes.value.speed?.value ?? 0) > 2;
    }

    let odometerKm: number | undefined;
    if (odometerRes.status === 'fulfilled') {
      const d = odometerRes.value.distance;
      odometerKm = d.unit === 'miles' ? Math.round(d.value * 1.60934) : Math.round(d.value);
    }

    let isLocked = false;
    try {
      isLocked = (await this.get<{ isLocked: boolean }>(`/vehicles/${vehicleId}/security`)).isLocked;
    } catch {
      this.log.debug('[Smartcar] security endpoint n/a for %s', vehicleId);
    }

    return {
      vin, isLocked, batteryLevel, charging,
      lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined,
      fuelLevelPercent, rangeKm, odometerKm,
      latitude, longitude, isMoving,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ─── Commands ────────────────────────────────────────────────────────────
  async lock(id: string):   Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'LOCK' }); }
  async unlock(id: string): Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'UNLOCK' }); }
}
