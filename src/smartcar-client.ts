import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { SmartcarSession, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';
const CONNECT_BASE      = 'https://connect.smartcar.com';
const TOKEN_TTL_BUFFER  = 5 * 60 * 1000;

export class SmartcarClient {
  private http: AxiosInstance;
  private session: SmartcarSession = {};

  readonly applicationId: string;
  readonly clientId: string;
  private readonly clientSecret: string;
  private readonly log: Logger;
  private userId?: string;

  constructor(params: {
    applicationId: string;
    clientId: string;
    clientSecret: string;
    userId?: string;
    log: Logger;
  }) {
    this.applicationId = params.applicationId;
    this.clientId      = params.clientId;
    this.clientSecret  = params.clientSecret;
    this.userId        = params.userId;
    this.log           = params.log;
    this.http          = axios.create({ timeout: 30_000 });
  }

  hasUserId(): boolean { return !!this.userId; }
  setUserId(id: string | undefined): void { this.userId = id; }
  getUserId(): string | undefined { return this.userId; }

  buildConnectUrl(redirectUri: string, mode: 'live' | 'simulated' = 'live'): string {
    const scopes = [
      'read_vehicle_info', 'read_vin', 'read_odometer',
      'read_location', 'read_charge', 'read_fuel', 'control_security',
    ].join(' ');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     this.applicationId,
      redirect_uri:  redirectUri,
      scope:         scopes,
      mode,
    });
    return `${CONNECT_BASE}/oauth/authorize?${params.toString()}`;
  }

  private async fetchAppToken(): Promise<string> {
    this.log.info('[Smartcar] App-Token wird geholt (clientId: %s...)', this.clientId.substring(0, 12));

    // Smartcar IAM requires HTTP Basic Auth: base64(clientId:clientSecret)
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const resp = await this.http.post(
        SMARTCAR_IAM_URL,
        new URLSearchParams({ grant_type: 'client_credentials' }),
        {
          headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
        },
      );
      const expiresIn: number = resp.data.expires_in ?? 3600;
      this.session.appToken          = resp.data.access_token;
      this.session.appTokenExpiresAt = Date.now() + expiresIn * 1000;
      this.log.info('[Smartcar] App-Token gültig für %ds', expiresIn);
      return resp.data.access_token as string;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        this.log.error('[Smartcar] Token-Fehler %s: %s',
          err.response?.status,
          JSON.stringify(err.response?.data ?? err.message));
      }
      throw err;
    }
  }

  async getAppToken(): Promise<string> {
    if (
      this.session.appToken &&
      this.session.appTokenExpiresAt &&
      this.session.appTokenExpiresAt - Date.now() > TOKEN_TTL_BUFFER
    ) return this.session.appToken;
    return this.fetchAppToken();
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.userId) throw new Error('Keine userId — bitte Fahrzeug verbinden.');
    await this.getAppToken();
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      'Authorization': `Bearer ${await this.getAppToken()}`,
      'sc-user-id':    this.userId!,
    };
  }

  private async get<T>(path: string): Promise<T> {
    try {
      return (await this.http.get<T>(`${SMARTCAR_API_BASE}${path}`,
        { headers: await this.authHeaders() })).data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        this.log.error('[Smartcar] GET %s → %s: %s', path,
          err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      }
      throw err;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return (await this.http.post<T>(`${SMARTCAR_API_BASE}${path}`, body, {
        headers: { ...await this.authHeaders(), 'Content-Type': 'application/json' },
      })).data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        this.log.error('[Smartcar] POST %s → %s: %s', path,
          err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      }
      throw err;
    }
  }

  async getVehicles(): Promise<JlrVehicleSummary[]> {
    const connData = await this.get<{ connections: { vehicleId: string }[] }>('/connections');
    const ids = (connData.connections ?? []).map(c => c.vehicleId);
    this.log.info('[Smartcar] %d Fahrzeug(e) via /connections', ids.length);

    return Promise.all(ids.map(async (id) => {
      try {
        const info = await this.get<{ make: string; model: string; year: number }>(`/vehicles/${id}`);
        const vin  = await this.get<{ vin: string }>(`/vehicles/${id}/vin`);
        return { id, vin: vin.vin, nickname: `${info.year} ${info.make} ${info.model}`, model: info.model } as JlrVehicleSummary;
      } catch {
        return { id, vin: id, nickname: id } as JlrVehicleSummary;
      }
    }));
  }

  async getVehicleState(vehicleId: string, vin: string): Promise<JlrVehicleState> {
    const [chargeRes, locationRes, odometerRes] = await Promise.allSettled([
      this.get<{ state: string; battery?: { percentRemaining: number; range: { value: number; unit: string } }; fuel?: { percentRemaining: number; range: { value: number; unit: string } } }>(`/vehicles/${vehicleId}/charge`),
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
      this.log.debug('[Smartcar] security n/a für %s', vehicleId);
    }

    return {
      vin, isLocked, batteryLevel, charging,
      lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined,
      fuelLevelPercent, rangeKm, odometerKm,
      latitude, longitude, isMoving,
      lastUpdated: new Date().toISOString(),
    };
  }

  async lock(id: string):   Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'LOCK' }); }
  async unlock(id: string): Promise<void> { await this.post(`/vehicles/${id}/security`, { action: 'UNLOCK' }); }
}
