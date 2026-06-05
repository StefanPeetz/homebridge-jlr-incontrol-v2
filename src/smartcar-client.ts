import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { SmartcarSession } from './types';
import { JlrVehicleSummary, JlrVehicleState } from './types';

// ─── Smartcar V3 endpoints ────────────────────────────────────────────────────
const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';

const APP_TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000;

export class SmartcarClient {
  private http: AxiosInstance;
  private session: SmartcarSession = {};

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly userId: string;
  private readonly notifyWebhookUrl?: string;
  private readonly log: Logger;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    userId: string;
    notifyWebhookUrl?: string;
    log: Logger;
  }) {
    this.clientId         = params.clientId;
    this.clientSecret     = params.clientSecret;
    this.userId           = params.userId;
    this.notifyWebhookUrl = params.notifyWebhookUrl;
    this.log              = params.log;
    this.http             = axios.create({ timeout: 30000 });
  }

  // ─── V3: App-level access token (client_credentials) ─────────────────────

  private async fetchAppToken(): Promise<string> {
    this.log.info('[Smartcar] Fetching V3 app token (client_credentials)...');
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

  private async getAppToken(): Promise<string> {
    if (
      this.session.appToken &&
      this.session.appTokenExpiresAt &&
      this.session.appTokenExpiresAt - Date.now() > APP_TOKEN_TTL_BUFFER_MS
    ) {
      return this.session.appToken;
    }
    return this.fetchAppToken();
  }

  // ─── Public: ensure we have a valid app token ──────────────────────────────

  async ensureAuthenticated(): Promise<void> {
    if (!this.userId) {
      throw new Error(
        '[Smartcar] userId is not configured! ' +
        'Go to https://dashboard.smartcar.com → Connections, copy your userId and add it to the plugin config.',
      );
    }
    await this.getAppToken();
  }

  // ─── API helpers (V3) ─────────────────────────────────────────────────────

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAppToken();
    return {
      'Authorization': `Bearer ${token}`,
      'sc-user-id':    this.userId,
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

  // ─── Vehicle queries ──────────────────────────────────────────────────────

  async getVehicles(): Promise<JlrVehicleSummary[]> {
    const data = await this.get<{ vehicles: string[] }>('/vehicles');
    const summaries = await Promise.all(
      (data.vehicles ?? []).map(async (id) => {
        try {
          const info    = await this.get<{ make: string; model: string; year: number }>(`/vehicles/${id}`);
          const vinData = await this.get<{ vin: string }>(`/vehicles/${id}/vin`);
          return { id, vin: vinData.vin, nickname: `${info.year} ${info.make} ${info.model}`, model: info.model } as JlrVehicleSummary;
        } catch {
          this.log.warn('[Smartcar] Could not load info for vehicle %s', id);
          return { id, vin: id, nickname: id } as JlrVehicleSummary;
        }
      }),
    );
    this.log.info('[Smartcar] Found %d vehicle(s)', summaries.length);
    return summaries;
  }

  async getVehicleState(vehicleId: string, vin: string): Promise<JlrVehicleState> {
    const [chargeRes, locationRes, odometerRes] = await Promise.allSettled([
      this.get<{ state: string; battery?: { percentRemaining: number; range: { value: number; unit: string } }; fuel?: { percentRemaining: number; range: { value: number; unit: string } } }>(`/vehicles/${vehicleId}/charge`),
      this.get<{ latitude: number; longitude: number; speed?: { value: number } }>(`/vehicles/${vehicleId}/location`),
      this.get<{ distance: { value: number; unit: string } }>(`/vehicles/${vehicleId}/odometer`),
    ]);

    let batteryLevel: number | undefined, charging: boolean | undefined, fuelLevelPercent: number | undefined, rangeKm: number | undefined;
    if (chargeRes.status === 'fulfilled') {
      const c = chargeRes.value;
      charging = c.state === 'CHARGING';
      if (c.battery) { batteryLevel = Math.round(c.battery.percentRemaining * 100); rangeKm = c.battery.range.unit === 'miles' ? Math.round(c.battery.range.value * 1.60934) : Math.round(c.battery.range.value); }
      if (c.fuel)    { fuelLevelPercent = Math.round(c.fuel.percentRemaining * 100); }
    }

    let latitude: number | undefined, longitude: number | undefined, isMoving: boolean | undefined;
    if (locationRes.status === 'fulfilled') { ({ latitude, longitude } = locationRes.value); isMoving = (locationRes.value.speed?.value ?? 0) > 2; }

    let odometerKm: number | undefined;
    if (odometerRes.status === 'fulfilled') { const d = odometerRes.value.distance; odometerKm = d.unit === 'miles' ? Math.round(d.value * 1.60934) : Math.round(d.value); }

    let isLocked = false;
    try { isLocked = (await this.get<{ isLocked: boolean }>(`/vehicles/${vehicleId}/security`)).isLocked; }
    catch { this.log.debug('[Smartcar] security endpoint n/a'); }

    return { vin, isLocked, batteryLevel, charging, lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined, fuelLevelPercent, rangeKm, odometerKm, latitude, longitude, isMoving, lastUpdated: new Date().toISOString() };
  }

  // ─── Commands ─────────────────────────────────────────────────────────────
  async lock(id: string):   Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'LOCK' }); }
  async unlock(id: string): Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'UNLOCK' }); }
}
