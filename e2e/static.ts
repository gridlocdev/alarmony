// Serves the built web client on 127.0.0.1 for the scenarios and the driver. Not for real use.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.ALARMONY_E2E_PORT ?? 8799);
const DIR = path.resolve(process.env.ALARMONY_E2E_DIR ?? 'apps/web/dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(DIR, path.normalize(name));
  if (!file.startsWith(DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');
