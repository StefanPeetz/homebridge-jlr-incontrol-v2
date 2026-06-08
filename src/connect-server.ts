/**
 * Minimal local HTTP server that acts as the Smartcar OAuth redirect URI.
 *
 * Flow:
 *   1. Plugin starts server on a random free port (or fixed port from config)
 *   2. User opens Smartcar Connect URL in browser
 *   3. After auth, Smartcar redirects to http://127.0.0.1:<port>/exchange?user_id=<uuid>
 *   4. Server captures user_id, calls onUserId callback, returns a success page
 *   5. Server shuts itself down (one-time use)
 *
 * The redirect URI registered in the Smartcar Dashboard must match exactly:
 *   http://127.0.0.1:<port>/exchange
 */
import * as http from 'http';
import { Logger } from 'homebridge';

export const CALLBACK_PATH = '/exchange';
export const CALLBACK_PORT = 52625; // fixed port; register this in Smartcar Dashboard

export function startCallbackServer(
  log: Logger,
  onUserId: (userId: string) => void,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`);

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const userId = url.searchParams.get('user_id');
      const error  = url.searchParams.get('error');

      if (error) {
        log.error('[Smartcar Connect] Error from Connect: %s — %s', error, url.searchParams.get('error_description') ?? '');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(successPage('❌ Connect fehlgeschlagen', `Smartcar meldete: ${error}`, false));
        server.close();
        return;
      }

      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(successPage('❌ Keine user_id', 'Kein user_id-Parameter in der Redirect-URL gefunden.', false));
        return;
      }

      log.info('[Smartcar Connect] ✅ user_id empfangen: %s', userId);
      onUserId(userId);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(successPage(
        '✅ Fahrzeug verbunden!',
        'Dein Fahrzeug wurde erfolgreich mit Homebridge verbunden. Du kannst dieses Fenster schließen und Homebridge neu starten.',
        true,
      ));
      // Give browser time to receive the page before shutting down
      setTimeout(() => server.close(), 2000);
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      log.info('[Smartcar Connect] Callback-Server lauscht auf http://127.0.0.1:%d%s', CALLBACK_PORT, CALLBACK_PATH);
      resolve(server);
    });

    server.on('error', reject);
  });
}

function successPage(title: string, message: string, success: boolean): string {
  const color = success ? '#01696f' : '#a12c7b';
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f7f6f2; }
    .card { background: #fff; border-radius: 12px; padding: 2rem 2.5rem; max-width: 420px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    h1 { color: ${color}; font-size: 1.5rem; margin-bottom: .75rem; }
    p  { color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
