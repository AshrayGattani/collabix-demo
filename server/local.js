// Local dev server — mirrors Vercel's file-based routing for api/** handlers.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const API_ROOT = resolve(process.cwd(), 'api');

// Walk api/ and build a route table.
function walk(dir, prefix = '/api') {
  const routes = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      routes.push(...walk(full, `${prefix}/${name}`));
    } else if (name.endsWith('.js')) {
      const base = name.replace(/\.js$/, '');
      const route = base === 'index' ? prefix : `${prefix}/${base}`;
      routes.push({ file: full, route: toExpressPath(route) });
    }
  }
  return routes;
}

function toExpressPath(p) {
  // Convert "[param]" -> ":param"
  return p.replace(/\[([^\]]+)\]/g, ':$1');
}

const routes = walk(API_ROOT);

for (const r of routes) {
  const mod = await import(pathToFileURL(r.file).href);
  const handler = mod.default;
  if (typeof handler !== 'function') continue;
  app.all(r.route, async (req, res) => {
    // Emulate Vercel's req.query (contains params + query string values)
    req.query = { ...req.query, ...req.params };
    try {
      await handler(req, res);
    } catch (e) {
      console.error('handler error', r.route, e);
      res.status(500).json({ error: e.message });
    }
  });
  console.log(`  ${r.route}`);
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Collabix API → http://localhost:${port}`);
});
