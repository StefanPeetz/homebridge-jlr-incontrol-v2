export interface SmartcarTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

export interface JlrVehicleSummary {
  id: string;      // Smartcar vehicle ID
  vin: string;
  nickname: string;
  model?: string;
}

export interface JlrVehicleState {
  vin: string;
  isLocked: boolean;
  batteryLevel?: number;    // 0-100
  charging?: boolean;
  lowBattery?: boolean;
  fuelLevelPercent?: number;
  rangeKm?: number;
  odometerKm?: number;
  latitude?: number;
  longitude?: number;
  anyDoorOpen?: boolean;
  isMoving?: boolean;
  lastUpdated: string;
}

export interface PluginConfig {
  platform: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  pin?: string;
  pollIntervalSeconds?: number;
  region?: 'ROW' | 'NA';
}
