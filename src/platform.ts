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
import { VehicleAccessory } from './vehicle-accessory';

export class JlrSmartcarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly smartcar: SmartcarClient;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // hostIp: IP of the Raspberry Pi — configurable in config.json
    // Falls back to 'localhost' (only works when browser runs on the Pi itself)
    const hostIp = (config.hostIp as string | undefined) ?? 'localhost';

    this.smartcar = new SmartcarClient({
      clientId:       config.clientId as string,
      clientSecret:   config.clientSecret as string,
      hostIp,
      // redirectUri can also be set explicitly in config.json if needed
      redirectUri:    config.redirectUri as string | undefined,
      tokenStorePath: path.join(api.user.storagePath(), 'smartcar-tokens.json'),
      notifyWebhookUrl: config.notifyWebhookUrl as string | undefined,
      log,
    });

    this.log.debug('JLR Smartcar platform initialised');

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading cached accessory: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    try {
      const vehicles = await this.smartcar.getVehicles();

      for (const vehicle of vehicles) {
        const uuid = this.api.hap.uuid.generate(vehicle.vin);
        const existing = this.accessories.find(a => a.UUID === uuid);

        if (existing) {
          this.log.info('Restoring cached vehicle: %s', vehicle.nickname);
          new VehicleAccessory(this, existing, this.smartcar, vehicle);
        } else {
          this.log.info('Adding new vehicle: %s', vehicle.nickname);
          const accessory = new this.api.platformAccessory(vehicle.nickname, uuid);
          accessory.context.vehicle = vehicle;
          new VehicleAccessory(this, accessory, this.smartcar, vehicle);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (err) {
      this.log.error('Failed to discover vehicles: %s', (err as Error).message);
    }
  }
}
