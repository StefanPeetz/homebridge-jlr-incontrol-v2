/**
 * connect-server.ts
 *
 * Smartcar Connect requires response_type=code.
 * After login, Smartcar redirects to the redirect_uri with:
 *   ?code=<auth_code>&user_id=<uuid>
 *
 * The user_id is what we need. The user copies it from the browser address bar.
 *
 * NOTE: Because Homebridge runs on a separate host (NAS, Pi, Docker),
 * "localhost" in the browser resolves to the user's own computer.
 * The redirect page will show a connection error — that is expected.
 * The user_id is still visible in the address bar.
 */

import { Logger } from 'homebridge';

export const REDIRECT_URI = 'http://localhost:52625/exchange';

export function logConnectInstructions(log: Logger, connectUrl: string): void {
  log.warn('='.repeat(70));
  log.warn('[Smartcar Connect] Fahrzeug noch nicht verbunden!');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 1. Öffne diese URL in deinem Browser:');
  log.warn('[Smartcar Connect]    %s', connectUrl);
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 2. Melde dich mit deinen JLR InControl Zugangsdaten an.');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 3. Der Browser versucht danach zu öffnen:');
  log.warn('[Smartcar Connect]    http://localhost:52625/exchange?code=...&user_id=XXXX');
  log.warn('[Smartcar Connect]    Die Seite lädt NICHT — das ist normal.');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 4. Schaue in die Adressleiste des Browsers.');
  log.warn('[Smartcar Connect]    Kopiere den Wert von "user_id=" (UUID-Format):');
  log.warn('[Smartcar Connect]    Beispiel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
  log.warn('[Smartcar Connect]');
  log.warn('[Smartcar Connect] 5. Plugin-Einstellungen → "Smartcar User ID" einfügen');
  log.warn('[Smartcar Connect]    → Speichern → Homebridge neu starten.');
  log.warn('='.repeat(70));
}
