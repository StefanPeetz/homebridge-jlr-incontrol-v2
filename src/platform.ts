import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SmartcarClient } from './smartcar-client';
import { VehicleAccessory } from './vehicle-accessory';
import { PluginConfig, JlrVehicleSummary } from './types';

export class JlrSmartcarPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  private readonly client: SmartcarClient;
  private readonly config: PluginConfig;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service        = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.config         = config as unknown as PluginConfig;

    if (!this.config.userId) {
      this.log.error(
        '[Smartcar] ❌ userId is missing from config! ' +
        'Open the Smartcar Dashboard → Connections, copy your userId and add it to the plugin config.',
      );
    }

    this.client = new SmartcarClient({
      clientId:         this.config.clientId,
      clientSecret:     this.config.clientSecret,
      userId:           this.config.userId,
      notifyWebhookUrl: this.config.notifyWebhookUrl,
      log:              this.log,
    });

    this.api.on('didFinishLaunching', () => { this.discoverDevices(); });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    const pollMs = (this.config.pollIntervalSeconds ?? 60) * 1000;

    try {
      await this.client.ensureAuthenticated();
      const vehicles: JlrVehicleSummary[] = await this.client.getVehicles();

      for (const vehicle of vehicles) {
        const uuid     = this.api.hap.uuid.generate(vehicle.vin);
        const existing = this.accessories.find(a => a.UUID === uuid);

        if (existing) {
          this.log.info('Restoring accessory: %s', vehicle.nickname);
          const acc = new VehicleAccessory(this, existing, this.client, vehicle);
          acc.startPolling(pollMs);
        } else {
          this.log.info('Adding new accessory: %s', vehicle.nickname);
          const accessory = new this.api.platformAccessory(vehicle.nickname, uuid);
          accessory.context.vehicle = vehicle;
          const acc = new VehicleAccessory(this, accessory, this.client, vehicle);
          acc.startPolling(pollMs);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (err) {
      this.log.error('[Platform] discoverDevices failed: %s', (err as Error).message);
    }
  }
}
