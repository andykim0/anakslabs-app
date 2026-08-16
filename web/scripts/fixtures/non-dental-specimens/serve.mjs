import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2];
const port = Number(process.argv[3]);
const types = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let path = decodeURIComponent(url.pathname);
  let file = join(root, path);
  if (path.endsWith('/')) file = join(root, path, 'index.html');
  else if (!extname(file)) file = join(root, `${path}/index.html`);
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on ${port}`));
