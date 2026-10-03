// Local dev server: serves public/ and runs the same Pages Function that
// Cloudflare runs in production. No dependencies — just `npm run dev`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { onRequestGet } from './functions/api/[[path]].js';

const PORT = process.env.PORT || 8788;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let response;
  if (url.pathname.startsWith('/api/')) {
    response = await onRequestGet({ request: new Request(url) });
  } else {
    const file = join('public', normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    try {
      response = new Response(await readFile(file), { headers: { 'Content-Type': TYPES[extname(file)] || 'text/plain' } });
    } catch {
      response = new Response('Not found', { status: 404 });
    }
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
