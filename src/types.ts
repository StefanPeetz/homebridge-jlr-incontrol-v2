export interface SmartcarConfig {
  name: string;
  applicationId: string;   // UUID — used for Smartcar Connect OAuth URL
  clientId: string;        // client_01… — used for client_credentials API token
  clientSecret: string;
  userId?: string;
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
