import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Comfy } from '@comfyorg/sdk';
import { createApp, readConfig, safeError } from './index.mjs';
import { decodeImage, validateWorkflow, validateBindings, mapDuration, durationInfo, validateRender, validateMetadata, guideWorkflow } from './validation.mjs';
import { makeProject, parseProject, compilePrompt } from '../src/lib/project.ts';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNioAAAAASUVORK5CYII=';
const workflow = {
  '1': { class_type: 'LoadImage', inputs: { image: 'stage.png' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a shot', clip: ['4', 1] } },
  '3': { class_type: 'KSampler', inputs: { seed: 42, positive: ['2', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'installed-model.safetensors' } },
  '5': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'toybox' } },
};
const bindings = { image: { nodeId: '1', input: 'image' }, prompt: { nodeId: '2', input: 'text' }, seed: { nodeId: '3', input: 'seed' }, outputNodeId: '5' };
const render = { workflow, bindings, image: `data:image/png;base64,${PNG}`, prompt: 'A miniature car races through a futuristic city.', seed: 781, duration: 5 };

async function serve(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'toybox-test-'));
  const app = await createApp({ env: {}, dataDir, backgroundPolling: false, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, dataDir, request: (pathname, body, headers = {}) => fetch(`${origin}${pathname}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }) };
}

test('workflow validation rejects editor format and socket mappings before contacting Comfy', () => {
  assert.throws(() => validateWorkflow({ nodes: [] }), /API format/);
  assert.throws(() => validateBindings({ ...bindings, image: { nodeId: '3', input: 'positive' } }, workflow), /connected node socket/);
  assert.throws(() => validateBindings({ ...bindings, prompt: { nodeId: '1', input: 'image' } }, workflow), /different workflow input/);
  assert.throws(() => decodeImage('https://example.com/image.png'), /Remote URLs/);
  assert.throws(() => decodeImage('data:image/png;base64,aGVsbG8='), /contents/);
});

test('every maximum-length project field fits the render prompt and metadata contract', () => {
  const project = makeProject();
  project.id = 'p'.repeat(200);
  project.name = 'P'.repeat(200);
  const shot = project.shots[0];
  shot.id = 's'.repeat(200);
  shot.name = 'S'.repeat(200);
  shot.prompt = 'Direction '.repeat(400);
  shot.props = Array.from({ length: 8 }, (_, index) => ({ ...shot.props[0], id: `prop-${index}`, name: 'N'.repeat(200), role: 'R'.repeat(500) }));
  for (const frame of shot.frames) {
    frame.poses = Object.fromEntries(shot.props.map((prop) => [prop.id, { x: -6, z: -4, rotation: -Math.PI * 2 }]));
  }
  project.activeShotId = shot.id;
  const parsed = parseProject(JSON.stringify(project));
  const prompt = compilePrompt(parsed.shots[0]);
  assert.ok(prompt.length > 8000, 'exercise the old API limit with a valid project');
  assert.equal(validateRender({ ...render, prompt }).prompt, prompt);
  const metadata = { projectId: parsed.id, projectName: parsed.name, shotId: parsed.shots[0].id, shotName: parsed.shots[0].name };
  assert.deepEqual(validateMetadata(metadata), metadata);
  assert.throws(() => validateRender({ ...render, prompt: 'x'.repeat(20001) }), /20,000/);
  assert.throws(() => validateMetadata({ shotName: 'x'.repeat(201) }), /200/);
  assert.throws(() => validateMetadata({ projectId: 'x'.repeat(201) }), /200/);
});

test('render metadata preserves exact opaque IDs accepted by project imports', () => {
  const project = makeProject();
  project.id = ' \tproject\u0000identity\n ';
  project.shots[0].id = ' \tshot\u0001identity\r ';
  project.activeShotId = project.shots[0].id;
  const imported = parseProject(JSON.stringify(project));
  const metadata = validateMetadata({ projectId: imported.id, shotId: imported.shots[0].id, projectName: ' Project ', shotName: ' Shot ' });
  assert.equal(metadata.projectId, project.id);
  assert.equal(metadata.shotId, project.shots[0].id);
  assert.equal(metadata.projectName, 'Project');
  assert.equal(metadata.shotName, 'Shot');
  for (const id of ['', ' \t\n ', '__proto__', 'constructor', 'prototype']) {
    assert.throws(() => validateMetadata({ projectId: id }), /valid project identifier/);
  }
});

test('unconfigured server is explicit and never claims to render', async (t) => {
  const { request } = await serve(t);
  const health = await (await request('/api/health')).json();
  assert.equal(health.connected, false);
  assert.equal(health.provider, 'unconfigured');
  const response = await request('/api/render', render);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Connect Comfy first/);
});

test('workflow inspection and persistence retain exact node bindings', async (t) => {
  const { request, dataDir } = await serve(t);
  const inspected = await (await request('/api/workflow', { workflow, inspect: true })).json();
  assert.equal(inspected.nodes.length, 5);
  assert.equal(inspected.configured, false);
  const saved = await request('/api/workflow', { workflow, bindings });
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'workflow.json'), 'utf8')), { workflow, bindings });
  const retrieved = await (await request('/api/workflow')).json();
  assert.equal(retrieved.configured, true);
  assert.deepEqual(retrieved.bindings, bindings);
});

test('bundled starters install with their keyframe mappings, and an imported starter graph brings them along', async (t) => {
  const { request, dataDir } = await serve(t);
  const listed = await (await request('/api/starters')).json();
  assert.deepEqual(listed.map((item) => [item.id, item.active]), [['ltx-keyframes', false], ['ltx-keyframes-hd', false]]);
  const hd = await request('/api/workflow/starter', { id: 'ltx-keyframes-hd' });
  assert.equal(hd.status, 200);
  const stored = JSON.parse(await readFile(path.join(dataDir, 'workflow.json'), 'utf8'));
  assert.equal(stored.workflow['1'].inputs.ckpt_name, 'ltxv-13b-0.9.8-distilled.safetensors');
  assert.equal(stored.bindings.keyframes.length, 7, 'every keyframe guide slot is mapped');
  assert.equal(stored.bindings.duration.unit, 'frames');
  assert.deepEqual((await (await request('/api/starters')).json()).map((item) => item.active), [false, true]);
  assert.equal((await (await request('/api/health')).json()).keyframeSlots, 7);
  const graph = JSON.parse(await readFile(new URL('../workflows/ltx-keyframes.api.json', import.meta.url), 'utf8'));
  const inspected = await (await request('/api/workflow', { workflow: graph, inspect: true })).json();
  assert.equal(inspected.bindings.keyframes.length, 7, 'selecting the starter file keeps its guides');
  assert.equal((await (await request('/api/workflow', { workflow, inspect: true })).json()).bindings, undefined);
  for (const id of ['constructor', '__proto__', '../ltx-keyframes', 'missing']) assert.equal((await request('/api/workflow/starter', { id })).status, 404);
});

test('local browser boundary rejects foreign origins and DNS-rebinding hosts', async (t) => {
  const { request, origin } = await serve(t);
  assert.equal((await request('/api/workflow', { workflow, bindings }, { Origin: 'https://untrusted.example' })).status, 403);
  const reboundStatus = await new Promise((resolve) => http.get(`${origin}/api/health`, { headers: { Host: 'untrusted.example' } }, (response) => { response.resume(); resolve(response.statusCode); }));
  assert.equal(reboundStatus, 403);
  assert.equal((await request('/api/health', undefined, { Origin: 'http://127.0.0.1:5173' })).status, 200);
});

test('production, development, and preview origins can submit workflow requests', async (t) => {
  const { request } = await serve(t);
  for (const host of ['localhost', '127.0.0.1']) {
    for (const port of [3001, 5173, 4173]) {
      const origin = `http://${host}:${port}`;
      const response = await request('/api/workflow', { workflow, inspect: true }, { Origin: origin });
      assert.equal(response.status, 200, origin);
      assert.equal((await response.json()).nodes.length, 5);
    }
  }
  assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: 'http://localhost:4999' })).status, 403);
});

test('custom production PORT allows its exact origins without allowing other ports', async (t) => {
  const { request } = await serve(t, { env: { PORT: '4333' } });
  for (const host of ['localhost', '127.0.0.1']) {
    assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: `http://${host}:4333` })).status, 200);
  }
  assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: 'http://127.0.0.1:3001' })).status, 403);
  assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: 'https://untrusted.example' })).status, 403);
});

test('an explicit origin allowlist continues to replace the defaults', async (t) => {
  const { request } = await serve(t, { env: { PORT: '4333', TOYBOX_ALLOWED_ORIGINS: ' http://localhost:4555, http://127.0.0.1:4555 ' } });
  assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: 'http://127.0.0.1:4555' })).status, 200);
  for (const port of [3001, 4333, 5173, 4173]) {
    assert.equal((await request('/api/workflow', { workflow, inspect: true }, { Origin: `http://127.0.0.1:${port}` })).status, 403);
  }
});

test('configuration only accepts server-owned HTTP endpoints and redacts credentials', () => {
  assert.throws(() => readConfig({ COMFY_BASE_URL: 'file:///etc/passwd' }), /HTTP/);
  assert.throws(() => readConfig({ COMFY_BASE_URL: 'https://user:secret@example.com' }), /credentials/);
  assert.throws(() => readConfig({ COMFY_BASE_URL: 'http://remote.example', COMFY_API_KEY: 'private' }), /HTTPS/);
  assert.equal(safeError(new Error('token=private'), { apiKey: 'private' }), 'token=[redacted]');
});

test('frame-duration mapping keeps native model frame constraints and reports fixed workflows honestly', () => {
  const mapping = { unit: 'frames', fps: 24, frameStep: 8 };
  assert.equal(mapDuration(5, mapping), 121);
  assert.equal(mapDuration(2, mapping), 49);
  assert.equal(mapDuration(5, undefined), 5);
  assert.equal(durationInfo(workflow, bindings).mapped, false);
  assert.throws(() => validateBindings({ ...bindings, duration: { nodeId: '3', input: 'seed', unit: 'frames', fps: 0 } }, workflow), /fps/);
});

test('keyframe mappings need a guide image widget, a valid position, and a bypass that names connected inputs', () => {
  const guided = { ...workflow, '6': { class_type: 'LoadImage', inputs: { image: 'end.png' } }, '7': { class_type: 'Guide', inputs: { positive: ['2', 0], image: ['6', 0], frame_idx: 0 } } };
  guided['3'] = { ...guided['3'], inputs: { ...guided['3'].inputs, positive: ['7', 0] } };
  const keyframe = { nodeId: '6', input: 'image', position: 1, frame: { nodeId: '7', input: 'frame_idx' }, bypass: { nodeId: '7', outputs: ['positive'] } };
  const mapped = validateBindings({ ...bindings, keyframes: [keyframe] }, guided);
  assert.deepEqual(mapped.keyframes, [keyframe]);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...keyframe, position: 0 }] }, guided), /position/);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...keyframe, nodeId: '7', input: 'frame_idx' }] }, guided), /file widget/);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...keyframe, bypass: { nodeId: '7', outputs: ['frame_idx'] } }] }, guided), /bypass/);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...keyframe, nodeId: '1' }] }, guided), /different workflow input/);
  const request = { ...render, workflow: guided, bindings: mapped };
  assert.equal(validateRender({ ...request, keyframes: [render.image] }).keyframes[0].filename, 'toybox-keyframe-2.png');
  assert.equal(validateRender(request).keyframes[0], null, 'a guide with a bypass may be left out');
  assert.throws(() => validateRender({ ...request, bindings: { ...mapped, keyframes: [{ ...keyframe, bypass: undefined }] } }), /needs an image for keyframe 2/);
  assert.throws(() => validateRender({ ...request, keyframes: ['https://example.com/frame.png'] }), /Remote URLs/);
  assert.deepEqual(validateRender({ ...render, keyframes: [render.image] }).keyframes, [], 'studios may send frames a workflow does not use');
  assert.equal(guideWorkflow(guided, mapped, [{}], 49)['7'].inputs.frame_idx, 48);
  const bypassed = guideWorkflow(guided, mapped, [null], 49);
  assert.deepEqual(bypassed['3'].inputs.positive, ['2', 0]);
  assert.equal(bypassed['6'], undefined);
  assert.equal(guided['7'].inputs.frame_idx, 0, 'the saved workflow is never mutated');
});

test('a spare guide slot has no fixed time: it is used only with a position from the studio', () => {
  const guided = { ...workflow, '6': { class_type: 'LoadImage', inputs: { image: 'spare.png' } }, '7': { class_type: 'Guide', inputs: { positive: ['2', 0], image: ['6', 0], frame_idx: 0 } } };
  guided['3'] = { ...guided['3'], inputs: { ...guided['3'].inputs, positive: ['7', 0] } };
  const spare = { nodeId: '6', input: 'image', frame: { nodeId: '7', input: 'frame_idx' }, bypass: { nodeId: '7', outputs: ['positive'] } };
  const mapped = validateBindings({ ...bindings, keyframes: [spare] }, guided);
  assert.equal(mapped.keyframes[0].position, undefined);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...spare, bypass: undefined }] }, guided), /fixed position or a bypass/);
  assert.throws(() => validateBindings({ ...bindings, keyframes: [{ ...spare, frame: undefined }] }, guided), /position/);
  const request = { ...render, workflow: guided, bindings: mapped };
  assert.throws(() => validateRender({ ...request, keyframes: [render.image] }), /needs a position/);
  const placed = validateRender({ ...request, keyframes: [render.image], positions: [.25] });
  assert.equal(placed.keyframes[0].position, .25);
  assert.equal(guideWorkflow(guided, mapped, placed.keyframes, 49)['7'].inputs.frame_idx, 12);
  assert.throws(() => validateRender({ ...request, keyframes: [render.image], positions: [] }), /one position/);
  assert.throws(() => validateRender({ ...request, keyframes: [render.image], positions: [1.5] }), /one position/);
  assert.throws(() => validateRender({ ...request, keyframes: [render.image, render.image], positions: [.5, 1] }), /up to 1 later keyframes/);
});

test('official SDK uploads the image, substitutes widgets, polls, and downloads real response bytes', async (t) => {
  const seen = [];
  let submitted;
  const now = new Date().toISOString();
  const wireJob = (status) => ({
    id: 'upstream-job', status, created_at: now, started_at: now, completed_at: status === 'succeeded' ? now : null,
    expires_at: '2099-01-01T00:00:00Z', queue_position: null, progress: { value: status === 'succeeded' ? 1 : 0.2, nodes_done: 1, nodes_total: 5 },
    outputs: status === 'succeeded' ? [{ id: 'output-asset', node_id: '5', name: 'result.png', type: 'image', content_type: 'image/png', size_bytes: Buffer.from(PNG, 'base64').length }] : [],
    error: null, urls: { self: '/api/v2/jobs/upstream-job', events: '/api/v2/jobs/upstream-job/events', cancel: '/api/v2/jobs/upstream-job/cancel' },
  });
  const fakeFetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    seen.push(`${options.method || 'GET'} ${pathname}`);
    if (options.method === 'HEAD') return new Response(null, { status: 404 });
    if (pathname === '/api/v2/assets' && options.method === 'POST') return Response.json({ id: 'input-asset', hash: null, created_new: true, content_type: 'image/png', size_bytes: 68, created_at: now, url: '', url_expires_at: now }, { status: 201 });
    if (pathname === '/api/v2/jobs' && options.method === 'POST') {
      submitted = JSON.parse(options.body);
      return Response.json(wireJob('queued'), { status: 201 });
    }
    if (pathname === '/api/v2/jobs/upstream-job') return Response.json(wireJob('succeeded'));
    if (pathname === '/api/v2/assets/output-asset/content') return new Response(Buffer.from(PNG, 'base64'), { headers: { 'Content-Type': 'image/png' } });
    throw new Error(`Unexpected SDK request: ${options.method} ${url}`);
  };
  const { request } = await serve(t, { env: { COMFY_BASE_URL: 'http://127.0.0.1:8189' }, createClient: () => new Comfy({ apiKey: 'test-only', fetch: fakeFetch }) });
  const submittedResponse = await request('/api/render', { ...render, workflow: { ...workflow, '6': {class_type: 'CLIPTextEncode', inputs: {text: 'blurry, artifacts'}} }, bindings: { ...bindings, negativePrompt: {nodeId: '6', input: 'text'} } });
  assert.equal(submittedResponse.status, 202, JSON.stringify(await submittedResponse.clone().json()));
  const { id } = await submittedResponse.json();
  assert.equal(submitted.workflow['2'].inputs.text, render.prompt);
  assert.equal(submitted.workflow['3'].inputs.seed, 781);
  assert.equal(submitted.workflow['6'].inputs.text, 'blurry, artifacts');
  assert.equal(submitted.workflow['1'].inputs.image.__type, 'core/ASSET');
  assert.equal(submitted.workflow['1'].inputs.image.info.id, 'input-asset');
  assert.equal(submitted.workflow['1'].inputs.image.info.file_path, 'toybox-stage.png');
  let job;
  for (let attempt = 0; attempt < 100; attempt++) {
    const polled = await request(`/api/jobs/${id}`);
    assert.equal(polled.status, 200, JSON.stringify(await polled.clone().json()));
    job = await polled.json();
    if (['completed', 'failed', 'canceled'].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(job.status, 'completed');
  assert.equal(job.progress, 1);
  assert.equal(job.outputs.length, 1);
  const output = await request(job.outputs[0].url);
  assert.equal(output.status, 200);
  assert.equal(Buffer.from(await output.arrayBuffer()).toString('base64'), PNG);
  assert.ok(seen.includes('POST /api/v2/assets'));
  assert.ok(seen.includes('GET /api/v2/jobs/upstream-job'));
  assert.ok(seen.includes('GET /api/v2/assets/output-asset/content'));
});

test('upstream job failure is returned as failure, without synthetic outputs', async (t) => {
  const handle = { status: 'failed', error: { message: 'The checkpoint is not installed.' }, progress: null };
  const client = { workflows: { fromJson: () => ({ setInput() {} }) }, assets: { fromBytes: () => ({}) }, submit: async () => handle };
  const { request } = await serve(t, { env: { COMFY_BASE_URL: 'http://127.0.0.1:8189' }, createClient: () => client });
  const { id } = await (await request('/api/render', render)).json();
  const result = await (await request(`/api/jobs/${id}`)).json();
  assert.equal(result.status, 'failed');
  assert.match(result.error, /checkpoint/);
  assert.deepEqual(result.outputs, []);
});
