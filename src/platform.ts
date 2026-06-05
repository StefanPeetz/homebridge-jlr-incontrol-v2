import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
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

    const hostIp = (config.hostIp as string | undefined) ?? 'localhost';
    const mode   = ((config.smartcarMode as string | undefined) ?? 'test') as 'test' | 'live';

    this.log.info('Smartcar mode: %s', mode);

    this.smartcar = new SmartcarClient({
      clientId:         config.clientId as string,
      clientSecret:     config.clientSecret as string,
      hostIp,
      mode,
      redirectUri:      config.redirectUri as string | undefined,
      tokenStorePath:   path.join(api.user.storagePath(), 'smartcar-tokens.json'),
      notifyWebhookUrl: config.notifyWebhookUrl as string | undefined,
      log,
    });

    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading cached accessory: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  async discoverDevices(): Promise<void> {
    const pollMs = ((this.config.pollInterval as number | undefined) ?? 300) * 1000;
    try {
      const vehicles = await this.smartcar.getVehicles();
      for (const vehicle of vehicles) {
        const uuid     = this.api.hap.uuid.generate(vehicle.vin);
        const existing = this.accessories.find(a => a.UUID === uuid);
        if (existing) {
          this.log.info('Restoring cached vehicle: %s', vehicle.nickname);
          new VehicleAccessory(this, existing, this.smartcar, vehicle).startPolling(pollMs);
        } else {
          this.log.info('Adding new vehicle: %s', vehicle.nickname);
          const accessory = new this.api.platformAccessory(vehicle.nickname, uuid);
          new VehicleAccessory(this, accessory, this.smartcar, vehicle).startPolling(pollMs);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (err) {
      this.log.error('Failed to discover vehicles: %s', (err as Error).message);
    }
  }
}
