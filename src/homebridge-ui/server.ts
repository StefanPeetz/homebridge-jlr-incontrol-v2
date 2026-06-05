import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import * as path from 'path';
import * as fs from 'fs';

const OAUTH_PORT = 52625;
const REFRESH_TOKEN_TTL_MS     = 60 * 24 * 60 * 60 * 1000;
const REAUTH_WARNING_THRESHOLD =  7 * 24 * 60 * 60 * 1000;

interface TokenStore {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refresh_token_obtained_at?: number;
}

class JlrUiServer extends HomebridgePluginUiServer {
  private tokenPath: string;

  constructor() {
    super();
    this.tokenPath = path.join(this.homebridgeStoragePath, 'smartcar-tokens.json');

    this.onRequest('/auth-status', () => this.handleAuthStatus());
    this.onRequest('/auth-url',    () => this.handleAuthUrl());

    this.ready();
  }

  private loadTokens(): TokenStore | null {
    try {
      return JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8')) as TokenStore;
    } catch {
      return null;
    }
  }

  private handleAuthStatus() {
    const tokens = this.loadTokens();
    if (!tokens) {
      return { authorized: false, reauthRequired: true, daysUntilExpiry: 0 };
    }
    const obtained = tokens.refresh_token_obtained_at
      ?? (tokens.expires_at - 7200 * 1000);
    const expiresAt = obtained + REFRESH_TOKEN_TTL_MS;
    const msLeft = expiresAt - Date.now();
    const daysUntilExpiry = Math.round(msLeft / (24 * 60 * 60 * 1000));
    return {
      authorized:     true,
      reauthRequired: msLeft < REAUTH_WARNING_THRESHOLD,
      daysUntilExpiry,
    };
  }

  private handleAuthUrl() {
    return { url: `http://localhost:${OAUTH_PORT}/auth` };
  }
}

(() => new JlrUiServer())();
