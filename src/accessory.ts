import { PlatformAccessory, Service } from 'homebridge';
import { JlrSmartcarPlatform } from './platform';
import { SmartcarClient } from './smartcar-client';
import { JlrVehicleState } from './types';

export class JlrAccessory {
  private readonly lockService: Service;
  private readonly batteryService?: Service;
  private readonly infoService: Service;
  private state: JlrVehicleState;
  private pollTimer?: ReturnType<typeof setInterval>;

  private readonly vehicleId: string;
  private readonly vin: string;

  constructor(
    private readonly platform: JlrSmartcarPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: SmartcarClient,
    private readonly pollIntervalMs: number,
  ) {
    const { Service, Characteristic } = this.platform;
    const vehicle = accessory.context.vehicle;
    this.vehicleId = vehicle.id;
    this.vin       = vehicle.vin;

    // Sensible defaults
    this.state = {
      vin:         this.vin,
      isLocked:    false,
      lastUpdated: new Date().toISOString(),
    };

    // ── AccessoryInformation ──────────────────────────────────────────────
    this.infoService = this.accessory.getService(Service.AccessoryInformation) ||
      this.accessory.addService(Service.AccessoryInformation);
    this.infoService
      .setCharacteristic(Characteristic.Manufacturer, 'Jaguar Land Rover')
      .setCharacteristic(Characteristic.Model, vehicle.model ?? 'JLR Vehicle')
      .setCharacteristic(Characteristic.SerialNumber, this.vin);

    // ── LockMechanism ─────────────────────────────────────────────────────
    this.lockService = this.accessory.getService(Service.LockMechanism) ||
      this.accessory.addService(Service.LockMechanism, vehicle.nickname);

    this.lockService.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => this.state.isLocked
        ? Characteristic.LockCurrentState.SECURED
        : Characteristic.LockCurrentState.UNSECURED);

    this.lockService.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => this.state.isLocked
        ? Characteristic.LockTargetState.SECURED
        : Characteristic.LockTargetState.UNSECURED)
      .onSet(async (value) => {
        if (value === Characteristic.LockTargetState.SECURED) {
          await this.client.lock(this.vehicleId);
        } else {
          await this.client.unlock(this.vehicleId);
        }
        this.state.isLocked = value === Characteristic.LockTargetState.SECURED;
        this.lockService.updateCharacteristic(
          Characteristic.LockCurrentState,
          this.state.isLocked
            ? Characteristic.LockCurrentState.SECURED
            : Characteristic.LockCurrentState.UNSECURED,
        );
      });

    // ── Battery (if EV) ───────────────────────────────────────────────────
    this.batteryService = this.accessory.getService(Service.Battery) ??
      this.accessory.addService(Service.Battery);

    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.state.batteryLevel ?? 100);
    this.batteryService.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => this.state.charging
        ? Characteristic.ChargingState.CHARGING
        : Characteristic.ChargingState.NOT_CHARGING);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => this.state.lowBattery
        ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);

    // Start polling
    this.refreshState();
    this.pollTimer = setInterval(() => this.refreshState(), this.pollIntervalMs);
  }

  private async refreshState(): Promise<void> {
    try {
      this.state = await this.client.getVehicleState(this.vehicleId, this.vin);
      const { Characteristic } = this.platform;
      this.lockService.updateCharacteristic(
        Characteristic.LockCurrentState,
        this.state.isLocked
          ? Characteristic.LockCurrentState.SECURED
          : Characteristic.LockCurrentState.UNSECURED,
      );
      if (this.batteryService && this.state.batteryLevel !== undefined) {
        this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.state.batteryLevel);
        this.batteryService.updateCharacteristic(
          Characteristic.ChargingState,
          this.state.charging
            ? Characteristic.ChargingState.CHARGING
            : Characteristic.ChargingState.NOT_CHARGING,
        );
      }
    } catch (err) {
      this.platform.log.error('[JlrAccessory] Status-Update fehlgeschlagen für %s: %s', this.vin, (err as Error).message);
    }
  }
}
