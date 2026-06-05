import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as fs from 'fs';
import { Logger } from 'homebridge';
import { SmartcarSession, JlrVehicleSummary, JlrVehicleState } from './types';

// ─── Smartcar V3 endpoints ────────────────────────────────────────────────────
const SMARTCAR_CONNECT_URL = 'https://connect.smartcar.com/oauth/authorize';
const SMARTCAR_TOKEN_URL   = 'https://auth.smartcar.com/oauth/token';   // Connect code exchange
const SMARTCAR_IAM_URL     = 'https://iam.smartcar.com/oauth2/token';   // V3 client_credentials
const SMARTCAR_API_BASE    = 'https://vehicle.api.smartcar.com/v3';     // V3 API
const OAUTH_SERVER_PORT    = 52625;

const APP_TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000;

export class SmartcarClient {
  private http: AxiosInstance;
  private session?: SmartcarSession;
  private readonly sessionPath: string;
  private oauthServer?: http.Server;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly hostIp: string;
  private readonly notifyWebhookUrl?: string;
  private readonly log: Logger;

  public onReauthRequired?: (required: boolean) => void;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    hostIp?: string;
    redirectUri?: string;
    tokenStorePath: string;
    notifyWebhookUrl?: string;
    log: Logger;
  }) {
    this.clientId     = params.clientId;
    this.clientSecret = params.clientSecret;
    this.hostIp       = params.hostIp ?? 'localhost';
    this.redirectUri  = params.redirectUri
      ?? `http://${this.hostIp}:${OAUTH_SERVER_PORT}/callback`;
    this.sessionPath      = params.tokenStorePath;
    this.notifyWebhookUrl = params.notifyWebhookUrl;
    this.log              = params.log;
    this.http             = axios.create({ timeout: 30000 });
  }

  // ─── Session persistence ──────────────────────────────────────────────────

  private saveSession(session: SmartcarSession): void {
    const toSave: SmartcarSession = { userId: session.userId };
    fs.writeFileSync(this.sessionPath, JSON.stringify(toSave, null, 2), 'utf-8');
    this.session = session;
    this.log.info('[Smartcar] Session saved (userId: %s)', session.userId);
  }

  private loadSession(): SmartcarSession | null {
    try {
      return JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8')) as SmartcarSession;
    } catch { return null; }
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
    if (this.session) {
      this.session.appToken          = resp.data.access_token;
      this.session.appTokenExpiresAt = Date.now() + expiresIn * 1000;
    }
    this.log.info('[Smartcar] App token valid for %ds', expiresIn);
    return resp.data.access_token as string;
  }

  private async getAppToken(): Promise<string> {
    if (
      this.session?.appToken &&
      this.session.appTokenExpiresAt &&
      this.session.appTokenExpiresAt - Date.now() > APP_TOKEN_TTL_BUFFER_MS
    ) {
      return this.session.appToken;
    }
    return this.fetchAppToken();
  }

  // ─── Session management ───────────────────────────────────────────────────

  async ensureAuthenticated(): Promise<void> {
    if (!this.session) this.session = this.loadSession() ?? undefined;

    if (!this.session?.userId) {
      this.log.warn('[Smartcar] No userId – starting OAuth Connect flow...');
      this.onReauthRequired?.(true);
      await this.startOAuthFlow();
      return;
    }

    await this.getAppToken();
    this.onReauthRequired?.(false);
  }

  needsReauth(): boolean {
    return !this.session?.userId;
  }

  // ─── OAuth Connect flow (one-time, to obtain userId) ───────────────────────

  private buildConnectUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     this.clientId,
      redirect_uri:  this.redirectUri,
      scope:         'required:read_vehicle_info read_vin read_charge read_battery read_fuel read_location read_odometer control_security',
      mode:          'live',
    });
    return `${SMARTCAR_CONNECT_URL}?${params.toString()}`;
  }

  private startOAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.oauthServer?.listening) return;

      this.oauthServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_SERVER_PORT}`);

        if (url.pathname === '/auth') {
          res.writeHead(302, { Location: this.buildConnectUrl() });
          res.end();
          return;
        }

        if (url.pathname === '/callback') {
          const code   = url.searchParams.get('code');
          const userId = url.searchParams.get('userId');
          const error  = url.searchParams.get('error');

          if (error || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h2>❌ Auth failed: ' + (error ?? 'no code') + '</h2>');
            reject(new Error('OAuth error: ' + error));
            return;
          }

          this.exchangeCode(code, userId ?? undefined)
            .then(() => {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<h2>✅ Smartcar connected!</h2><p>You can close this tab.</p>');
              this.oauthServer?.close();
              this.onReauthRequired?.(false);
              resolve();
            })
            .catch(err => {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end('<h2>❌ Auth failed</h2><pre>' + (err as Error).message + '</pre>');
              reject(err);
            });
          return;
        }

        res.writeHead(404); res.end();
      });

      this.oauthServer.listen(OAUTH_SERVER_PORT, () => {
        const authUrl = `http://${this.hostIp}:${OAUTH_SERVER_PORT}/auth`;
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
        this.log.warn('[Smartcar] EINMALIG: Browser öffnen:');
        this.log.warn('[Smartcar]   %s', authUrl);
        this.log.warn('[Smartcar] Danach läuft alles automatisch.');
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
      });
    });
  }

  private async exchangeCode(code: string, userIdFromCallback?: string): Promise<void> {
    this.log.info('[Smartcar] Exchanging Connect code for userId...');
    const resp = await this.http.post(
      SMARTCAR_TOKEN_URL,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri }),
      { auth: { username: this.clientId, password: this.clientSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const userId = userIdFromCallback ?? resp.data.user_id ?? resp.data.userId;
    if (!userId) throw new Error('No userId in Connect response — check your Smartcar app is on V3');

    this.saveSession({ userId });
    await this.fetchAppToken();
  }

  // ─── API helpers (V3) ─────────────────────────────────────────────────────

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAppToken();
    return {
      'Authorization': `Bearer ${token}`,
      'sc-user-id':    this.session!.userId,
    };
  }

  private async get<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();
    return (await this.http.get<T>(`${SMARTCAR_API_BASE}${path}`, {
      headers: await this.authHeaders(),
    })).data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensureAuthenticated();
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
