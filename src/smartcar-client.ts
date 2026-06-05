import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as fs from 'fs';
import { Logger } from 'homebridge';
import { SmartcarTokens, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_AUTH_URL   = 'https://connect.smartcar.com/oauth/authorize';
const SMARTCAR_TOKEN_URL  = 'https://auth.smartcar.com/oauth/token';
const SMARTCAR_API_BASE   = 'https://api.smartcar.com/v2.0';
const OAUTH_SERVER_PORT   = 52625;

const REFRESH_TOKEN_TTL_MS     = 60 * 24 * 60 * 60 * 1000;
const REAUTH_WARNING_THRESHOLD =  7 * 24 * 60 * 60 * 1000;

export class SmartcarClient {
  private http: AxiosInstance;
  private tokens?: SmartcarTokens;
  private tokenPath: string;
  private oauthServer?: http.Server;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly hostIp: string;
  private readonly mode: 'test' | 'live';
  private readonly notifyWebhookUrl?: string;
  private readonly log: Logger;

  public onReauthRequired?: (required: boolean) => void;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    hostIp?: string;
    redirectUri?: string;
    mode?: 'test' | 'live';
    tokenStorePath: string;
    notifyWebhookUrl?: string;
    log: Logger;
  }) {
    this.clientId     = params.clientId;
    this.clientSecret = params.clientSecret;
    this.hostIp       = params.hostIp ?? 'localhost';
    this.mode         = params.mode ?? 'live';  // Smartcar uses 'live' by default
    this.redirectUri  = params.redirectUri
      ?? `http://${this.hostIp}:${OAUTH_SERVER_PORT}/callback`;
    this.tokenPath        = params.tokenStorePath;
    this.notifyWebhookUrl = params.notifyWebhookUrl;
    this.log              = params.log;
    this.http             = axios.create({ timeout: 30000 });
  }

  // ─── Token persistence ────────────────────────────────────────────────────

  private saveTokens(tokens: SmartcarTokens): void {
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
    this.tokens = tokens;
    this.log.info('[Smartcar] Tokens saved to %s', this.tokenPath);
  }

  private loadTokens(): SmartcarTokens | null {
    try {
      return JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8')) as SmartcarTokens;
    } catch { return null; }
  }

  // ─── Re-auth warning ──────────────────────────────────────────────────────

  needsReauth(): boolean {
    if (!this.tokens) return true;
    const exp = (this.tokens.refresh_token_obtained_at ?? (this.tokens.expires_at - 7200 * 1000)) + REFRESH_TOKEN_TTL_MS;
    return exp - Date.now() < REAUTH_WARNING_THRESHOLD;
  }

  daysUntilReauth(): number {
    if (!this.tokens) return 0;
    const exp = (this.tokens.refresh_token_obtained_at ?? (this.tokens.expires_at - 7200 * 1000)) + REFRESH_TOKEN_TTL_MS;
    return Math.round((exp - Date.now()) / (24 * 60 * 60 * 1000));
  }

  private async triggerReauthNotification(): Promise<void> {
    const days    = this.daysUntilReauth();
    const authUrl = `http://${this.hostIp}:${OAUTH_SERVER_PORT}/auth`;
    this.log.warn('[Smartcar] ⚠️  Re-auth required in %d day(s). Open: %s', Math.max(0, days), authUrl);
    this.onReauthRequired?.(true);
    if (this.notifyWebhookUrl) {
      try {
        await this.http.post(this.notifyWebhookUrl, {
          title: 'JLR InControl: Re-auth required',
          message: `Token expires in ${Math.max(0, days)} day(s). Open ${authUrl}`,
          url: authUrl, days,
        });
      } catch (err) {
        this.log.warn('[Smartcar] Webhook failed: %s', (err as Error).message);
      }
    }
  }

  // ─── Session management ───────────────────────────────────────────────────

  private isAccessTokenValid(): boolean {
    return !!(this.tokens && this.tokens.expires_at > Date.now() + 60_000);
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.tokens) this.tokens = this.loadTokens() ?? undefined;
    if (!this.tokens) {
      this.log.warn('[Smartcar] No tokens – starting OAuth flow...');
      await this.startOAuthFlow();
      return;
    }
    if (this.needsReauth()) await this.triggerReauthNotification();
    else this.onReauthRequired?.(false);
    if (!this.isAccessTokenValid()) await this.refreshTokens();
  }

  // ─── OAuth 2.0 flow ───────────────────────────────────────────────────────

  private buildAuthUrl(): string {
    // Smartcar Connect uses 'application_id' (not 'client_id') in the authorize URL
    const params = new URLSearchParams({
      response_type:  'code',
      application_id: this.clientId,
      redirect_uri:   this.redirectUri,
      scope:          'required:read_vehicle_info read_vin read_charge read_battery read_fuel read_location read_odometer control_security',
      mode:           this.mode,
    });
    return `${SMARTCAR_AUTH_URL}?${params.toString()}`;
  }

  private startOAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.oauthServer?.listening) return;

      this.oauthServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_SERVER_PORT}`);

        if (url.pathname === '/auth') {
          res.writeHead(302, { Location: this.buildAuthUrl() });
          res.end();
          return;
        }

        if (url.pathname === '/callback') {
          const code  = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          if (error || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h2>❌ Auth failed: ' + (error ?? 'no code') + '</h2>');
            reject(new Error('OAuth error: ' + error));
            return;
          }
          this.exchangeCode(code)
            .then(() => {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<h2>✅ Smartcar connected!</h2><p>You can close this tab.</p>');
              this.oauthServer?.close();
              this.onReauthRequired?.(false);
              resolve();
            })
            .catch(err => {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end('<h2>❌ Token exchange failed</h2><pre>' + (err as Error).message + '</pre>');
              reject(err);
            });
          return;
        }

        res.writeHead(404); res.end();
      });

      this.oauthServer.listen(OAUTH_SERVER_PORT, () => {
        const authUrl = `http://${this.hostIp}:${OAUTH_SERVER_PORT}/auth`;
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
        this.log.warn('[Smartcar] ACTION REQUIRED: Open this URL in your browser:');
        this.log.warn('[Smartcar]   %s  (mode: %s)', authUrl, this.mode);
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
      });
    });
  }

  private async exchangeCode(code: string): Promise<void> {
    this.log.info('[Smartcar] Exchanging auth code...');
    // Token exchange still uses client_id (HTTP Basic Auth)
    const resp = await this.http.post(
      SMARTCAR_TOKEN_URL,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri }),
      { auth: { username: this.clientId, password: this.clientSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.saveTokens({
      access_token:              resp.data.access_token,
      refresh_token:             resp.data.refresh_token,
      expires_at:                Date.now() + (resp.data.expires_in ?? 7200) * 1000,
      refresh_token_obtained_at: Date.now(),
    });
  }

  private async refreshTokens(): Promise<void> {
    if (!this.tokens?.refresh_token) throw new Error('No refresh token');
    this.log.info('[Smartcar] Refreshing access token...');
    try {
      const resp = await this.http.post(
        SMARTCAR_TOKEN_URL,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token }),
        { auth: { username: this.clientId, password: this.clientSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      this.saveTokens({
        access_token:              resp.data.access_token,
        refresh_token:             resp.data.refresh_token ?? this.tokens.refresh_token,
        expires_at:                Date.now() + (resp.data.expires_in ?? 7200) * 1000,
        refresh_token_obtained_at: resp.data.refresh_token ? Date.now() : this.tokens.refresh_token_obtained_at,
      });
    } catch (err) {
      this.log.error('[Smartcar] Refresh failed – re-auth needed');
      this.tokens = undefined;
      fs.rmSync(this.tokenPath, { force: true });
      await this.triggerReauthNotification();
      await this.startOAuthFlow();
      throw err;
    }
  }

  // ─── API helpers ──────────────────────────────────────────────────────────

  private authHeaders() { return { Authorization: `Bearer ${this.tokens!.access_token}` }; }

  private async get<T>(p: string): Promise<T> {
    await this.ensureAuthenticated();
    return (await this.http.get<T>(`${SMARTCAR_API_BASE}${p}`, { headers: this.authHeaders() })).data;
  }

  private async post<T>(p: string, body: unknown): Promise<T> {
    await this.ensureAuthenticated();
    return (await this.http.post<T>(`${SMARTCAR_API_BASE}${p}`, body, {
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
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
