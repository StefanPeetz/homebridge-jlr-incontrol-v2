//
// Smartcar API client for JLR InControl Homebridge plugin
//
// OAuth 2.0 flow:
//  1. User visits http://homebridge-ip:52625/auth  (one-time setup)
//  2. Redirect to Smartcar consent page
//  3. Smartcar redirects back to /callback with ?code=...
//  4. We exchange code for tokens and store them in tokenStore
//  5. Plugin uses refresh_token automatically from then on
//
// Re-auth notification:
//  - 7 days before refresh_token expires: HomeKit "Auth Required" sensor fires
//    + optional webhook POST to notifyWebhookUrl
//  - On actual refresh failure: same, plus OAuth server starts automatically
//

import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from 'homebridge';
import { SmartcarTokens, JlrVehicleSummary, JlrVehicleState } from './types';

const SMARTCAR_AUTH_URL   = 'https://connect.smartcar.com/oauth/authorize';
const SMARTCAR_TOKEN_URL  = 'https://auth.smartcar.com/oauth/token';
const SMARTCAR_API_BASE   = 'https://api.smartcar.com/v2.0';
const OAUTH_SERVER_PORT   = 52625;

// Smartcar refresh tokens expire after ~60 days.
// We warn 7 days before expiry so there is plenty of time to re-auth.
const REFRESH_TOKEN_TTL_MS      = 60 * 24 * 60 * 60 * 1000; // 60 days
const REAUTH_WARNING_THRESHOLD  =  7 * 24 * 60 * 60 * 1000; //  7 days

export class SmartcarClient {
  private http: AxiosInstance;
  private tokens?: SmartcarTokens;
  private tokenPath: string;
  private oauthServer?: http.Server;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly notifyWebhookUrl?: string;
  private readonly log: Logger;

  // Callback invoked whenever re-auth state changes.
  // true  = re-auth is required (HomeKit sensor should trip)
  // false = all good (sensor clears)
  public onReauthRequired?: (required: boolean) => void;

  constructor(params: {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    tokenStorePath: string;
    notifyWebhookUrl?: string;
    log: Logger;
  }) {
    this.clientId          = params.clientId;
    this.clientSecret      = params.clientSecret;
    this.redirectUri       = params.redirectUri ?? `http://localhost:${OAUTH_SERVER_PORT}/callback`;
    this.tokenPath         = params.tokenStorePath;
    this.notifyWebhookUrl  = params.notifyWebhookUrl;
    this.log               = params.log;
    this.http              = axios.create({ timeout: 30000 });
  }

  // ─── Token persistence ────────────────────────────────────────────────────

  private saveTokens(tokens: SmartcarTokens): void {
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
    this.tokens = tokens;
    this.log.info('[Smartcar] Tokens saved to %s', this.tokenPath);
  }

  private loadTokens(): SmartcarTokens | null {
    try {
      const raw = fs.readFileSync(this.tokenPath, 'utf-8');
      return JSON.parse(raw) as SmartcarTokens;
    } catch {
      return null;
    }
  }

  // ─── Re-auth warning ──────────────────────────────────────────────────────

  /**
   * Returns true if the refresh_token is less than REAUTH_WARNING_THRESHOLD away
   * from expiry (or already expired / missing).
   */
  needsReauth(): boolean {
    if (!this.tokens) return true;
    const refreshTokenExpiresAt =
      (this.tokens.refresh_token_obtained_at ?? (this.tokens.expires_at - 7200 * 1000))
      + REFRESH_TOKEN_TTL_MS;
    return refreshTokenExpiresAt - Date.now() < REAUTH_WARNING_THRESHOLD;
  }

  /** Days until re-auth is required (negative = already overdue). */
  daysUntilReauth(): number {
    if (!this.tokens) return 0;
    const refreshTokenExpiresAt =
      (this.tokens.refresh_token_obtained_at ?? (this.tokens.expires_at - 7200 * 1000))
      + REFRESH_TOKEN_TTL_MS;
    return Math.round((refreshTokenExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  }

  private async triggerReauthNotification(): Promise<void> {
    const days = this.daysUntilReauth();
    const authUrl = `http://localhost:${OAUTH_SERVER_PORT}/auth`;

    this.log.warn(
      '[Smartcar] ⚠️  Re-auth required in %d day(s). Open: %s',
      Math.max(0, days),
      authUrl,
    );

    // Trip HomeKit sensor
    this.onReauthRequired?.(true);

    // Optional webhook (e.g. ntfy.sh, Pushover, Home Assistant, n8n)
    if (this.notifyWebhookUrl) {
      try {
        await this.http.post(this.notifyWebhookUrl, {
          title:   'JLR InControl: Re-auth required',
          message: `Smartcar token expires in ${Math.max(0, days)} day(s). Open ${authUrl} to re-authorize.`,
          url:     authUrl,
          days,
        });
        this.log.info('[Smartcar] Webhook notification sent to %s', this.notifyWebhookUrl);
      } catch (err) {
        this.log.warn('[Smartcar] Webhook notification failed: %s', (err as Error).message);
      }
    }
  }

  // ─── Session management ───────────────────────────────────────────────────

  private isAccessTokenValid(): boolean {
    return !!(this.tokens && this.tokens.expires_at > Date.now() + 60_000);
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.tokens) {
      this.tokens = this.loadTokens() ?? undefined;
    }

    if (!this.tokens) {
      this.log.warn('[Smartcar] No tokens found – starting OAuth setup server...');
      await this.startOAuthFlow();
      return;
    }

    // Proactive warning: 7 days before refresh_token dies
    if (this.needsReauth()) {
      await this.triggerReauthNotification();
    } else {
      // Clear HomeKit sensor if everything is fine
      this.onReauthRequired?.(false);
    }

    if (!this.isAccessTokenValid()) {
      await this.refreshTokens();
    }
  }

  // ─── OAuth 2.0 flow ───────────────────────────────────────────────────────

  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     this.clientId,
      redirect_uri:  this.redirectUri,
      scope:         'required:read_vehicle_info read_vin read_charge read_battery read_fuel read_location read_odometer control_security',
      mode:          'live',
    });
    return `${SMARTCAR_AUTH_URL}?${params.toString()}`;
  }

  private startOAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      // If server already running (e.g. triggered twice), don't double-bind
      if (this.oauthServer?.listening) {
        return;
      }

      this.oauthServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_SERVER_PORT}`);

        if (url.pathname === '/auth') {
          const authUrl = this.buildAuthUrl();
          res.writeHead(302, { Location: authUrl });
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
              res.end(
                '<h2>✅ Smartcar connected!</h2>' +
                '<p>You can close this tab. Homebridge will continue automatically.</p>',
              );
              this.oauthServer?.close();
              // Clear the HomeKit alert
              this.onReauthRequired?.(false);
              resolve();
            })
            .catch(err => {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end('<h2>❌ Token exchange failed</h2><pre>' + err.message + '</pre>');
              reject(err);
            });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.oauthServer.listen(OAUTH_SERVER_PORT, () => {
        const authUrl = `http://localhost:${OAUTH_SERVER_PORT}/auth`;
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
        this.log.warn('[Smartcar] ACTION REQUIRED: Open this URL in your browser:');
        this.log.warn('[Smartcar]   %s', authUrl);
        this.log.warn('[Smartcar] ════════════════════════════════════════════════════');
      });
    });
  }

  private async exchangeCode(code: string): Promise<void> {
    this.log.info('[Smartcar] Exchanging auth code for tokens...');
    const resp = await this.http.post(
      SMARTCAR_TOKEN_URL,
      new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
      {
        auth: { username: this.clientId, password: this.clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    this.saveTokens({
      access_token:                resp.data.access_token,
      refresh_token:               resp.data.refresh_token,
      expires_at:                  Date.now() + (resp.data.expires_in ?? 7200) * 1000,
      refresh_token_obtained_at:   Date.now(),
    });
  }

  private async refreshTokens(): Promise<void> {
    if (!this.tokens?.refresh_token) throw new Error('No refresh token available');
    this.log.info('[Smartcar] Refreshing access token...');

    try {
      const resp = await this.http.post(
        SMARTCAR_TOKEN_URL,
        new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: this.tokens.refresh_token,
        }),
        {
          auth: { username: this.clientId, password: this.clientSecret },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      this.saveTokens({
        access_token:              resp.data.access_token,
        refresh_token:             resp.data.refresh_token ?? this.tokens.refresh_token,
        expires_at:                Date.now() + (resp.data.expires_in ?? 7200) * 1000,
        // Only reset the clock if Smartcar issued a new refresh_token
        refresh_token_obtained_at: resp.data.refresh_token
          ? Date.now()
          : this.tokens.refresh_token_obtained_at,
      });
    } catch (err) {
      this.log.error('[Smartcar] Token refresh failed – starting re-auth...');
      this.tokens = undefined;
      fs.rmSync(this.tokenPath, { force: true });
      await this.triggerReauthNotification();
      await this.startOAuthFlow();
      throw err;
    }
  }

  // ─── API helpers ──────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.tokens!.access_token}` };
  }

  private async get<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();
    const resp = await this.http.get<T>(`${SMARTCAR_API_BASE}${path}`, {
      headers: this.authHeaders(),
    });
    return resp.data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensureAuthenticated();
    const resp = await this.http.post<T>(`${SMARTCAR_API_BASE}${path}`, body, {
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    });
    return resp.data;
  }

  // ─── Vehicle queries ──────────────────────────────────────────────────────

  async getVehicles(): Promise<JlrVehicleSummary[]> {
    const data = await this.get<{ vehicles: string[] }>('/vehicles');
    const ids = data.vehicles ?? [];

    const summaries = await Promise.all(
      ids.map(async (id) => {
        try {
          const info = await this.get<{
            make: string; model: string; year: number; id: string; vin?: string;
          }>(`/vehicles/${id}`);
          const vinData = await this.get<{ vin: string }>(`/vehicles/${id}/vin`);
          return {
            id,
            vin:      vinData.vin,
            nickname: `${info.year} ${info.make} ${info.model}`,
            model:    info.model,
          } as JlrVehicleSummary;
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
      this.get<{
        isPluggedIn: boolean; state: string;
        battery?: { percentRemaining: number; range: { value: number; unit: string } };
        fuel?:    { percentRemaining: number; range: { value: number; unit: string } };
      }>(`/vehicles/${vehicleId}/charge`),
      this.get<{ latitude: number; longitude: number; speed?: { value: number } }>(
        `/vehicles/${vehicleId}/location`,
      ),
      this.get<{ distance: { value: number; unit: string } }>(`/vehicles/${vehicleId}/odometer`),
    ]);

    let batteryLevel: number | undefined;
    let charging: boolean | undefined;
    let fuelLevelPercent: number | undefined;
    let rangeKm: number | undefined;

    if (chargeRes.status === 'fulfilled') {
      const c = chargeRes.value;
      charging = c.state === 'CHARGING';
      if (c.battery) {
        batteryLevel = Math.round(c.battery.percentRemaining * 100);
        const rv = c.battery.range.value;
        rangeKm = c.battery.range.unit === 'miles' ? Math.round(rv * 1.60934) : Math.round(rv);
      }
      if (c.fuel) fuelLevelPercent = Math.round(c.fuel.percentRemaining * 100);
    }

    let latitude: number | undefined;
    let longitude: number | undefined;
    let isMoving: boolean | undefined;
    if (locationRes.status === 'fulfilled') {
      latitude  = locationRes.value.latitude;
      longitude = locationRes.value.longitude;
      isMoving  = (locationRes.value.speed?.value ?? 0) > 2;
    }

    let odometerKm: number | undefined;
    if (odometerRes.status === 'fulfilled') {
      const d = odometerRes.value.distance;
      odometerKm = d.unit === 'miles' ? Math.round(d.value * 1.60934) : Math.round(d.value);
    }

    let isLocked = false;
    try {
      const sec = await this.get<{ isLocked: boolean }>(`/vehicles/${vehicleId}/security`);
      isLocked = sec.isLocked;
    } catch {
      this.log.debug('[Smartcar] security endpoint not available for this vehicle');
    }

    return {
      vin, isLocked, batteryLevel, charging,
      lowBattery: batteryLevel !== undefined ? batteryLevel < 20 : undefined,
      fuelLevelPercent, rangeKm, odometerKm,
      latitude, longitude, isMoving,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async lock(vehicleId: string): Promise<void> {
    await this.post(`/vehicles/${vehicleId}/security`, { action: 'LOCK' });
  }

  async unlock(vehicleId: string): Promise<void> {
    await this.post(`/vehicles/${vehicleId}/security`, { action: 'UNLOCK' });
  }
}
