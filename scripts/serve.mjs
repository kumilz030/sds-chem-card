import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const T = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
createServer(async (q, r) => {
  try {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = join(root, normalize(p));
    if (!f.startsWith(root)) return r.writeHead(403).end();
    r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' }).end(await readFile(f));
  } catch { r.writeHead(404).end('Not found'); }
}).listen(8080, () => console.log('http://localhost:8080'));
