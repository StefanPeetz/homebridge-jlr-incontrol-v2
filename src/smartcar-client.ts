import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { SmartcarSession, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';
const CONNECT_BASE      = 'https://connect.smartcar.com';
const TOKEN_TTL_BUFFER  = 5 * 60 * 1000;

interface V3Connection {
  id: string;
  attributes: {
    permissions: string[];
    vehicle: { make: string; model: string; year: number; mode: string; powertrainType: string };
  };
  relationships: { vehicle: { data: { id: string } } };
}
interface V3ConnectionsResponse {
  data: V3Connection[];
  meta: { totalCount: number };
}

// V3 Signals response: data is an object keyed by signal name
interface SignalValue {
  value: unknown;
  unit?: string;
  timestamp?: string;
  status?: string;
}
type SignalsResponse = { data: Record<string, SignalValue> };

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
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    try {
      const resp = await this.http.post(
        SMARTCAR_IAM_URL,
        new URLSearchParams({ grant_type: 'client_credentials' }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${basicAuth}` } },
      );
      const expiresIn: number = resp.data.expires_in ?? 3600;
      this.session.appToken          = resp.data.access_token;
      this.session.appTokenExpiresAt = Date.now() + expiresIn * 1000;
      this.log.info('[Smartcar] App-Token gültig für %ds', expiresIn);
      return resp.data.access_token as string;
    } catch (err: unknown) {
      if (axios.isAxiosError(err))
        this.log.error('[Smartcar] Token-Fehler %s: %s', err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      throw err;
    }
  }

  async getAppToken(): Promise<string> {
    if (this.session.appToken && this.session.appTokenExpiresAt && this.session.appTokenExpiresAt - Date.now() > TOKEN_TTL_BUFFER)
      return this.session.appToken;
    return this.fetchAppToken();
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.userId) throw new Error('Keine userId — bitte Fahrzeug verbinden.');
    await this.getAppToken();
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return { 'Authorization': `Bearer ${await this.getAppToken()}`, 'sc-user-id': this.userId! };
  }

  private async get<T>(path: string): Promise<T> {
    try {
      return (await this.http.get<T>(`${SMARTCAR_API_BASE}${path}`, { headers: await this.authHeaders() })).data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err))
        this.log.error('[Smartcar] GET %s → %s: %s', path, err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      throw err;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return (await this.http.post<T>(`${SMARTCAR_API_BASE}${path}`, body, {
        headers: { ...await this.authHeaders(), 'Content-Type': 'application/json' },
      })).data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err))
        this.log.error('[Smartcar] POST %s → %s: %s', path, err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      throw err;
    }
  }

  // Request multiple signals in one call via POST /vehicles/:id/signals
  private async getSignals(vehicleId: string, signals: string[]): Promise<Record<string, SignalValue>> {
    try {
      const resp = await this.post<SignalsResponse>(`/vehicles/${vehicleId}/signals`, { signals });
      this.log.debug('[Smartcar] signals raw: %s', JSON.stringify(resp.data));
      return resp.data ?? {};
    } catch (err: unknown) {
      if (axios.isAxiosError(err))
        this.log.warn('[Smartcar] signals für %s nicht verfügbar: %s', vehicleId, err.response?.status);
      return {};
    }
  }

  async getVehicles(): Promise<JlrVehicleSummary[]> {
    const resp = await this.get<V3ConnectionsResponse>('/connections');
    this.log.info('[Smartcar] /connections: %d Verbindung(en)', resp.meta?.totalCount ?? resp.data?.length ?? 0);

    const connections = resp.data ?? [];
    if (connections.length === 0) {
      this.log.warn('[Smartcar] Keine Fahrzeuge. Bitte Connect-Flow erneut durchführen.');
      return [];
    }

    return Promise.all(connections.map(async (conn) => {
      const vehicleId = conn.relationships.vehicle.data.id;
      const attrs     = conn.attributes.vehicle;
      const perms     = conn.attributes.permissions;
      this.log.info('[Smartcar] Fahrzeug %s: %d %s %s | Berechtigungen: %s',
        vehicleId, attrs.year, attrs.make, attrs.model, perms.join(', '));

      // Try to get VIN via signals
      let vin = vehicleId;
      try {
        const sigVin = await this.getSignals(vehicleId, ['VehicleIdentification.Vin']);
        if (sigVin['VehicleIdentification.Vin']?.value)
          vin = sigVin['VehicleIdentification.Vin'].value as string;
      } catch { /* VIN nicht verfügbar */ }

      return { id: vehicleId, vin, nickname: `${attrs.year} ${attrs.make} ${attrs.model}`, model: attrs.model } as JlrVehicleSummary;
    }));
  }

  async getVehicleState(vehicleId: string, vin: string): Promise<JlrVehicleState> {
    // Request all signals we care about in a single call
    const signals = await this.getSignals(vehicleId, [
      'Charge.IsCharging',
      'TractionBattery.StateOfCharge.Displayed',
      'TractionBattery.Range',
      'InternalCombustionEngine.FuelLevel',
      'InternalCombustionEngine.FuelRange',
      'Location.Latitude',
      'Location.Longitude',
      'Motion.Speed',
      'Odometer.Distance',
      'Closure.IsLocked',
    ]);

    this.log.debug('[Smartcar] signals empfangen: %s', Object.keys(signals).join(', ') || 'keine');

    const num = (key: string): number | undefined => {
      const v = signals[key]?.value;
      return v !== undefined && v !== null ? Number(v) : undefined;
    };
    const bool = (key: string): boolean | undefined => {
      const v = signals[key]?.value;
      return v !== undefined && v !== null ? Boolean(v) : undefined;
    };

    // Battery
    const batteryRaw = num('TractionBattery.StateOfCharge.Displayed');
    const batteryLevel = batteryRaw !== undefined ? Math.round(batteryRaw) : undefined;

    // Range (V3 signals return km by default)
    const rangeRaw = num('TractionBattery.Range') ?? num('InternalCombustionEngine.FuelRange');
    const rangeKm  = rangeRaw !== undefined ? Math.round(rangeRaw) : undefined;

    // Fuel (ICE)
    const fuelRaw = num('InternalCombustionEngine.FuelLevel');
    const fuelLevelPercent = fuelRaw !== undefined ? Math.round(fuelRaw) : undefined;

    // Odometer
    const odomRaw = num('Odometer.Distance');
    const odometerKm = odomRaw !== undefined ? Math.round(odomRaw) : undefined;

    // Location
    const latitude  = num('Location.Latitude');
    const longitude = num('Location.Longitude');
    const speed     = num('Motion.Speed');
    const isMoving  = speed !== undefined ? speed > 2 : undefined;

    // Charging
    const charging = bool('Charge.IsCharging');

    // Lock status
    const isLockedRaw = bool('Closure.IsLocked');
    const isLocked = isLockedRaw ?? false;

    return {
      vin, isLocked, batteryLevel, charging,
      lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined,
      fuelLevelPercent, rangeKm, odometerKm,
      latitude, longitude, isMoving,
      lastUpdated: new Date().toISOString(),
    };
  }

  // V3 commands via POST /vehicles/:id/commands
  async lock(id: string): Promise<void> {
    await this.post(`/vehicles/${id}/commands`, { type: 'LOCK_DOORS' });
  }
  async unlock(id: string): Promise<void> {
    await this.post(`/vehicles/${id}/commands`, { type: 'UNLOCK_DOORS' });
  }
}
