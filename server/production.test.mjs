import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from './index.mjs';

async function production(t, { build = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'toybox-production-'));
  const distDir = path.join(directory, 'dist');
  if (build) {
    await mkdir(path.join(distDir, 'assets'), { recursive: true });
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Toybox production</title><div id="root"></div>');
    await writeFile(path.join(distDir, 'assets', 'studio-aB12cD34.js'), 'window.toyboxBuild = true;');
    await writeFile(path.join(distDir, '.env'), 'BUILD_SECRET=never-serve');
  }
  await writeFile(path.join(directory, '.env'), 'PRIVATE_KEY=never-serve');
  await writeFile(path.join(directory, 'source.mjs'), 'SOURCE_CODE=never-serve');
  const app = await createApp({ env: {}, dataDir: path.join(directory, 'data'), distDir, backgroundPolling: false, movieTools: { available: async () => false } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await app.locals.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return {
    directory, distDir, origin: `http://127.0.0.1:${server.address().port}`,
    raw(requestPath, headers = {}) {
      return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: server.address().port, path: requestPath, headers }, (response) => {
          let body = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
        }); req.once('error', reject);
      });
    },
  };
}

test('production serves built files and client routes while unknown APIs remain JSON 404', async (t) => {
  const app = await production(t);
  for (const route of ['/', '/studio/projects/one']) {
    const response = await fetch(`${app.origin}${route}`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /Toybox production/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
  }
  const script = await fetch(`${app.origin}/assets/studio-aB12cD34.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.match(script.headers.get('cache-control'), /immutable/);
  assert.equal(script.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await script.text(), 'window.toyboxBuild = true;');
  const api = await fetch(`${app.origin}/api/not-a-real-endpoint`, { headers: { Accept: 'text/html' } });
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: 'API route not found.' });
  for (const route of ['/assets/missing.js', '/assets/missing', '/project.json']) assert.equal((await fetch(`${app.origin}${route}`)).status, 404);
  assert.equal((await fetch(`${app.origin}/studio/projects/one`, { headers: { Accept: 'application/json' } })).status, 404);
});

test('production never serves source, dotfiles, traversal, or links outside dist', async (t) => {
  const app = await production(t);
  await symlink(path.join(app.directory, 'source.mjs'), path.join(app.distDir, 'leaked-source.mjs'));
  await symlink(app.directory, path.join(app.distDir, 'outside'));
  for (const route of ['/.env', '/source.mjs', '/%2eenv', '/%2e%2e%2f.env', '/../.env', '/..%5c.env', '/leaked-source.mjs', '/outside/source.mjs', '/outside/.env']) {
    const response = await app.raw(route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(response.body, /never-serve/);
  }
  assert.equal((await app.raw('/%zz')).status, 400);
  assert.equal((await app.raw('/', { Host: 'evil.example' })).status, 403);
  assert.equal((await fetch(`${app.origin}/assets/studio-aB12cD34.js`, { method: 'POST', body: 'overwrite' })).status, 404);
  assert.equal(await readFile(path.join(app.distDir, 'assets', 'studio-aB12cD34.js'), 'utf8'), 'window.toyboxBuild = true;');
});

test('a missing production build gives an actionable response without disabling the API', async (t) => {
  const app = await production(t, { build: false });
  const root = await fetch(`${app.origin}/`);
  assert.equal(root.status, 503);
  assert.match(await root.text(), /npm run build/);
  assert.equal((await fetch(`${app.origin}/api/health`)).status, 200);
  await mkdir(app.distDir);
  await writeFile(path.join(app.distDir, 'index.html'), '<h1>Built after server start</h1>');
  assert.equal((await fetch(`${app.origin}/`)).status, 200);
});
