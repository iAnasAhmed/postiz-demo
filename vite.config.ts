import { defineConfig, loadEnv, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { angles, coffees, createPost, draftPost, listChannels, listPosts, MAX_LEN, type Angle, type Env } from './server/postiz';

// Serves /api/* from the dev and preview servers. The Postiz key stays here.
function socialApi(mode: string) {
  const raw = loadEnv(mode, process.cwd(), 'POSTIZ_');
  const env: Env = { apiUrl: raw.POSTIZ_API_URL || 'http://localhost:3000', apiKey: raw.POSTIZ_API_KEY };
  const last = new Map<string, number>(); // simple per-IP rate limit
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (!env.apiKey) return send(503, { error: 'Postiz is not configured.' });
    const fail = (status: number, fallback: string) => (e: unknown) =>
      send(status, { error: e instanceof Error && e.message ? e.message : fallback });

    if (url.pathname === '/api/draft' && req.method === 'GET') {
      const coffee = url.searchParams.get('coffee') ?? '';
      const angle = url.searchParams.get('angle') as Angle;
      if (!coffees[coffee] || !angles.includes(angle)) return send(400, { error: 'Pick a coffee and an angle.' });
      return send(200, { text: draftPost(coffee, angle) });
    }
    if (url.pathname === '/api/channels') return void listChannels(env).then(r => send(200, r), fail(502, 'Postiz is unavailable.'));
    if (url.pathname === '/api/posts' && req.method === 'GET') return void listPosts(env).then(r => send(200, r), fail(502, 'Postiz is unavailable.'));

    if (url.pathname === '/api/posts' && req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        let input: { channel?: string; content?: string; when?: string };
        try { input = JSON.parse(body); } catch { return send(400, { error: 'Invalid request.' }); }
        const content = String(input.content ?? '').trim();
        const channel = String(input.channel ?? '');
        const when = input.when === 'later' ? 'later' : 'now';
        if (!content) return send(400, { error: 'Write something first.' });
        if ([...content].length > MAX_LEN) return send(400, { error: `Keep it under ${MAX_LEN} characters.` });
        if (!/^[\w-]{6,64}$/.test(channel)) return send(400, { error: 'Pick a channel.' });
        const ip = req.socket.remoteAddress ?? '';
        if (Date.now() - (last.get(ip) ?? 0) < 10000) return send(429, { error: 'Please wait a few seconds.' });
        last.set(ip, Date.now());
        createPost(env, { channel, content, when }).then(r => send(200, r), fail(502, 'Could not create the post.'));
      });
      return;
    }
    send(404, { error: 'Not found.' });
  };
  return {
    name: 'demo-social-api',
    configureServer: (server: { middlewares: Connect.Server }) => { server.middlewares.use(handler); },
    configurePreviewServer: (server: { middlewares: Connect.Server }) => { server.middlewares.use(handler); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), socialApi(mode)],
  server: { host: '127.0.0.1', port: 5182, strictPort: true },
  preview: { host: '127.0.0.1', port: 5182, strictPort: true },
}));
