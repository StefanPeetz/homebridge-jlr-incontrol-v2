import {
  API, DynamicPlatformPlugin, Logger, PlatformAccessory,
  PlatformConfig, Service, Characteristic,
} from 'homebridge';
import * as http from 'http';
import { SmartcarClient } from './smartcar-client';
import { SmartcarConfig, JlrVehicleSummary } from './types';
import { JlrAccessory } from './accessory';
import { startCallbackServer, CALLBACK_PORT, CALLBACK_PATH } from './connect-server';

const PLUGIN_NAME   = 'homebridge-jlr-smartcar';
const PLATFORM_NAME = 'JlrSmartcarPlatform';
const STORAGE_KEY   = 'smartcar_user_id';

export class JlrSmartcarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  private readonly cfg: SmartcarConfig;
  private readonly client: SmartcarClient;
  private callbackServer?: http.Server;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.cfg            = config as unknown as SmartcarConfig;

    // Validate required fields
    if (!this.cfg.clientId || !this.cfg.clientSecret) {
      this.log.error(
        '[JLR InControl] ❌ clientId und clientSecret sind Pflichtfelder. ' +
        'Öffne dashboard.smartcar.com → Configuration.',
      );
    }

    // Restore persisted userId (saved after first Connect)
    const storedUserId = this.loadUserId();
    const initialUserId = this.cfg.userId || storedUserId || undefined;
    if (initialUserId) {
      this.log.info('[JLR InControl] Gespeicherte userId geladen: %s', initialUserId);
    }

    this.client = new SmartcarClient({
      clientId:     this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      userId:       initialUserId,
      log:          this.log,
    });

    this.log.info('[JLR InControl] Plattform initialisiert.');

    this.api.on('didFinishLaunching', () => this.onFinishLaunching());
    this.api.on('shutdown', () => this.callbackServer?.close());
  }

  // ─── Homebridge lifecycle ────────────────────────────────────────────────

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private async onFinishLaunching(): Promise<void> {
    if (!this.client.hasUserId()) {
      this.log.warn(
        '[JLR InControl] Kein userId gefunden. ' +
        'Bitte verbinde dein Fahrzeug über das Homebridge UI (Plugin-Einstellungen → "Fahrzeug verbinden").',
      );
      await this.startConnectServer();
      return;
    }
    await this.discoverDevices();
  }

  // ─── Smartcar Connect callback server ───────────────────────────────────

  async startConnectServer(): Promise<void> {
    if (this.callbackServer) return;
    try {
      this.callbackServer = await startCallbackServer(this.log, async (userId) => {
        this.client.setUserId(userId);
        this.saveUserId(userId);
        this.callbackServer = undefined;
        await this.discoverDevices();
      });
    } catch (err) {
      this.log.error('[JLR InControl] Callback-Server konnte nicht gestartet werden: %s', (err as Error).message);
    }
  }

  getConnectUrl(): string {
    const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;
    return this.client.buildConnectUrl(redirectUri, 'live');
  }

  isWaitingForConnect(): boolean {
    return !!this.callbackServer;
  }

  // ─── Device discovery ────────────────────────────────────────────────────

  private async discoverDevices(): Promise<void> {
    try {
      await this.client.ensureAuthenticated();
      const vehicles = await this.client.getVehicles();
      this.log.info('[JLR InControl] %d Fahrzeug(e) gefunden', vehicles.length);

      // Remove stale accessories
      const activeUuids = new Set(vehicles.map(v =>
        this.api.hap.uuid.generate(v.id),
      ));
      this.accessories
        .filter(a => !activeUuids.has(a.UUID))
        .forEach(a => {
          this.log.info('[JLR InControl] Entferne veraltetes Zubehör: %s', a.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [a]);
        });

      for (const vehicle of vehicles) {
        this.registerOrUpdateVehicle(vehicle);
      }
    } catch (err) {
      this.log.error('[JLR InControl] Fahrzeug-Discovery fehlgeschlagen: %s', (err as Error).message);
    }
  }

  private registerOrUpdateVehicle(vehicle: JlrVehicleSummary): void {
    const uuid      = this.api.hap.uuid.generate(vehicle.id);
    const existing  = this.accessories.find(a => a.UUID === uuid);
    const pollMs    = Math.max(30, this.cfg.pollIntervalSeconds ?? 60) * 1000;

    if (existing) {
      this.log.info('[JLR InControl] Fahrzeug bereits bekannt: %s', vehicle.nickname);
      new JlrAccessory(this, existing, this.client, pollMs);
    } else {
      this.log.info('[JLR InControl] Neues Fahrzeug registriert: %s', vehicle.nickname);
      const accessory = new this.api.platformAccessory(vehicle.nickname, uuid);
      accessory.context.vehicle = vehicle;
      new JlrAccessory(this, accessory, this.client, pollMs);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  // ─── userId persistence ──────────────────────────────────────────────────

  private userIdPath(): string {
    // Store next to homebridge config
    return require('path').join(
      this.api.user?.storagePath?.() ?? process.cwd(),
      '.smartcar_user_id',
    );
  }

  private saveUserId(id: string): void {
    try {
      require('fs').writeFileSync(this.userIdPath(), id, 'utf8');
    } catch (e) {
      this.log.warn('[JLR InControl] userId konnte nicht gespeichert werden: %s', (e as Error).message);
    }
  }

  private loadUserId(): string | undefined {
    try {
      return require('fs').readFileSync(this.userIdPath(), 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
