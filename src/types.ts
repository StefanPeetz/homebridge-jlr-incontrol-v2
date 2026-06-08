export interface SmartcarConfig {
  platform: string;
  name: string;
  clientId: string;
  clientSecret: string;
  userId?: string;            // persisted after first Connect; not entered manually
  pollIntervalSeconds?: number;
}

export interface SmartcarSession {
  appToken?: string;
  appTokenExpiresAt?: number;
}

export interface JlrVehicleSummary {
  id: string;
  vin: string;
  nickname: string;
  model?: string;
}

export interface JlrVehicleState {
  vin: string;
  isLocked: boolean;
  batteryLevel?: number;
  charging?: boolean;
  lowBattery?: boolean;
  fuelLevelPercent?: number;
  rangeKm?: number;
  odometerKm?: number;
  latitude?: number;
  longitude?: number;
  isMoving?: boolean;
  lastUpdated: string;
}
