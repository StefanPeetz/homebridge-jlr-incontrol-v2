import {
  API, DynamicPlatformPlugin, Logger, PlatformAccessory,
  PlatformConfig, Service, Characteristic,
} from 'homebridge';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { SmartcarClient } from './smartcar-client';
import { SmartcarConfig, JlrVehicleSummary } from './types';
import { JlrAccessory } from './accessory';
import { startCallbackServer, REDIRECT_URI } from './connect-server';

const PLUGIN_NAME   = 'homebridge-jlr-smartcar';
const PLATFORM_NAME = 'JlrSmartcarPlatform';

export class JlrSmartcarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  private readonly cfg: SmartcarConfig;
  readonly client: SmartcarClient;
  private callbackServer?: http.Server;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.cfg            = config as unknown as SmartcarConfig;

    if (!this.cfg.clientId || !this.cfg.clientSecret) {
      this.log.error(
        '[JLR InControl] ❌ clientId und clientSecret sind Pflichtfelder. ' +
        'Öffne dashboard.smartcar.com → Configuration.',
      );
    }

    const storedUserId  = this.loadUserId();
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

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private async onFinishLaunching(): Promise<void> {
    if (!this.client.hasUserId()) {
      this.log.warn(
        '[JLR InControl] Kein userId gefunden. ' +
        'Bitte verbinde dein Fahrzeug über das Homebridge UI (Plugin-Einstellungen → "Fahrzeug verbinden").',
      );
      this.log.info('[JLR InControl] Redirect URI für Smartcar Dashboard: %s', REDIRECT_URI);
      await this.startConnectServer();
      return;
    }
    await this.discoverDevices();
  }

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
      this.log.error('[JLR InControl] Callback-Server Fehler: %s', (err as Error).message);
    }
  }

  getConnectUrl(): string {
    return this.client.buildConnectUrl(REDIRECT_URI, 'live');
  }

  isWaitingForConnect(): boolean {
    return !!this.callbackServer;
  }

  private async discoverDevices(): Promise<void> {
    try {
      await this.client.ensureAuthenticated();
      const vehicles = await this.client.getVehicles();
      this.log.info('[JLR InControl] %d Fahrzeug(e) gefunden', vehicles.length);

      const activeUuids = new Set(vehicles.map(v => this.api.hap.uuid.generate(v.id)));
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
      this.log.error('[JLR InControl] Discovery fehlgeschlagen: %s', (err as Error).message);
    }
  }

  private registerOrUpdateVehicle(vehicle: JlrVehicleSummary): void {
    const uuid     = this.api.hap.uuid.generate(vehicle.id);
    const existing = this.accessories.find(a => a.UUID === uuid);
    const pollMs   = Math.max(30, this.cfg.pollIntervalSeconds ?? 60) * 1000;

    if (existing) {
      this.log.info('[JLR InControl] Fahrzeug bekannt: %s', vehicle.nickname);
      existing.context.vehicle = vehicle;
      new JlrAccessory(this, existing, this.client, pollMs);
    } else {
      this.log.info('[JLR InControl] Neues Fahrzeug: %s', vehicle.nickname);
      const accessory = new this.api.platformAccessory(vehicle.nickname, uuid);
      accessory.context.vehicle = vehicle;
      new JlrAccessory(this, accessory, this.client, pollMs);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private storagePath(): string {
    return path.join(
      (this.api.user as any)?.storagePath?.() ?? process.cwd(),
      '.smartcar_user_id',
    );
  }

  saveUserId(id: string): void {
    try {
      fs.writeFileSync(this.storagePath(), id, 'utf8');
      this.log.info('[JLR InControl] userId gespeichert.');
    } catch (e) {
      this.log.warn('[JLR InControl] userId konnte nicht gespeichert werden: %s', (e as Error).message);
    }
  }

  private loadUserId(): string | undefined {
    try {
      return fs.readFileSync(this.storagePath(), 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
