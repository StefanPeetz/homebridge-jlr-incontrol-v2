/**
 * Minimal local HTTP server — Smartcar OAuth redirect URI.
 *
 * Smartcar only permits http:// redirect URIs for the hostname "localhost".
 * Registered URI must be exactly: http://localhost:52625/exchange
 *
 * Smartcar may redirect with user_id as:
 *   - GET  ?user_id=<uuid>   (native Connect flow)
 *   - POST body: user_id=<uuid>  (some client configurations)
 *   - GET  ?code=<code>      (Authorization Code flow — not used here)
 */
import * as http from 'http';
import { Logger } from 'homebridge';

export const CALLBACK_PATH = '/exchange';
export const CALLBACK_PORT = 52625;
export const CALLBACK_HOST = 'localhost';
export const REDIRECT_URI  = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;

export function startCallbackServer(
  log: Logger,
  onUserId: (userId: string) => void,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;

      const url = new URL(req.url, `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404); res.end('Not found'); return;
      }

      // Collect body (for POST)
      let rawBody = '';
      req.on('data', chunk => { rawBody += chunk.toString(); });
      req.on('end', () => {
        log.info('[Smartcar Connect] %s %s', req.method, req.url);
        log.info('[Smartcar Connect] Body: %s', rawBody || '(leer)');

        // Parse user_id from query string OR POST body
        let userId = url.searchParams.get('user_id');
        if (!userId && rawBody) {
          try {
            const bodyParams = new URLSearchParams(rawBody);
            userId = bodyParams.get('user_id');
          } catch { /* ignore */ }
        }
        if (!userId && rawBody) {
          try {
            const json = JSON.parse(rawBody);
            userId = json.user_id ?? null;
          } catch { /* ignore */ }
        }

        // Log ALL parameters for diagnosis
        const allQuery: string[] = [];
        url.searchParams.forEach((v, k) => allQuery.push(`${k}=${v}`));
        log.info('[Smartcar Connect] Query: %s', allQuery.join(', ') || '(keine)');

        const error = url.searchParams.get('error');
        if (error) {
          log.error('[Smartcar Connect] Fehler: %s — %s', error,
            url.searchParams.get('error_description') ?? '');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(htmlPage('❌ Connect fehlgeschlagen', `Smartcar meldete: ${error}`, false));
          server.close();
          return;
        }

        if (!userId) {
          const hint = [
            `Query: ${allQuery.join(', ') || 'keine'}`,
            `Body: ${rawBody || 'leer'}`,
            `Redirect URI muss exakt lauten: ${REDIRECT_URI}`,
          ].join(' | ');
          log.error('[Smartcar Connect] Keine user_id empfangen. %s', hint);
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(htmlPage('❌ Keine user_id', hint, false));
          return;
        }

        log.info('[Smartcar Connect] ✅ user_id: %s', userId);
        onUserId(userId);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlPage(
          '✅ Fahrzeug verbunden!',
          'Dein Fahrzeug wurde erfolgreich verbunden. Du kannst dieses Fenster schließen.',
          true,
        ));
        setTimeout(() => server.close(), 2000);
      });
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      log.info('[Smartcar Connect] Callback-Server lauscht auf %s', REDIRECT_URI);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function htmlPage(title: string, message: string, success: boolean): string {
  const color = success ? '#01696f' : '#a12c7b';
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f6f2}.card{background:#fff;border-radius:12px;padding:2rem 2.5rem;max-width:520px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}h1{color:${color};font-size:1.5rem;margin-bottom:.75rem}p{color:#555;line-height:1.6;font-size:.85rem;word-break:break-all}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
