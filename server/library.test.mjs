import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Comfy } from '@comfyorg/sdk';
import { createApp } from './index.mjs';
import { createMovieTools, validateMovie } from './movies.mjs';
import { validateMetadata } from './validation.mjs';

const exec = promisify(execFile);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNioAAAAASUVORK5CYII=';
const workflow = { '1': { class_type: 'LoadImage', inputs: { image: 'stage.png' } }, '2': { class_type: 'CLIPTextEncode', inputs: { text: 'original prompt' } }, '3': { class_type: 'SaveImage', inputs: { images: ['1', 0] } } };
const bindings = { image: { nodeId: '1', input: 'image' }, prompt: { nodeId: '2', input: 'text' }, outputNodeId: '3' };
const request = { workflow, bindings, image: `data:image/png;base64,${PNG}`, prompt: 'A tiny red car.', seed: 12, duration: 3, metadata: { shotId: 'shot-one', shotName: 'The escape', projectId: 'project-one', projectName: 'Escape film', world: 'desert' } };
const env = { COMFY_BASE_URL: 'http://127.0.0.1:8189' };
const noMovies = { available: async () => false };

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'toybox-library-'));
  const servers = [];
  t.after(async () => { for (const item of servers) await item.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function start(extra = {}) {
    const app = await createApp({ dataDir, env, backgroundPolling: false, movieTools: noMovies, ...options, ...extra });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    let closed = false;
    const instance = {
      origin: `http://127.0.0.1:${server.address().port}`,
      async close() { if (closed) return; closed = true; await app.locals.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
      async call(url, body, method = body === undefined ? 'GET' : 'POST') {
        const response = await fetch(`${this.origin}${url}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: response.status === 204 ? null : await response.json() };
      },
    };
    servers.push(instance);
    return instance;
  }
  return { dataDir, start };
}

async function untilJob(api, id, status) {
  let response;
  for (let attempt = 0; attempt < 200; attempt++) {
    response = await api.call(`/api/jobs/${id}`);
    if (response.body.status === status) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Job did not reach ${status}: ${JSON.stringify(response)}`);
}

async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The local API waited for an upstream operation.')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

function upstream() {
  const records = new Map(), submitted = [], seen = [];
  let cancelFailure = false, nextState = 'queued', cancelResponseState, afterCancelState = 'canceled', outputNode = '3';
  const now = new Date().toISOString();
  function wire(id, state) {
    return { id, status: state, created_at: now, started_at: now, completed_at: ['succeeded', 'failed', 'canceled'].includes(state) ? now : null, expires_at: '2099-01-01T00:00:00Z', queue_position: null, progress: { value: state === 'succeeded' ? 1 : 0.25, nodes_done: 1, nodes_total: 3 }, outputs: state === 'succeeded' ? [{ id: `output-${id}`, node_id: outputNode, name: 'result.png', type: 'image', content_type: 'image/png', size_bytes: Buffer.from(PNG, 'base64').length }] : [], error: state === 'failed' ? { message: 'Model ran out of memory.' } : null, urls: { self: `/api/v2/jobs/${id}`, events: `/api/v2/jobs/${id}/events`, cancel: `/api/v2/jobs/${id}/cancel` } };
  }
  const fakeFetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    seen.push(`${options.method || 'GET'} ${pathname}`);
    if (options.method === 'HEAD') return new Response(null, { status: 404 });
    if (pathname === '/api/v2/assets' && options.method === 'POST') return Response.json({ id: 'input', hash: null, created_new: true, content_type: 'image/png', size_bytes: 68, created_at: now, url: '', url_expires_at: now }, { status: 201 });
    if (pathname === '/api/v2/jobs' && options.method === 'POST') {
      submitted.push(JSON.parse(options.body));
      const id = `upstream-${submitted.length}`;
      records.set(id, nextState);
      return Response.json(wire(id, nextState), { status: 201 });
    }
    const match = /^\/api\/v2\/jobs\/([^/]+)(\/cancel)?$/.exec(pathname);
    if (match) {
      if (match[2]) {
        if (cancelFailure) return Response.json({ error: { code: 'not_implemented', message: 'Cancellation unavailable.' } }, { status: 501 });
        records.set(match[1], afterCancelState);
      }
      if (!records.has(match[1])) return Response.json({ error: { code: 'not_found', message: 'Gone' } }, { status: 404 });
      return Response.json(wire(match[1], match[2] && cancelResponseState ? cancelResponseState : records.get(match[1])));
    }
    if (/\/assets\/output-.*\/content$/.test(pathname)) return new Response(Buffer.from(PNG, 'base64'), { headers: { 'Content-Type': 'image/png' } });
    throw new Error(`Unexpected test endpoint ${pathname}`);
  };
  return { records, submitted, seen, createClient: () => new Comfy({ apiKey: 'test-only', fetch: fakeFetch }), set nextState(value) { nextState = value; }, set outputNode(value) { outputNode = value; }, set cancelFailure(value) { cancelFailure = value; }, set cancelResponseState(value) { cancelResponseState = value; }, set afterCancelState(value) { afterCancelState = value; } };
}

test('active jobs rehydrate through the official SDK and completed media survives two API restarts', async (t) => {
  const remote = upstream(), { start, dataDir } = await fixture(t, { createClient: remote.createClient });
  let api = await start();
  const created = await api.call('/api/render', request);
  assert.equal(created.status, 202);
  assert.equal(created.body.status, 'queued');
  assert.equal(created.body.projectName, request.metadata.projectName);
  assert.equal(created.body.kind, 'render');
  const id = created.body.id;
  await api.close();
  remote.records.set('upstream-1', 'succeeded');
  api = await start();
  await untilJob(api, id, 'completed');
  const listed = await api.call('/api/jobs');
  assert.equal(listed.body.jobs[0].status, 'completed');
  assert.ok(remote.seen.includes('GET /api/v2/jobs/upstream-1'));
  assert.equal(remote.submitted.length, 1, 'restart must recover, never resubmit an accepted job');
  assert.equal(JSON.stringify(listed.body).includes('providerBaseUrl'), false);
  assert.equal(JSON.stringify(listed.body).includes(PNG), false);
  assert.equal(JSON.stringify(listed.body).includes('workflow'), false);
  const stored = JSON.parse(await readFile(path.join(dataDir, 'jobs', `${id}.json`), 'utf8'));
  assert.equal(stored.request.image, request.image);
  assert.deepEqual(stored.request.workflow, workflow);
  assert.equal((await stat(path.join(dataDir, 'jobs', `${id}.json`))).mode & 0o777, 0o600);
  const url = listed.body.jobs[0].outputs[0].url;
  await api.close();
  api = await start({ createClient: () => { throw new Error('Completed jobs do not need Comfy.'); } });
  assert.equal((await api.call(`/api/jobs/${id}`)).body.status, 'completed');
  const media = await fetch(`${api.origin}${url}`);
  assert.equal(Buffer.from(await media.arrayBuffer()).toString('base64'), PNG);
});

test('cancellation uses the upstream handle and retry preserves original inputs and metadata', async (t) => {
  const remote = upstream(), { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start();
  const created = (await api.call('/api/render', request)).body;
  const canceled = await api.call(`/api/jobs/${created.id}/cancel`, {});
  assert.equal(canceled.status, 202);
  assert.equal(canceled.body.status, 'canceled');
  assert.ok(remote.seen.includes('POST /api/v2/jobs/upstream-1/cancel'));
  await api.call('/api/workflow', { workflow: { ...workflow, '2': { class_type: 'CLIPTextEncode', inputs: { text: 'changed workflow' } } }, bindings });
  const retried = await api.call(`/api/jobs/${created.id}/retry`, {});
  assert.equal(retried.status, 202);
  assert.notEqual(retried.body.id, created.id);
  assert.equal(retried.body.shotId, request.metadata.shotId);
  assert.equal(remote.submitted[1].workflow['2'].inputs.text, request.prompt);
  assert.equal((await api.call(`/api/jobs/${retried.body.id}/retry`, {})).status, 409);
  assert.equal((await api.call(`/api/jobs/${retried.body.id}`, undefined, 'DELETE')).status, 409);
});

test('a rejected cancellation never claims that the GPU stopped', async (t) => {
  const remote = upstream(); remote.cancelFailure = true;
  const { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start(), job = (await api.call('/api/render', request)).body;
  assert.equal((await api.call(`/api/jobs/${job.id}/cancel`, {})).status, 501);
  assert.equal((await api.call(`/api/jobs/${job.id}`)).body.status, 'queued');
});

test('a transient expired cancel response stays canceling until the SDK confirms canceled', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const remote = upstream(); remote.cancelResponseState = 'expired';
  const { start, dataDir } = await fixture(t, { createClient: remote.createClient });
  let api = await start();
  const created = (await api.call('/api/render', request)).body;
  const canceled = await api.call(`/api/jobs/${created.id}/cancel`, {});
  assert.equal(canceled.status, 202);
  assert.equal(canceled.body.status, 'canceling', 'an accepted request alone does not prove cancellation');
  const stored = JSON.parse(await readFile(path.join(dataDir, 'jobs', `${created.id}.json`), 'utf8'));
  assert.equal(typeof stored.cancelAcceptedAt, 'number');
  // Restart while confirmation is pending: retain the intent and ask upstream,
  // whose history now contains execution_interrupted and reports canceled.
  await api.close();
  api = await start();
  const confirmed = await untilJob(api, created.id, 'canceled');
  assert.deepEqual(confirmed.outputs, []);
  assert.ok(remote.seen.includes('GET /api/v2/jobs/upstream-1'));
});

test('a transient expired response during ordinary completion can still recover its output', async (t) => {
  const remote = upstream(); remote.nextState = 'expired';
  const { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start();
  const created = (await api.call('/api/render', request)).body;
  assert.equal(created.status, 'queued');
  assert.match(created.error, /final job status/);
  remote.records.set('upstream-1', 'succeeded');
  const complete = await untilJob(api, created.id, 'completed');
  assert.equal(complete.outputs.length, 1);
  assert.equal(Buffer.from(await (await fetch(`${api.origin}${complete.outputs[0].url}`)).arrayBuffer()).toString('base64'), PNG);
});

test('a genuinely expired job fails after bounded confirmation rather than staying active forever', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const remote = upstream(); remote.nextState = 'expired';
  const { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start(), created = (await api.call('/api/render', request)).body;
  assert.equal(created.status, 'queued');
  t.mock.timers.tick(30_001);
  const failed = await untilJob(api, created.id, 'failed');
  assert.match(failed.error, /expired/);
});

test('an expired job after an accepted cancel never reports an unconfirmed cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const remote = upstream(); remote.afterCancelState = 'expired';
  const { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start(), created = (await api.call('/api/render', request)).body;
  const response = await api.call(`/api/jobs/${created.id}/cancel`, {});
  assert.equal(response.body.status, 'canceling');
  t.mock.timers.tick(30_001);
  const failed = await untilJob(api, created.id, 'failed');
  assert.match(failed.error, /Cancellation could not be confirmed/);
});

test('explicit deletion removes only the selected terminal job and its media', async (t) => {
  const remote = upstream(); remote.nextState = 'succeeded';
  const { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start();
  const one = (await api.call('/api/render', request)).body, two = (await api.call('/api/render', request)).body;
  assert.equal((await api.call(`/api/jobs/${one.id}`, undefined, 'DELETE')).status, 204);
  assert.equal((await api.call(`/api/jobs/${one.id}`)).status, 404);
  assert.equal((await fetch(`${api.origin}${one.outputs[0].url}`)).status, 404);
  assert.equal((await fetch(`${api.origin}${two.outputs[0].url}`)).status, 200);
  assert.equal((await api.call('/api/jobs')).body.jobs.length, 1);
});

test('metadata and movie validation reject injected paths, URLs, coercion, and unbounded clips', () => {
  assert.throws(() => validateMetadata({ shotId: ['bad'] }), /short text/);
  assert.throws(() => validateMetadata({ projectName: 'bad\nname' }), /short text/);
  assert.throws(() => validateMovie({ title: 'x', clips: [{ jobId: '../../private' }] }), /render library/);
  assert.throws(() => validateMovie({ title: 'x', clips: [{ jobId: randomUUID(), url: 'https://example.com/x.mp4' }] }), /render library/);
  assert.throws(() => validateMovie({ title: 'x', clips: [{ jobId: randomUUID(), inPoint: '0' }] }), /trim/);
  assert.throws(() => validateMovie({ title: 'x', clips: Array.from({ length: 25 }, () => ({ jobId: randomUUID() })) }), /24/);
});

test('real FFmpeg export trims and concatenates private library videos; movie survives restart', async (t) => {
  const movieTools = createMovieTools();
  if (!await movieTools.available()) return t.skip('FFmpeg and FFprobe are unavailable.');
  const { start, dataDir } = await fixture(t, { movieTools });
  const ids = [randomUUID(), randomUUID()];
  for (const [i, color] of ['red', 'blue'].entries()) {
    const directory = path.join(dataDir, 'outputs', ids[i]);
    await mkdir(directory, { recursive: true });
    await exec('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:size=64x48:rate=24:duration=1`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(directory, '0.mp4')]);
  }
  let api = await start();
  assert.equal((await api.call('/api/health')).body.movieExportAvailable, true);
  assert.equal((await api.call('/api/jobs')).body.jobs.length, 2, 'older videos are imported without deletion');
  assert.equal((await api.call('/api/movies', { title: 'Bad video', clips: [{ jobId: randomUUID() }] })).status, 404);
  assert.equal((await api.call('/api/movies', { title: 'Bad range', clips: [{ jobId: ids[0], outPoint: 2 }] })).status, 400);
  const made = await api.call('/api/movies', { title: 'Red then blue', projectId: 'cut-1', projectName: 'Test film', clips: [{ jobId: ids[0], inPoint: 0.25, outPoint: 0.75 }, { jobId: ids[1], outPoint: 0.5 }] });
  assert.equal(made.status, 202, JSON.stringify(made.body));
  assert.equal(made.body.kind, 'movie');
  assert.equal(made.body.projectId, 'cut-1');
  let movie;
  for (let i = 0; i < 100; i++) {
    movie = (await api.call(`/api/jobs/${made.body.id}`)).body;
    if (['completed', 'failed'].includes(movie.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(movie.status, 'completed', JSON.stringify(movie));
  assert.equal(movie.outputs[0].silent, true);
  assert.ok(Math.abs(movie.outputs[0].duration - 1) < 0.1);
  const file = path.join(dataDir, 'outputs', movie.id, '0.mp4');
  for (const [time, channel] of [[0.2, 0], [0.7, 2]]) {
    const { stdout } = await exec('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(time), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
    assert.ok(stdout[channel] > 180, `expected ${channel === 0 ? 'red' : 'blue'} frame at ${time}s`);
  }
  await api.close();
  api = await start();
  const recovered = await api.call(`/api/jobs/${movie.id}`);
  assert.equal(recovered.body.status, 'completed');
  assert.equal((await fetch(`${api.origin}${movie.outputs[0].url}`)).status, 200);
});

// A CPU export interrupted by an API shutdown is safe to recompute from its
// source clips; the persisted item keeps its identity across restart.
test('interrupted movie jobs resume and cancellation aborts the actual encoder task', async (t) => {
  let starts = 0;
  const started = [Promise.withResolvers(), Promise.withResolvers()];
  const tools = { available: async () => true, probe: async () => ({ duration: 1, width: 64, height: 48 }), assemble: async (_clips, _file, { signal }) => {
    started[starts++].resolve();
    await new Promise((resolve, reject) => { if (signal.aborted) reject(new Error('aborted')); else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
  } };
  const { start, dataDir } = await fixture(t, { movieTools: tools });
  const source = randomUUID();
  await mkdir(path.join(dataDir, 'outputs', source), { recursive: true });
  await writeFile(path.join(dataDir, 'outputs', source, '0.mp4'), 'test-only');
  let api = await start();
  const made = (await api.call('/api/movies', { title: 'Restart test', clips: [{ jobId: source }] })).body;
  await started[0].promise;
  await api.close();
  api = await start();
  await api.call('/api/jobs');
  await started[1].promise;
  const canceled = await api.call(`/api/jobs/${made.id}/cancel`, {});
  assert.equal(canceled.status, 202);
  assert.equal(canceled.body.status, 'canceled');
  assert.equal(starts, 2);
  assert.deepEqual(canceled.body.outputs, []);
});

test('uncertain submission uses the same durable idempotency key after a restart', async (t) => {
  const keys = [];
  const client = { workflows: { fromJson: () => ({ setInput() {} }) }, assets: { fromBytes: () => ({}) }, submit: async (_workflow, options) => {
    keys.push(options.idempotencyKey);
    if (keys.length === 1) throw new Error('Transport disconnected before response.');
    return { id: 'accepted-upstream', status: 'canceled', error: null, progress: null };
  } };
  const { start } = await fixture(t, { createClient: () => client });
  let api = await start();
  const created = await api.call('/api/render', request);
  assert.equal(created.body.status, 'queued');
  assert.match(created.body.error, /retry automatically/);
  await api.close();
  api = await start();
  await untilJob(api, created.body.id, 'canceled');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test('background polling copies completed media without an open browser or job request', async (t) => {
  const remote = upstream(), { start, dataDir } = await fixture(t, { createClient: remote.createClient });
  const api = await start({ backgroundPolling: true, pollIntervalMs: 20 });
  const created = (await api.call('/api/render', request)).body;
  remote.records.set('upstream-1', 'succeeded');
  let stored;
  for (let i = 0; i < 100; i++) {
    stored = JSON.parse(await readFile(path.join(dataDir, 'jobs', `${created.id}.json`), 'utf8'));
    if (stored.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(stored.status, 'completed');
  assert.equal((await readFile(path.join(dataDir, 'outputs', created.id, '0.png'))).toString('base64'), PNG);
});

test('the local library accepts twelve queued renders and rejects a thirteenth without submission', async (t) => {
  const remote = upstream(), { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start();
  for (let i = 0; i < 12; i++) assert.equal((await api.call('/api/render', request)).status, 202);
  const overflow = await api.call('/api/render', request);
  assert.equal(overflow.status, 429);
  assert.match(overflow.body.error, /Twelve/);
  assert.equal(remote.submitted.length, 12);
});

test('twelve overlapping upstream submissions each reserve exactly one render slot', async (t) => {
  const gate = Promise.withResolvers();
  const started = Array.from({ length: 12 }, () => Promise.withResolvers());
  let submissions = 0;
  const client = { workflows: { fromJson: () => ({ setInput() {} }) }, assets: { fromBytes: () => ({}) }, submit: async () => {
    const index = submissions++;
    started[index].resolve();
    await gate.promise;
    return { id: `pending-${index}`, status: 'queued', progress: null, refresh: async () => {} };
  } };
  const { start } = await fixture(t, { createClient: () => client });
  const api = await start();
  const first = Array.from({ length: 6 }, () => api.call('/api/render', request));
  let second = [];
  try {
    await promptly(Promise.all(started.slice(0, 6).map((item) => item.promise)));
    second = Array.from({ length: 6 }, () => api.call('/api/render', request));
    const outcome = await promptly(Promise.race([
      Promise.all(started.slice(6).map((item) => item.promise)).then(() => 'all accepted'),
      Promise.all(second).then((responses) => responses.map((item) => item.status)),
    ]));
    assert.equal(outcome, 'all accepted', 'six registered-but-submitting renders must leave six free slots');
    const overflow = await promptly(api.call('/api/render', request));
    assert.equal(overflow.status, 429);
    assert.equal(submissions, 12);
  } finally {
    gate.resolve();
    const results = await Promise.all([...first, ...second]);
    assert.ok(results.every((item) => item.status === 202));
  }
});

test('library and job reads remain available during a stalled upstream submission', async (t) => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const client = { workflows: { fromJson: () => ({ setInput() {} }) }, assets: { fromBytes: () => ({}) }, submit: async () => {
    started.resolve();
    await gate.promise;
    return { id: 'slow-upstream', status: 'queued', progress: null, refresh: async () => {} };
  } };
  const { start, dataDir } = await fixture(t, { createClient: () => client });
  const completeId = randomUUID(), directory = path.join(dataDir, 'outputs', completeId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '0.png'), Buffer.from(PNG, 'base64'));
  const api = await start();
  const creating = api.call('/api/render', request);
  try {
    await promptly(started.promise);
    const listed = await promptly(api.call('/api/jobs'));
    assert.equal(listed.status, 200);
    assert.equal(listed.body.jobs.length, 2);
    const pending = listed.body.jobs.find((job) => job.id !== completeId);
    assert.equal(pending.status, 'queued');
    const detail = await promptly(api.call(`/api/jobs/${pending.id}`));
    assert.equal(detail.body.status, 'queued');
    const complete = listed.body.jobs.find((job) => job.id === completeId);
    assert.equal(complete.status, 'completed');
    const media = await promptly(fetch(`${api.origin}${complete.outputs[0].url}`));
    assert.equal(Buffer.from(await media.arrayBuffer()).toString('base64'), PNG);
  } finally { gate.resolve(); await creating; }
});


test('encoder cancellation waits for the actual child process exit and cleans partial media', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'toybox-cancel-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const encoder = path.join(directory, 'encoder'), marker = path.join(directory, 'exited'), output = path.join(directory, '0.mp4');
  await writeFile(encoder, `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.writeFileSync(process.argv.at(-1), 'partial');\nprocess.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync(${JSON.stringify(marker)}, 'stopped'); process.exit(0); }, 60));\nconsole.log('out_time_us=1');\nsetInterval(() => {}, 1000);\n`);
  await chmod(encoder, 0o700);
  const controller = new AbortController();
  const tools = createMovieTools({ ffmpeg: encoder });
  await assert.rejects(tools.assemble([{ file: path.join(directory, 'unused.mp4'), contentType: 'video/mp4', width: 64, height: 48, inPoint: 0, outPoint: 1 }], output, { signal: controller.signal, progress: () => controller.abort() }), /canceled/);
  assert.equal(await readFile(marker, 'utf8'), 'stopped', 'the rejection must wait for child close, not only AbortSignal delivery');
  await assert.rejects(stat(path.join(directory, '0.partial.mp4')), { code: 'ENOENT' });
});

test('the bundled keyframe workflow receives every guide frame, scales guide positions, and skips missing guides cleanly', async (t) => {
  const graph = JSON.parse(await readFile(new URL('../workflows/ltx-keyframes.api.json', import.meta.url), 'utf8'));
  const mappings = JSON.parse(await readFile(new URL('../workflows/ltx-keyframes.bindings.json', import.meta.url), 'utf8'));
  const remote = upstream(), { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start({ fetchImpl: async () => Response.json({ jobs: [] }) });
  assert.equal((await api.call('/api/workflow', { workflow: graph, bindings: mappings })).status, 200);
  assert.deepEqual((await api.call('/api/health')).body.keyframeGuides, [0.5, 1]);
  const frame = () => `data:image/png;base64,${PNG}`;
  const guided = { image: frame(), keyframes: [frame(), frame()], prompt: 'A little red car crosses a canyon.', seed: 7, duration: 3 };
  const first = await api.call('/api/render', guided);
  assert.equal(first.status, 202, JSON.stringify(first.body));
  const sent = remote.submitted[0].workflow;
  for (const [node, name] of [['5', 'toybox-stage.png'], ['14', 'toybox-keyframe-2.png'], ['16', 'toybox-keyframe-3.png']]) {
    assert.equal(sent[node].inputs.image.__type, 'core/ASSET');
    assert.equal(sent[node].inputs.image.info.file_path, name);
  }
  assert.equal(sent['6'].inputs.length, 73);
  assert.equal(sent['15'].inputs.frame_idx, 36, 'the middle keyframe lands halfway through the clip');
  assert.equal(sent['17'].inputs.frame_idx, 72, 'the last keyframe lands on the final frame');
  assert.deepEqual(sent['18'].inputs.latent, ['10', 0], 'guide latents are cropped before decoding');

  const second = await api.call('/api/render', { ...guided, keyframes: [null, frame()] });
  assert.equal(second.status, 202, JSON.stringify(second.body));
  const skipped = remote.submitted[1].workflow;
  assert.equal(skipped['15'], undefined);
  assert.equal(skipped['14'], undefined, 'an unused keyframe loader is removed with its guide');
  assert.deepEqual(skipped['17'].inputs.positive, ['6', 0]);
  assert.deepEqual(skipped['17'].inputs.latent, ['6', 2]);

  assert.equal((await api.call(`/api/jobs/${first.body.id}/cancel`, {})).status, 202);
  const retried = await api.call(`/api/jobs/${first.body.id}/retry`, {});
  assert.equal(retried.status, 202, JSON.stringify(retried.body));
  assert.equal(remote.submitted[2].workflow['15'].inputs.frame_idx, 36, 'retries keep their saved guide frames');
});

test('restyle submits the bundled image-edit graph with or without a look reference and returns the image', async (t) => {
  const remote = upstream(), { start } = await fixture(t, { createClient: remote.createClient });
  const api = await start({ fetchImpl: async () => Response.json({ jobs: [] }) });
  assert.equal((await api.call('/api/health')).body.restyleAvailable, true);
  remote.nextState = 'succeeded'; remote.outputNode = '16';
  const plain = await api.call('/api/restyle', { image: `data:image/png;base64,${PNG}`, prompt: 'Make it real.', seed: 11 });
  assert.equal(plain.status, 200, JSON.stringify(plain.body));
  assert.equal(plain.body.image, `data:image/png;base64,${PNG}`);
  const graph = remote.submitted[0].workflow;
  assert.equal(graph['9'].inputs.prompt, 'Make it real.');
  assert.equal(graph['14'].inputs.seed, 11);
  assert.equal(graph['7'].inputs.image.__type, 'core/ASSET');
  assert.equal(graph['17'], undefined, 'no reference loader without a reference');
  assert.equal(graph['9'].inputs.image2, undefined);
  const matched = await api.call('/api/restyle', { image: `data:image/png;base64,${PNG}`, reference: `data:image/png;base64,${PNG}`, prompt: 'Match image 2.' });
  assert.equal(matched.status, 200, JSON.stringify(matched.body));
  const referenced = remote.submitted[1].workflow;
  assert.equal(referenced['17'].inputs.image.__type, 'core/ASSET');
  assert.deepEqual(referenced['9'].inputs.image2, ['18', 0]);
  assert.equal((await api.call('/api/restyle', { image: 'https://example.com/a.png', prompt: 'x' })).status, 400);
  remote.nextState = 'failed';
  const failed = await api.call('/api/restyle', { image: `data:image/png;base64,${PNG}`, prompt: 'Make it real.' });
  assert.equal(failed.status, 502);
  assert.match(failed.body.error, /restyle did not finish/);
});
