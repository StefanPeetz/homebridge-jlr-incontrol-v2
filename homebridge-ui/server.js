'use strict';
const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('GET',    '/status',  () => this.handleStatus());
    this.onRequest('POST',   '/connect', () => this.handleConnect());
    this.onRequest('POST',   '/discover',() => this.handleDiscover());
    this.onRequest('DELETE', '/connect', () => this.handleDisconnect());

    this.ready();
  }

  /** Returns current connection status and cached vehicle list */
  async handleStatus() {
    const platform = this.getPlatformInstance();
    const userId   = platform?.client?.getUserId?.();
    const vehicles = platform?.lastVehicles ?? [];
    return { connected: !!userId, userId: userId ?? null, vehicles };
  }

  /** Starts the local callback server and returns the Connect URL */
  async handleConnect() {
    const platform = this.getPlatformInstance();
    if (!platform) throw new Error('Plattform nicht geladen. Homebridge neu starten.');

    // Ensure callback server is running
    if (!platform.isWaitingForConnect()) {
      await platform.startConnectServer();
    }
    const connectUrl = platform.getConnectUrl();
    return { connectUrl };
  }

  /** Trigger re-discovery */
  async handleDiscover() {
    const platform = this.getPlatformInstance();
    if (!platform) throw new Error('Plattform nicht geladen.');
    await platform.discoverDevices?.();
    return { vehicles: platform.lastVehicles ?? [] };
  }

  /** Delete stored userId */
  async handleDisconnect() {
    const platform = this.getPlatformInstance();
    if (platform) {
      platform.client?.setUserId?.(undefined);
      platform.saveUserId?.('');
    }
    return { ok: true };
  }

  getPlatformInstance() {
    try {
      return this.homebridgeStoragePath
        ? global.__platforms__?.['JlrSmartcarPlatform']
        : null;
    } catch { return null; }
  }
}

(() => new UiServer())();
