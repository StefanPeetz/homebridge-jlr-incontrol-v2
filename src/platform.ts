import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SmartcarClient, SmartcarPlan } from './smartcar-client';
import { VehicleAccessory } from './vehicle-accessory';
import { JlrVehicleSummary } from './types';

export class JlrSmartcarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly accessories: PlatformAccessory[] = [];
  public readonly client: SmartcarClient;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.client = new SmartcarClient({
      applicationId: config.applicationId as string,
      clientId:      config.clientId      as string,
      clientSecret:  config.clientSecret  as string,
      userId:        config.userId        as string | undefined,
      smartcarPlan:  (config.smartcarPlan as SmartcarPlan | undefined) ?? 'auto',
      log,
    });

    log.info('Initializing JlrSmartcarPlatform platform...');
    log.info('[JLR InControl] Plattform initialisiert. userId: %s...', (config.userId as string ?? '').substring(0, 10));

    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug('Loading accessory from cache: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    if (!this.client.hasUserId()) {
      this.log.warn('[JLR InControl] Keine userId konfiguriert. Bitte Fahrzeug verbinden.');
      return;
    }
    try {
      const vehicles = await this.client.getVehicles();
      this.log.info('[JLR InControl] %d Fahrzeug(e) gefunden', vehicles.length);
      this.registerVehicles(vehicles);
    } catch (err) {
      this.log.error('[JLR InControl] Discovery fehlgeschlagen: %s', (err as Error).message);
    }
  }

  private registerVehicles(vehicles: JlrVehicleSummary[]): void {
    const intervalMs = Math.max(30, (this.config.pollingInterval as number ?? 60)) * 1000;

    for (const vehicle of vehicles) {
      const uuid      = this.api.hap.uuid.generate(vehicle.id);
      const cached    = this.accessories.find(a => a.UUID === uuid);
      const accessory = cached ?? new this.api.platformAccessory(vehicle.nickname, uuid);

      if (!cached) {
        this.log.info('[JLR InControl] Neues Fahrzeug: %s', vehicle.nickname);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        this.log.info('[JLR InControl] Fahrzeug aus Cache: %s', vehicle.nickname);
      }

      new VehicleAccessory(this, accessory, this.client, vehicle).startPolling(intervalMs);
    }

    // Remove stale accessories
    const activeUuids = vehicles.map(v => this.api.hap.uuid.generate(v.id));
    const stale = this.accessories.filter(a => !activeUuids.includes(a.UUID));
    if (stale.length) {
      this.log.info('[JLR InControl] %d veraltete Accessory/ies entfernt', stale.length);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }
}
