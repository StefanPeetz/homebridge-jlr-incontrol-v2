// V3: no per-vehicle tokens; only app-level token + userId needed
export interface SmartcarSession {
  appToken?: string;
  appTokenExpiresAt?: number;
}

export interface PluginConfig {
  platform: string;
  name: string;
  clientId: string;
  clientSecret: string;
  managementToken: string;    // application_management_token from Smartcar Dashboard
  userId?: string;            // optional override; auto-resolved if omitted
  pollIntervalSeconds?: number;
  notifyWebhookUrl?: string;
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
