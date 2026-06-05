import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import * as path from 'path';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SmartcarClient } from './smartcar-client';
import { PluginConfig, JlrVehicleSummary } from './types';
import { VehicleAccessory } from './vehicle-accessory';

// UUID suffix for the "Re-Auth Required" sensor
const REAUTH_SENSOR_SUFFIX = '-reauth-sensor';

export class JlrPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private client!: SmartcarClient;
  private readonly config: PluginConfig;

  // HomeKit occupancy sensor that trips when re-auth is required
  private reauthSensorAccessory?: PlatformAccessory;
  private reauthSensorService?: InstanceType<typeof Service.OccupancySensor>;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.config         = config as unknown as PluginConfig;

    this.api.on('didFinishLaunching', () => this.init());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  // ─── Re-auth sensor ───────────────────────────────────────────────────────

  private setupReauthSensor(): void {
    const uuid     = this.api.hap.uuid.generate('jlr-smartcar' + REAUTH_SENSOR_SUFFIX);
    const existing = this.accessories.find(a => a.UUID === uuid);
    const accessory = existing
      ?? new this.api.platformAccessory('JLR Re-Auth Required', uuid);

    this.reauthSensorService =
      accessory.getService(this.Service.OccupancySensor) ??
      accessory.addService(this.Service.OccupancySensor, 'JLR Re-Auth Required');

    // Start clear
    this.reauthSensorService
      .getCharacteristic(this.Characteristic.OccupancyDetected)
      .updateValue(this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

    if (!existing) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.log.info('[JLR] Registered re-auth sensor accessory');
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }

    this.reauthSensorAccessory = accessory;
  }

  private setReauthSensor(required: boolean): void {
    if (!this.reauthSensorService) return;
    const Char = this.Characteristic.OccupancyDetected;
    this.reauthSensorService
      .getCharacteristic(this.Characteristic.OccupancyDetected)
      .updateValue(required ? Char.OCCUPANCY_DETECTED : Char.OCCUPANCY_NOT_DETECTED);

    if (required) {
      this.log.warn(
        '[JLR] HomeKit "JLR Re-Auth Required" sensor is now ACTIVE. ' +
        'Open http://localhost:52625/auth to re-authorize.',
      );
    } else {
      this.log.info('[JLR] HomeKit "JLR Re-Auth Required" sensor cleared.');
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      this.log.error(
        '[JLR] Missing clientId / clientSecret in config.json. ' +
        'Create a free app at https://dashboard.smartcar.com',
      );
      return;
    }

    // Register the re-auth sensor before doing anything network-related
    this.setupReauthSensor();

    const tokenPath = path.join(
      this.api.user.storagePath(),
      'smartcar-tokens.json',
    );

    this.client = new SmartcarClient({
      clientId:         this.config.clientId,
      clientSecret:     this.config.clientSecret,
      redirectUri:      this.config.redirectUri,
      tokenStorePath:   tokenPath,
      notifyWebhookUrl: this.config.notifyWebhookUrl,
      log:              this.log,
    });

    // Wire up the callback so the sensor updates immediately
    this.client.onReauthRequired = (required) => this.setReauthSensor(required);

    try {
      await this.client.ensureAuthenticated();
      const vehicles = await this.client.getVehicles();
      this.registerVehicles(vehicles);
    } catch (err) {
      this.log.error('[JLR] Init failed: %s', (err as Error).message);
    }
  }

  // ─── Vehicle registration ─────────────────────────────────────────────────

  private registerVehicles(vehicles: JlrVehicleSummary[]): void {
    const pollInterval = (this.config.pollIntervalSeconds ?? 300) * 1000;

    for (const vehicle of vehicles) {
      const uuid      = this.api.hap.uuid.generate(vehicle.vin);
      const existing  = this.accessories.find(a => a.UUID === uuid);
      const accessory = existing ?? new this.api.platformAccessory(vehicle.nickname, uuid);

      accessory.context.vehicle = vehicle;
      accessory.context.pin     = this.config.pin ?? '';

      const acc = new VehicleAccessory(this, accessory, this.client, this.log);
      acc.startPolling(pollInterval);

      if (!existing) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info('[JLR] Registered new vehicle: %s (%s)', vehicle.nickname, vehicle.vin);
      } else {
        this.api.updatePlatformAccessories([accessory]);
        this.log.info('[JLR] Restored vehicle: %s (%s)', vehicle.nickname, vehicle.vin);
      }
    }
  }
}
