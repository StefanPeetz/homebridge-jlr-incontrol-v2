/**
 * connect-server.ts
 *
 * No longer starts a local HTTP server.
 * The Connect URL is logged on startup so the user can open it in a browser.
 * After Smartcar Connect, the browser is redirected to:
 *   http://localhost:52625/exchange?user_id=<uuid>
 *
 * Because Homebridge typically runs on a different host (NAS, Raspberry Pi, Docker)
 * "localhost" in the browser resolves to the user's computer — not Homebridge.
 * The redirect therefore never reaches the plugin.
 *
 * Solution: user copies the user_id from the redirect URL and pastes it
 * into the plugin config field "userId". No local server needed.
 */

import { Logger } from 'homebridge';

export const REDIRECT_URI = 'http://localhost:52625/exchange';

/**
 * Logs the Smartcar Connect URL so the user can open it manually.
 * After login, the browser will be redirected to the REDIRECT_URI with ?user_id=...
 * The user copies the user_id from the URL bar and pastes it into the plugin config.
 */
export function logConnectInstructions(log: Logger, connectUrl: string): void {
  log.warn('='.repeat(70));
  log.warn('[Smartcar Connect] Fahrzeug noch nicht verbunden!');
  log.warn('[Smartcar Connect] Bitte folge diesen Schritten:');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 1. Öffne diese URL in deinem Browser:');
  log.warn('[Smartcar Connect]    %s', connectUrl);
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 2. Melde dich mit deinen JLR InControl Zugangsdaten an');
  log.warn('[Smartcar Connect]    und erteile die Berechtigungen.');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 3. Nach der Weiterleitung siehst du in der Adressleiste:');
  log.warn('[Smartcar Connect]    http://localhost:52625/exchange?user_id=XXXXXXXX-...');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 4. Kopiere den Wert hinter "user_id="');
  log.warn('[Smartcar Connect]    und trage ihn in den Plugin-Einstellungen');
  log.warn('[Smartcar Connect]    unter "Smartcar User ID" ein.');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 5. Speichere die Konfiguration und starte Homebridge neu.');
  log.warn('='.repeat(70));
}
