import { createServer, type Server } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const mime: Record<string, string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.mp4':'video/mp4', '.vtt':'text/vtt', '.jpg':'image/jpeg' };
export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export async function startPhoneServer(options: {
  assets: string; secret: string; origin: () => string;
  journal: (id: string | null) => Promise<any>;
  port?: number;
}): Promise<Server> {
  const allowedAssets = new Set<string>(JSON.parse(readFileSync(path.join(options.assets,'phone-assets.json'),'utf8')));
  const fixedAssets = new Set(['/phone.html','/phone-sw.js','/manifest.webmanifest','/phone-icon-192.png','/phone-icon-512.png','/phone-offline.html']);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    const respond = (code: number, value: any) => {
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
    };
    try {
      if (!sameSecret(String(req.headers['x-retrace-bridge'] ?? ''), options.secret)) return respond(403, { error:'Private connection required.' });
      const origin = options.origin();
      if (!origin || req.headers.host !== new URL(origin).host) return respond(403, { error:'Invalid host.' });
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'GET' && url.pathname === '/api/journal') return respond(200, await options.journal(url.searchParams.get('session')));
      if (req.method !== 'GET' && req.method !== 'HEAD') return respond(405, { error:'Method not allowed.' });
      if (url.pathname.startsWith('/api/')) return respond(404, { error:'Unknown endpoint.' });
      const pathname = decodeURIComponent(url.pathname === '/' ? '/phone.html' : url.pathname);
      if (!fixedAssets.has(pathname) && !allowedAssets.has(pathname)) return respond(404, { error:'Not found.' });
      const file = path.join(options.assets, pathname), info = await stat(file);
      if (!info.isFile()) return respond(404, { error:'Not found.' });
      res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      let start = 0, end = info.size - 1;
      if (req.headers.range) {
        if (!range) { res.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return res.end(); }
        start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); return res.end(); }
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      res.setHeader('Content-Length', end - start + 1);
      if (req.method === 'HEAD') return res.end();
      createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) respond(400, { error:'Request failed. Check the PC connection and refresh.' }); else res.destroy();
    }
  });
  server.requestTimeout = 300000; server.headersTimeout = 15000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}
