import {
  PlatformAccessory,
  Service,
} from 'homebridge';
import { JlrSmartcarPlatform } from './platform';
import { SmartcarClient } from './smartcar-client';
import { JlrVehicleSummary, JlrVehicleState } from './types';

export class VehicleAccessory {
  private lockService!: Service;
  private batteryService!: Service;

  private state: JlrVehicleState | null = null;

  private get vehicle(): JlrVehicleSummary {
    return this.accessory.context.vehicle as JlrVehicleSummary;
  }

  constructor(
    private readonly platform: JlrSmartcarPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: SmartcarClient,
    private readonly summary: JlrVehicleSummary,
  ) {
    // Store summary in context for persistence across restarts
    this.accessory.context.vehicle = summary;
    this.setupServices();
  }

  // ─── HomeKit services ───────────────────────────────────────────────────

  private setupServices(): void {
    const { Service, Characteristic } = this.platform;

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

    // Battery (EV / PHEV)
    this.batteryService =
      this.accessory.getService(Service.Battery) ??
      this.accessory.addService(Service.Battery, 'Battery');

    this.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.state?.batteryLevel ?? 0);

    this.batteryService
      .getCharacteristic(Characteristic.ChargingState)
      .onGet(() => (this.state?.charging ? 1 : 0));

    this.batteryService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => (this.state?.lowBattery ? 1 : 0));
  }

  // ─── Lock handlers ───────────────────────────────────────────────────────

  private getLockCurrentState(): number {
    const { Characteristic } = this.platform;
    return this.state?.isLocked
      ? Characteristic.LockCurrentState.SECURED
      : Characteristic.LockCurrentState.UNSECURED;
  }

  private getLockTargetState(): number {
    const { Characteristic } = this.platform;
    return this.state?.isLocked
      ? Characteristic.LockTargetState.SECURED
      : Characteristic.LockTargetState.UNSECURED;
  }

  private async setLockTargetState(value: number): Promise<void> {
    const { Characteristic } = this.platform;
    const log = this.platform.log;
    try {
      if (value === Characteristic.LockTargetState.SECURED) {
        log.info('[%s] Locking...', this.vehicle.nickname);
        await this.client.lock(this.vehicle.id);
      } else {
        log.info('[%s] Unlocking...', this.vehicle.nickname);
        await this.client.unlock(this.vehicle.id);
      }
      if (this.state) this.state.isLocked = value === Characteristic.LockTargetState.SECURED;
      this.pushStateToHomeKit();
    } catch (err) {
      log.error('[%s] Lock command failed: %s', this.vehicle.nickname, (err as Error).message);
    }
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  startPolling(intervalMs: number): void {
    this.poll();
    setInterval(() => this.poll(), intervalMs);
  }

  private async poll(): Promise<void> {
    const log = this.platform.log;
    try {
      this.state = await this.client.getVehicleState(this.vehicle.id, this.vehicle.vin);
      log.debug(
        '[%s] State: locked=%s battery=%s%% charging=%s',
        this.vehicle.nickname,
        this.state.isLocked,
        this.state.batteryLevel ?? 'N/A',
        this.state.charging,
      );
      this.pushStateToHomeKit();
    } catch (err) {
      log.warn('[%s] Poll failed: %s', this.vehicle.nickname, (err as Error).message);
    }
  }

  private pushStateToHomeKit(): void {
    if (!this.state) return;
    const { Characteristic } = this.platform;

    this.lockService.updateCharacteristic(
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
