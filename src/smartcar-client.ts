import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { SmartcarSession, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_IAM_URL  = 'https://iam.smartcar.com/oauth2/token';
const SMARTCAR_API_BASE = 'https://vehicle.api.smartcar.com/v3';
const CONNECT_BASE      = 'https://connect.smartcar.com';
const TOKEN_TTL_BUFFER  = 5 * 60 * 1000;

// Smartcar plan capability tiers
// 'free'    → only read_vehicle_info (make/model/year)
// 'basic'   → + read_vin, read_odometer
// 'standard'→ + read_location, read_charge, read_fuel
// 'full'    → + control_security (lock/unlock commands)
export type SmartcarPlan = 'auto' | 'free' | 'basic' | 'standard' | 'full';

// Permissions each plan level requires (cumulative)
const PLAN_PERMISSIONS: Record<Exclude<SmartcarPlan, 'auto'>, string[]> = {
  free:     ['read_vehicle_info'],
  basic:    ['read_vehicle_info', 'read_vin', 'read_odometer'],
  standard: ['read_vehicle_info', 'read_vin', 'read_odometer', 'read_location', 'read_charge', 'read_fuel'],
  full:     ['read_vehicle_info', 'read_vin', 'read_odometer', 'read_location', 'read_charge', 'read_fuel', 'control_security'],
};

// Signals available per plan level
const PLAN_SIGNALS: Record<Exclude<SmartcarPlan, 'auto'>, string[]> = {
  free:     [],
  basic:    ['VehicleIdentification.Vin', 'Odometer.Distance'],
  standard: ['VehicleIdentification.Vin', 'Odometer.Distance', 'Location.Latitude', 'Location.Longitude',
             'Motion.Speed', 'Charge.IsCharging', 'TractionBattery.StateOfCharge.Displayed',
             'TractionBattery.Range', 'InternalCombustionEngine.FuelLevel', 'InternalCombustionEngine.FuelRange'],
  full:     ['VehicleIdentification.Vin', 'Odometer.Distance', 'Location.Latitude', 'Location.Longitude',
             'Motion.Speed', 'Charge.IsCharging', 'TractionBattery.StateOfCharge.Displayed',
             'TractionBattery.Range', 'InternalCombustionEngine.FuelLevel', 'InternalCombustionEngine.FuelRange',
             'Closure.IsLocked'],
};

function detectPlanFromPermissions(perms: string[]): Exclude<SmartcarPlan, 'auto'> {
  const has = (p: string) => perms.includes(p);
  if (has('control_security')) return 'full';
  if (has('read_location') || has('read_charge') || has('read_fuel')) return 'standard';
  if (has('read_vin') || has('read_odometer')) return 'basic';
  return 'free';
}

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
interface SignalValue { value: unknown; unit?: string; timestamp?: string; }
type SignalsResponse = { data: Record<string, SignalValue> };

export class SmartcarClient {
  private http: AxiosInstance;
  private session: SmartcarSession = {};

  readonly applicationId: string;
  readonly clientId: string;
  private readonly clientSecret: string;
  private readonly log: Logger;
  private userId?: string;
  private readonly planOverride: SmartcarPlan;

  // Per-vehicle detected plan cache
  private vehiclePlans = new Map<string, Exclude<SmartcarPlan, 'auto'>>();

  constructor(params: {
    applicationId: string;
    clientId: string;
    clientSecret: string;
    userId?: string;
    smartcarPlan?: SmartcarPlan;
    log: Logger;
  }) {
    this.applicationId = params.applicationId;
    this.clientId      = params.clientId;
    this.clientSecret  = params.clientSecret;
    this.userId        = params.userId;
    this.planOverride  = params.smartcarPlan ?? 'auto';
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
    const resp = await this.http.post(
      SMARTCAR_IAM_URL,
      new URLSearchParams({ grant_type: 'client_credentials' }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${basicAuth}` } },
    ).catch(err => {
      if (axios.isAxiosError(err))
        this.log.error('[Smartcar] Token-Fehler %s: %s', err.response?.status, JSON.stringify(err.response?.data ?? err.message));
      throw err;
    });
    const expiresIn: number = resp.data.expires_in ?? 3600;
    this.session.appToken          = resp.data.access_token;
    this.session.appTokenExpiresAt = Date.now() + expiresIn * 1000;
    this.log.info('[Smartcar] App-Token gültig für %ds', expiresIn);
    return resp.data.access_token as string;
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
    return this.http.get<T>(`${SMARTCAR_API_BASE}${path}`, { headers: await this.authHeaders() })
      .then(r => r.data)
      .catch(err => {
        if (axios.isAxiosError(err))
          this.log.error('[Smartcar] GET %s → %s: %s', path, err.response?.status, JSON.stringify(err.response?.data ?? err.message));
        throw err;
      });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.http.post<T>(`${SMARTCAR_API_BASE}${path}`, body, {
      headers: { ...await this.authHeaders(), 'Content-Type': 'application/json' },
    }).then(r => r.data)
      .catch(err => {
        if (axios.isAxiosError(err))
          this.log.error('[Smartcar] POST %s → %s: %s', path, err.response?.status, JSON.stringify(err.response?.data ?? err.message));
        throw err;
      });
  }

  private async getSignals(vehicleId: string, signals: string[]): Promise<Record<string, SignalValue>> {
    if (signals.length === 0) return {};
    return this.post<SignalsResponse>(`/vehicles/${vehicleId}/signals`, { signals })
      .then(r => r.data ?? {})
      .catch(() => ({}));
  }

  private getEffectivePlan(vehicleId: string): Exclude<SmartcarPlan, 'auto'> {
    if (this.planOverride !== 'auto') return this.planOverride;
    return this.vehiclePlans.get(vehicleId) ?? 'free';
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

      // Detect or override plan
      const detectedPlan = detectPlanFromPermissions(perms);
      const effectivePlan = this.planOverride !== 'auto' ? this.planOverride : detectedPlan;
      this.vehiclePlans.set(vehicleId, effectivePlan);

      this.log.info(
        '[Smartcar] Fahrzeug %s: %d %s %s | Berechtigungen: %s | Plan erkannt: %s%s',
        vehicleId, attrs.year, attrs.make, attrs.model,
        perms.join(', '),
        detectedPlan,
        this.planOverride !== 'auto' ? ` (Override: ${this.planOverride})` : '',
      );

      if (effectivePlan === 'free') {
        this.log.warn(
          '[Smartcar] Fahrzeug %s hat nur \'read_vehicle_info\'. ' +
          'Fahrzeugdaten (Location, Fuel, Lock) nicht verfügbar. ' +
          'Smartcar-Plan upgraden oder Fahrzeug neu verbinden.',
          vehicleId,
        );
      }

      // Fetch VIN via signals if plan allows
      let vin = vehicleId;
      const vinSignals = PLAN_SIGNALS[effectivePlan];
      if (vinSignals.includes('VehicleIdentification.Vin')) {
        const s = await this.getSignals(vehicleId, ['VehicleIdentification.Vin']);
        if (s['VehicleIdentification.Vin']?.value) vin = s['VehicleIdentification.Vin'].value as string;
      }

      return { id: vehicleId, vin, nickname: `${attrs.year} ${attrs.make} ${attrs.model}`, model: attrs.model } as JlrVehicleSummary;
    }));
  }

  async getVehicleState(vehicleId: string, vin: string): Promise<JlrVehicleState> {
    const plan    = this.getEffectivePlan(vehicleId);
    const signals = PLAN_SIGNALS[plan];

    if (signals.length === 0) {
      // Free plan: no signals available
      this.log.debug('[Smartcar] %s: Free-Plan, keine Signal-Daten verfügbar', vehicleId);
      return { vin, isLocked: false, lastUpdated: new Date().toISOString() };
    }

    const data = await this.getSignals(vehicleId, signals);
    this.log.debug('[Smartcar] signals empfangen für %s: %s', vehicleId, Object.keys(data).join(', ') || 'keine');

    const num  = (k: string) => { const v = data[k]?.value; return v != null ? Number(v)  : undefined; };
    const bool = (k: string) => { const v = data[k]?.value; return v != null ? Boolean(v) : undefined; };

    const batteryLevel     = num('TractionBattery.StateOfCharge.Displayed') !== undefined ? Math.round(num('TractionBattery.StateOfCharge.Displayed')!) : undefined;
    const rangeKm          = (() => { const r = num('TractionBattery.Range') ?? num('InternalCombustionEngine.FuelRange'); return r !== undefined ? Math.round(r) : undefined; })();
    const fuelLevelPercent = num('InternalCombustionEngine.FuelLevel') !== undefined ? Math.round(num('InternalCombustionEngine.FuelLevel')!) : undefined;
    const odometerKm       = num('Odometer.Distance') !== undefined ? Math.round(num('Odometer.Distance')!) : undefined;
    const latitude         = num('Location.Latitude');
    const longitude        = num('Location.Longitude');
    const speed            = num('Motion.Speed');
    const isMoving         = speed !== undefined ? speed > 2 : undefined;
    const charging         = bool('Charge.IsCharging');
    const isLocked         = bool('Closure.IsLocked') ?? false;

    return {
      vin, isLocked, batteryLevel, charging,
      lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined,
      fuelLevelPercent, rangeKm, odometerKm,
      latitude, longitude, isMoving,
      lastUpdated: new Date().toISOString(),
    };
  }

  async lock(id: string):   Promise<void> { await this.post(`/vehicles/${id}/commands`, { type: 'LOCK_DOORS' }); }
  async unlock(id: string): Promise<void> { await this.post(`/vehicles/${id}/commands`, { type: 'UNLOCK_DOORS' }); }
}
