export interface SmartcarTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;                    // ms timestamp: when access_token expires
  refresh_token_obtained_at?: number;   // ms timestamp: when this refresh_token was issued
}

export interface PluginConfig {
  platform: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  pin?: string;
  pollIntervalSeconds?: number;
  notifyWebhookUrl?: string;             // Optional: POST when re-auth is needed
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
