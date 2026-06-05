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

export class JlrPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private client!: SmartcarClient;
  private readonly config: PluginConfig;

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

  private async init(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      this.log.error(
        '[JLR] Missing clientId / clientSecret in config.json. ' +
        'Create a free app at https://dashboard.smartcar.com',
      );
      return;
    }

    const tokenPath = path.join(
      this.api.user.storagePath(),
      'smartcar-tokens.json',
    );

    this.client = new SmartcarClient({
      clientId:      this.config.clientId,
      clientSecret:  this.config.clientSecret,
      redirectUri:   this.config.redirectUri,
      tokenStorePath: tokenPath,
      log:           this.log,
    });

    try {
      await this.client.ensureAuthenticated();
      const vehicles = await this.client.getVehicles();
      this.registerVehicles(vehicles);
    } catch (err) {
      this.log.error('[JLR] Init failed: %s', (err as Error).message);
    }
  }

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
