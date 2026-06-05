// V3: no per-vehicle tokens; only app-level token + userId needed
export interface SmartcarSession {
  appToken?: string;          // cached app-level access token
  appTokenExpiresAt?: number; // ms timestamp
}

export interface PluginConfig {
  platform: string;
  name: string;
  clientId: string;
  clientSecret: string;
  userId: string;             // Smartcar userId – find in Dashboard → Connections
  hostIp?: string;
  pin?: string;
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
  batteryLevel?: number;      // 0-100 %
  charging?: boolean;
  lowBattery?: boolean;       // true below 20 %
  fuelLevelPercent?: number;  // 0-100 %
  rangeKm?: number;
  odometerKm?: number;
  latitude?: number;
  longitude?: number;
  isMoving?: boolean;
  lastUpdated: string;        // ISO 8601
}
