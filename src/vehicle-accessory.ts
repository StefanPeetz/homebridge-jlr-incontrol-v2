import {
  PlatformAccessory,
  Service,
  Logger,
} from 'homebridge';
import { JlrPlatform } from './platform';
import { SmartcarClient } from './smartcar-client';
import { JlrVehicleSummary, JlrVehicleState } from './types';

export class VehicleAccessory {
  private lockService!: Service;
  private batteryService!: Service;

  private state: JlrVehicleState | null = null;
  private pollTimer?: ReturnType<typeof setInterval>;

  private get vehicle(): JlrVehicleSummary {
    return this.accessory.context.vehicle as JlrVehicleSummary;
  }

  constructor(
    private readonly platform: JlrPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: SmartcarClient,
    private readonly log: Logger,
  ) {
    this.setupServices();
  }

  // ─── HomeKit services ─────────────────────────────────────────────────────

  private setupServices(): void {
    const { Service, Characteristic } = this.platform;

    // Accessory info
    this.accessory
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Jaguar Land Rover')
      .setCharacteristic(Characteristic.Model, this.vehicle.model ?? 'JLR Vehicle')
      .setCharacteristic(Characteristic.SerialNumber, this.vehicle.vin);

    // Lock mechanism
    this.lockService =
      this.accessory.getService(Service.LockMechanism) ??
      this.accessory.addService(Service.LockMechanism, 'Door Lock');

    this.lockService
      .getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => this.getLockCurrentState());

    this.lockService
      .getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => this.getLockTargetState())
      .onSet((value) => this.setLockTargetState(value as number));

    // Battery (EV)
    this.batteryService =
      this.accessory.getService(Service.Battery) ??
      this.accessory.addService(Service.Battery, 'Battery');

    this.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.state?.batteryLevel ?? 0);

    this.batteryService
      .getCharacteristic(Characteristic.ChargingState)
      .onGet(() => {
        if (this.state?.charging) return 1; // CHARGING
        return 0; // NOT_CHARGING
      });

    this.batteryService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => (this.state?.lowBattery ? 1 : 0));
  }

  // ─── Lock handlers ────────────────────────────────────────────────────────

  private getLockCurrentState(): number {
    const { Characteristic } = this.platform;
    if (this.state?.isLocked) return Characteristic.LockCurrentState.SECURED;
    return Characteristic.LockCurrentState.UNSECURED;
  }

  private getLockTargetState(): number {
    const { Characteristic } = this.platform;
    if (this.state?.isLocked) return Characteristic.LockTargetState.SECURED;
    return Characteristic.LockTargetState.UNSECURED;
  }

  private async setLockTargetState(value: number): Promise<void> {
    const { Characteristic } = this.platform;
    try {
      if (value === Characteristic.LockTargetState.SECURED) {
        this.log.info('[%s] Locking...', this.vehicle.nickname);
        await this.client.lock(this.vehicle.id);
      } else {
        this.log.info('[%s] Unlocking...', this.vehicle.nickname);
        await this.client.unlock(this.vehicle.id);
      }
      // optimistic update
      if (this.state) this.state.isLocked = value === Characteristic.LockTargetState.SECURED;
      this.pushStateToHomeKit();
    } catch (err) {
      this.log.error('[%s] Lock command failed: %s', this.vehicle.nickname, (err as Error).message);
    }
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  startPolling(intervalMs: number): void {
    this.poll(); // immediate first poll
    this.pollTimer = setInterval(() => this.poll(), intervalMs);
  }

  private async poll(): Promise<void> {
    try {
      this.state = await this.client.getVehicleState(this.vehicle.id, this.vehicle.vin);
      this.log.debug(
        '[%s] State: locked=%s battery=%s%% charging=%s',
        this.vehicle.nickname,
        this.state.isLocked,
        this.state.batteryLevel ?? 'N/A',
        this.state.charging,
      );
      this.pushStateToHomeKit();
    } catch (err) {
      this.log.warn('[%s] Poll failed: %s', this.vehicle.nickname, (err as Error).message);
    }
  }

  private pushStateToHomeKit(): void {
    if (!this.state) return;
    const { Characteristic } = this.platform;

    this.lockService
      .updateCharacteristic(
        Characteristic.LockCurrentState,
        this.state.isLocked
          ? Characteristic.LockCurrentState.SECURED
          : Characteristic.LockCurrentState.UNSECURED,
      );

    if (this.state.batteryLevel !== undefined) {
      this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.state.batteryLevel);
      this.batteryService.updateCharacteristic(
        Characteristic.StatusLowBattery,
        this.state.lowBattery ? 1 : 0,
      );
    }

    if (this.state.charging !== undefined) {
      this.batteryService.updateCharacteristic(
        Characteristic.ChargingState,
        this.state.charging ? 1 : 0,
      );
    }
  }
}
