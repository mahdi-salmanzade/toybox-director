import express from 'express';
import { Comfy } from '@comfyorg/sdk';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore, publicJob, terminalJob, isJobId } from './job-store.mjs';
import { createMovieTools, validateMovie } from './movies.mjs';
import { productionFiles } from './production.mjs';
import { RESTYLE_NODES, restyleGraph, validateRestyle } from './restyle.mjs';
import { RequestError, validateWorkflow, validateBindings, workflowNodes, validateRender, mapDuration, durationInfo, validateMetadata, allowedStudioOrigins, guideWorkflow } from './validation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const TERMINAL_CONFIRMATION_MS = 30_000;
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg' };

export function readConfig(env = process.env) {
  const apiKey = env.COMFY_API_KEY?.trim() || '';
  const supplied = env.COMFY_BASE_URL?.trim();
  const configured = Boolean(supplied || apiKey);
  const baseUrl = (supplied || 'https://cloud.comfy.org').replace(/\/+$/, '');
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[?#]/.test(baseUrl)) {
    throw new Error('COMFY_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  const provider = local ? 'local' : parsed.hostname.endsWith('.run.comfy.app') ? 'serverless' : 'cloud';
  if (apiKey && parsed.protocol !== 'https:' && !local) throw new Error('Use HTTPS when sending a Comfy API key to a remote endpoint.');
  return { configured, baseUrl, apiKey, provider };
}

export function safeError(error, config) {
  let message = error?.message || 'The Comfy request failed.';
  if (config.apiKey) message = String(message).split(config.apiKey).join('[redacted]');
  return String(message).replace(/(?:\/Users\/|\/home\/|\/private\/|\/tmp\/)[^\s'"<>]+/g, '[local file]').slice(0, 1200);
}

export async function createApp(options = {}) {
  const env = options.env ?? process.env;
  const config = readConfig(env);
  const dataDir = options.dataDir ?? path.join(ROOT, '.toybox');
  const workflowPath = path.join(dataDir, 'workflow.json');
  const outputsDir = path.join(dataDir, 'outputs');
  const fetchImpl = options.fetchImpl ?? fetch;
  const makeClient = options.createClient ?? (() => new Comfy({ apiKey: config.apiKey || undefined, timeoutMs: 120_000, clientInfo: 'toybox-director/0.1' }));
  let client;
  let saved;
  const submitting = { render: 0, movie: 0 };
  let closing = false;
  const store = new JobStore(path.join(dataDir, 'jobs'));
  const movieTools = options.movieTools ?? createMovieTools();
  const movieExportAvailable = await movieTools.available();
  let healthCache;
  const jobs = new Map((await store.load()).map((record) => [record.id, { record, handle: null, poll: null, lastPolled: 0, task: null }]));
  // Earlier versions saved media without library records. Recover those files
  // without deleting or guessing a prompt, workflow, or source scene.
  try {
    for (const entry of await readdir(outputsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isJobId(entry.name) || jobs.has(entry.name)) continue;
      const outputs = [];
      for (const file of await readdir(path.join(outputsDir, entry.name), { withFileTypes: true })) {
        if (!file.isFile() || !/^\d+\.(png|jpg|webp|gif|mp4|webm|mov|mp3|wav|ogg)$/.test(file.name)) continue;
        const contentType = Object.entries(MIME_EXT).find(([, ext]) => ext === path.extname(file.name))?.[0];
        if (contentType) outputs.push({ url: `/api/outputs/${entry.name}/${file.name}`, type: contentType.split('/')[0], contentType, name: file.name });
      }
      if (!outputs.length) continue;
      const info = await stat(path.join(outputsDir, entry.name));
      const record = { version: 1, id: entry.name, kind: 'render', status: 'completed', createdAt: info.birthtimeMs || info.mtimeMs, updatedAt: Date.now(), outputs, metadata: { shotName: 'Recovered render' } };
      await store.save(record);
      jobs.set(record.id, { record, handle: null, poll: null, lastPolled: 0, task: null });
    }
  } catch (error) { if (error.code !== 'ENOENT') console.warn('Some older render files could not be indexed; their media has been preserved.'); }
  // Probe older videos once so the editor can offer accurate trim bounds.
  if (movieExportAvailable) for (const job of jobs.values()) {
    let changed = false;
    for (const output of job.record.outputs) {
      if (output.type !== 'video' || typeof output.duration === 'number') continue;
      const prefix = `/api/outputs/${job.record.id}/`, filename = output.url?.slice(prefix.length);
      if (!output.url?.startsWith(prefix) || !/^\d+\.(mp4|webm|mov)$/.test(filename)) continue;
      try { Object.assign(output, await movieTools.probe(path.join(outputsDir, job.record.id, filename), output.contentType)); changed = true; } catch { /* Preserve the original output if probing fails. */ }
    }
    if (changed) await store.save(job.record);
  }
  let restyleWorkflow = null;
  try {
    restyleWorkflow = validateWorkflow(JSON.parse(await readFile(options.restyleWorkflowPath ?? path.join(ROOT, 'workflows', 'qwen-restyle.api.json'), 'utf8')));
  } catch (error) { if (error.code !== 'ENOENT') console.warn('The restyle workflow was not loaded:', safeError(error, config)); }
  let restyling = 0;
  const allowedOrigins = allowedStudioOrigins(env);
  try {
    const stored = JSON.parse(await readFile(workflowPath, 'utf8'));
    const workflow = validateWorkflow(stored.workflow);
    saved = { workflow, bindings: validateBindings(stored.bindings, workflow) };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Saved workflow was not loaded:', safeError(error, config));
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'This origin is not allowed to use the local Toybox API.' });
    // A browser cannot choose its Host header: reject DNS-rebinding hosts too.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) && ![...allowedOrigins].some((item) => new URL(item).hostname === req.hostname)) {
      return res.status(403).json({ error: 'This host is not allowed to use the Toybox API.' });
    }
    next();
  });
  // Three 8 MB keyframes, base64-encoded, plus the shot direction.
  app.use('/api', express.json({ limit: '36mb', strict: true }));
  const getClient = () => {
    if (!config.configured) throw new RequestError('Connect Comfy first: set COMFY_BASE_URL for your local API proxy or COMFY_API_KEY for Comfy Cloud in .env, then restart the server.', 503);
    if (!client) client = makeClient(config);
    return client;
  };

  app.get('/api/health', async (_req, res) => {
    if (!config.configured) return res.json({ connected: false, provider: 'unconfigured', workflowConfigured: Boolean(saved), keyframeGuides: guidePositions(), restyleAvailable: Boolean(restyleWorkflow), movieExportAvailable, message: 'Connect a local Comfy API proxy or add a Comfy Cloud API key in .env. See docs/COMFY.md.' });
    if (healthCache && Date.now() - healthCache.time < 5000) return res.json({ ...healthCache.value, workflowConfigured: Boolean(saved), keyframeGuides: guidePositions(), restyleAvailable: Boolean(restyleWorkflow), movieExportAvailable });
    let value;
    try {
      getClient();
      const response = await fetchImpl(`${config.baseUrl}/api/v2/jobs?limit=1`, {
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      const body = await response.json().catch(() => ({}));
      // Cloud currently returns its documented not_implemented for listing.
      const connected = (response.ok && Array.isArray(body.jobs)) || (response.status === 501 && body.error?.code === 'not_implemented');
      const message = connected ? 'Comfy API v2 is reachable. Your workflow determines available models and render cost.' : response.status === 401 || response.status === 403 ? 'Comfy rejected the API key. Check COMFY_API_KEY and restart the server.' : `Comfy API v2 did not respond as expected (HTTP ${response.status}). Local ComfyUI needs comfy-api-proxy on port 8189.`;
      value = { connected, provider: config.provider, message };
    } catch (error) {
      value = { connected: false, provider: config.provider, message: `Cannot connect to Comfy. ${safeError(error, config)}` };
    }
    healthCache = { time: Date.now(), value };
    return res.json({ ...value, workflowConfigured: Boolean(saved), keyframeGuides: guidePositions(), restyleAvailable: Boolean(restyleWorkflow), movieExportAvailable });
  });

  app.get('/api/workflow', (_req, res) => res.json(saved ? { configured: true, ...saved, nodes: workflowNodes(saved.workflow), duration: durationInfo(saved.workflow, saved.bindings) } : { configured: false, workflow: null, bindings: null, nodes: [] }));
  app.post('/api/workflow', async (req, res) => {
    const workflow = validateWorkflow(req.body?.workflow);
    // Validation-only supports inspecting widgets before committing mappings.
    if (req.body.inspect === true) return res.json({ configured: false, workflow, nodes: workflowNodes(workflow) });
    const bindings = validateBindings(req.body.bindings, workflow);
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temp = `${workflowPath}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify({ workflow, bindings }, null, 2), { mode: 0o600 });
    await rename(temp, workflowPath);
    saved = { workflow, bindings };
    return res.json({ configured: true, ...saved, nodes: workflowNodes(workflow), duration: durationInfo(workflow, bindings) });
  });

  const persist = async (job) => {
    job.record.updatedAt = Date.now();
    await store.save(job.record);
  };
  const activeCount = (kind) => [...jobs.values()].filter((job) => job.record.kind === kind && !terminalJob(job.record)).length;
  const findJob = (id) => {
    const job = jobs.get(id);
    if (!job || job.deleting) throw new RequestError('This item is no longer in the render library.', 404);
    return job;
  };
  const normalizedRequest = (body, input) => ({ image: body.image, ...(input.keyframes.length ? { keyframes: input.keyframes.map((item) => item?.source ?? null) } : {}), workflow: input.workflow, bindings: input.bindings, prompt: input.prompt, negativePrompt: input.negativePrompt, seed: input.seed, duration: input.duration });
  const guidePositions = () => saved?.bindings.keyframes?.map((item) => item.position) ?? [];

  async function ensureHandle(job) {
    if (job.handle) return job.handle;
    const record = job.record;
    if (record.providerBaseUrl !== config.baseUrl) throw new RequestError('This render belongs to a different Comfy connection. Restore its COMFY_BASE_URL to resume it.', 409);
    const comfy = getClient();
    if (record.upstreamId) {
      job.handle = await comfy.jobs.get(record.upstreamId);
      return job.handle;
    }
    // The idempotency key is written before submission. Reusing it after a
    // transport failure or process restart recovers the original remote job.
    const input = validateRender(record.request);
    const duration = mapDuration(input.duration, input.bindings.duration);
    const wf = comfy.workflows.fromJson(guideWorkflow(input.workflow, input.bindings, input.keyframes, input.bindings.duration?.unit === 'frames' ? duration : undefined));
    const asset = (image) => comfy.assets.fromBytes(image.bytes, { filename: image.filename, contentType: image.contentType });
    const values = { image: asset(input.image), prompt: input.prompt, negativePrompt: input.negativePrompt, seed: input.seed, duration };
    for (const [key, value] of Object.entries(values)) {
      const binding = input.bindings[key];
      if (binding && value !== undefined) wf.setInput(binding.nodeId, binding.input, value);
    }
    for (const [index, binding] of (input.bindings.keyframes ?? []).entries()) {
      if (input.keyframes[index]) wf.setInput(binding.nodeId, binding.input, asset(input.keyframes[index]));
    }
    job.handle = await comfy.submit(wf, { idempotencyKey: record.idempotencyKey, signal: AbortSignal.timeout(120_000) });
    record.upstreamId = job.handle.id;
    await persist(job);
    return job.handle;
  }

  async function collectOutputs(job) {
    const record = job.record;
    if (record.outputs.length) return;
    const handles = record.outputNodeId ? job.handle.getOutputs(record.outputNodeId) : job.handle.outputs;
    const supported = handles.filter((output) => MIME_EXT[output.contentType]);
    if (!supported.length) throw new RequestError('Comfy finished but returned no playable image, video, or audio. Check your Save/Combine output node and its mapping.', 422);
    if (supported.length > 12) throw new RequestError('This workflow returned more than 12 media files. Select one output node.', 422);
    const directory = path.join(outputsDir, record.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const outputs = [];
    for (const [index, output] of supported.entries()) {
      if (output.sizeBytes > MAX_OUTPUT_BYTES) throw new RequestError('A generated file exceeds the 256 MB download limit. Use a shorter or smaller render.', 422);
      const filename = `${index}${MIME_EXT[output.contentType]}`, file = path.join(directory, filename), temporary = `${file}.download`;
      await output.toFile(temporary, { timeoutMs: 120_000 });
      if ((await stat(temporary)).size > MAX_OUTPUT_BYTES) {
        await rm(temporary, { force: true });
        throw new RequestError('A generated file exceeds the 256 MB download limit.', 422);
      }
      await rename(temporary, file);
      const item = { url: `/api/outputs/${record.id}/${filename}`, type: output.contentType.split('/')[0], contentType: output.contentType, name: output.name };
      if (item.type === 'video' && movieExportAvailable) {
        try { Object.assign(item, await movieTools.probe(file, item.contentType)); } catch { /* The original output remains available even if FFprobe cannot read it. */ }
      }
      outputs.push(item);
    }
    record.outputs = outputs;
  }

  async function adoptHandle(job) {
    const state = job.handle.status, record = job.record;
    // The local proxy reads ComfyUI history and queue separately. A job moving
    // between them can briefly appear expired, including after an interrupt.
    // Confirm that state on subsequent polls rather than freezing a false
    // failure. An accepted cancel is still not proof the GPU has stopped.
    if (state === 'expired') {
      record.expiryObservedAt ??= Date.now();
      if (Date.now() - record.expiryObservedAt < TERMINAL_CONFIRMATION_MS) {
        record.status = record.cancelAcceptedAt ? 'canceling' : record.status === 'queued' ? 'queued' : 'running';
        record.error = record.cancelAcceptedAt ? 'Waiting for Comfy to confirm cancellation.' : 'Waiting for Comfy to publish the final job status.';
        await persist(job);
        return;
      }
    } else delete record.expiryObservedAt;
    record.status = state === 'succeeded' ? 'running' : state === 'canceled' ? 'canceled' : ['failed', 'expired'].includes(state) ? 'failed' : state === 'queued' ? 'queued' : state === 'canceling' ? 'canceling' : 'running';
    record.error = undefined;
    if (typeof job.handle.progress?.value === 'number') record.progress = Math.min(1, Math.max(0, job.handle.progress.value));
    if (state === 'succeeded') {
      await collectOutputs(job);
      record.status = 'completed';
      record.progress = 1;
    } else if (record.status === 'failed' || record.status === 'canceled') {
      record.error = state === 'expired' && record.cancelAcceptedAt ? 'Comfy no longer reports this job. Cancellation could not be confirmed.' : safeError(job.handle.error || { message: `The Comfy job was ${state}.` }, config);
    }
    await persist(job);
  }

  async function refreshJob(job, { force = false } = {}) {
    if (closing || terminalJob(job.record) || job.deleting) return;
    if (job.record.kind === 'movie') { if (!job.task) startMovie(job); return; }
    if (job.poll) return job.poll;
    if (!force && Date.now() - job.lastPolled < 1500) return;
    job.poll = (async () => {
      try {
        const hadHandle = Boolean(job.handle);
        await ensureHandle(job);
        if (hadHandle && !['succeeded', 'failed', 'canceled'].includes(job.handle.status)) await job.handle.refresh(AbortSignal.timeout(20_000));
        await adoptHandle(job);
      } catch (error) {
        const status = error.httpStatus ?? error.status;
        if (status === 404 || status === 410) {
          job.record.status = 'failed';
          job.record.error = 'Comfy no longer has this job. Its saved inputs are available; retry it to start a new render.';
        } else if (error instanceof RequestError && ![503, 409].includes(status) || (status >= 400 && status < 500 && ![408, 409, 429].includes(status))) {
          job.record.status = 'failed';
          job.record.error = safeError(error, config);
        } else {
          job.record.error = `Connection interrupted. Toybox will retry automatically. ${safeError(error, config)}`;
        }
        await persist(job);
      }
    })().finally(() => { job.poll = null; job.lastPolled = Date.now(); });
    return job.poll;
  }

  async function createRender(body, metadata) {
    const input = validateRender(body, saved);
    getClient();
    if (activeCount('render') + submitting.render >= 12) throw new RequestError('Twelve renders are already in progress. Wait for one to finish.', 429);
    submitting.render++;
    let reserved = true;
    try {
      const frames = mapDuration(input.duration, input.bindings.duration);
      const record = { version: 1, id: randomUUID(), kind: 'render', status: 'queued', createdAt: Date.now(), updatedAt: Date.now(), metadata, outputs: [], providerBaseUrl: config.baseUrl, idempotencyKey: randomUUID(), outputNodeId: input.bindings.outputNodeId, request: normalizedRequest(body, input), renderSeconds: input.bindings.duration ? input.bindings.duration.unit === 'frames' ? frames / input.bindings.duration.fps : input.duration : null };
      const job = { record, handle: null, poll: null, lastPolled: 0, task: null };
      await store.save(record);
      jobs.set(record.id, job);
      // From this point activeCount owns the slot. Keeping the reservation
      // during upstream submission would count every pending render twice.
      submitting.render--;
      reserved = false;
      await refreshJob(job, { force: true });
      job.lastPolled = 0;
      return publicJob(record);
    } finally { if (reserved) submitting.render--; }
  }

  // Restyle one stage capture with the bundled image-edit workflow and return the image.
  app.post('/api/restyle', async (req, res) => {
    const input = validateRestyle(req.body);
    if (!restyleWorkflow) throw new RequestError('The restyle workflow is missing. Restore workflows/qwen-restyle.api.json.', 503);
    const comfy = getClient();
    if (restyling >= 2) throw new RequestError('Two restyles are already running. Wait for one to finish.', 429);
    restyling++;
    try {
      const asset = (image) => comfy.assets.fromBytes(image.bytes, { filename: image.filename, contentType: image.contentType });
      const wf = comfy.workflows.fromJson(restyleGraph(restyleWorkflow, input));
      wf.setInput(RESTYLE_NODES.image, 'image', asset(input.image));
      if (input.reference) wf.setInput(RESTYLE_NODES.reference, 'image', asset(input.reference));
      const handle = await comfy.submit(wf, { signal: AbortSignal.timeout(120_000) });
      try { await handle.result(AbortSignal.timeout(15 * 60_000)); }
      catch (error) { throw new RequestError(`The restyle did not finish in Comfy. ${safeError(handle.error ?? error, config)}`, 502); }
      const output = handle.getOutputs(RESTYLE_NODES.output).find((item) => ['image/png', 'image/jpeg', 'image/webp'].includes(item.contentType));
      if (!output) throw new RequestError('Comfy finished without a restyled image.', 422);
      const bytes = await output.toBytes({ timeoutMs: 120_000 });
      res.json({ image: `data:${output.contentType};base64,${Buffer.from(bytes).toString('base64')}` });
    } finally { restyling--; }
  });

  app.post('/api/render', async (req, res) => res.status(202).json(await createRender(req.body, validateMetadata(req.body?.metadata))));

  const requestRefresh = (job) => {
    void refreshJob(job).catch(() => { console.warn('A render status could not be saved; it will be retried.'); });
  };
  app.get('/api/jobs', (_req, res) => {
    // Reads expose the current local snapshot. A slow submission, recovery,
    // or media download must not hide the rest of the durable library.
    for (const job of jobs.values()) requestRefresh(job);
    res.json({ jobs: [...jobs.values()].filter((job) => !job.deleting).map((job) => publicJob(job.record)).sort((a, b) => b.createdAt - a.createdAt) });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = findJob(req.params.id);
    requestRefresh(job);
    res.json(publicJob(job.record));
  });
  app.post('/api/jobs/:id/cancel', async (req, res) => {
    const job = findJob(req.params.id);
    if (terminalJob(job.record)) throw new RequestError('This job has already finished.', 409);
    if (job.record.kind === 'movie') {
      if (!job.task) startMovie(job);
      job.controller.abort();
      await job.task;
    } else {
      if (job.poll) await job.poll;
      job.poll = (async () => {
        await ensureHandle(job);
        // Adopt the real server response: cancellation can lose a race to completion.
        await job.handle.cancel(AbortSignal.timeout(20_000));
        job.record.cancelAcceptedAt = Date.now();
        delete job.record.expiryObservedAt;
        await adoptHandle(job);
      })().finally(() => { job.poll = null; job.lastPolled = Date.now(); });
      await job.poll;
    }
    res.status(202).json(publicJob(job.record));
  });
  app.post('/api/jobs/:id/retry', async (req, res) => {
    const job = findJob(req.params.id);
    if (!['failed', 'canceled'].includes(job.record.status)) throw new RequestError('Only failed or canceled jobs can be retried.', 409);
    if (job.record.kind === 'movie') return res.status(202).json(await createMovie({ ...job.record.movie, metadata: job.record.metadata }));
    if (!job.record.request) throw new RequestError('This older render has no saved inputs to retry.', 409);
    res.status(202).json(await createRender(job.record.request, job.record.metadata));
  });
  app.delete('/api/jobs/:id', async (req, res) => {
    const job = findJob(req.params.id);
    if (!terminalJob(job.record)) throw new RequestError('Cancel this job and wait for it to finish before deleting it.', 409);
    if ([...jobs.values()].some((other) => !terminalJob(other.record) && other.record.movie?.clips.some((clip) => clip.jobId === job.record.id))) throw new RequestError('A movie is using this clip. Wait for that export to finish before deleting it.', 409);
    job.deleting = true;
    try {
      await store.remove(job.record.id);
      await rm(path.join(outputsDir, job.record.id), { force: true, recursive: true });
      jobs.delete(job.record.id);
    } catch (error) { job.deleting = false; await persist(job); throw error; }
    res.status(204).end();
  });

  async function movieClips(movie, signal) {
    const clips = [];
    let total = 0;
    for (const clip of movie.clips) {
      signal?.throwIfAborted();
      const source = findJob(clip.jobId).record;
      const output = source.outputs[clip.outputIndex];
      if (source.status !== 'completed' || !output || output.type !== 'video' || !['video/mp4', 'video/webm', 'video/quicktime'].includes(output.contentType)) throw new RequestError('Every movie clip must be a completed video from your render library.');
      const prefix = `/api/outputs/${source.id}/`, filename = output.url.slice(prefix.length);
      if (!output.url.startsWith(prefix) || !/^\d+\.(mp4|webm|mov)$/.test(filename)) throw new RequestError('This library video has an invalid media reference.', 422);
      const file = path.join(outputsDir, source.id, filename);
      let info;
      try { info = await movieTools.probe(file, output.contentType, { signal }); } catch (error) { if (signal?.aborted) throw error; throw new RequestError('A selected video is missing or cannot be decoded. Render that shot again.', 422); }
      const end = clip.outPoint ?? info.duration;
      if (clip.inPoint >= info.duration || end > info.duration + 0.05 || end - clip.inPoint < 1 / 24) throw new RequestError('Clip trim points must fit inside the video and leave at least one frame.');
      total += Math.min(end, info.duration) - clip.inPoint;
      if (total > 300) throw new RequestError('Keep a movie under five minutes. Trim or remove a clip.');
      clips.push({ ...clip, ...info, outPoint: Math.min(end, info.duration), file, contentType: output.contentType });
    }
    return clips;
  }

  function startMovie(job) {
    if (job.task || closing) return;
    job.controller = new AbortController();
    job.task = (async () => {
      try {
        if (!movieExportAvailable) throw new RequestError('Movie export needs FFmpeg and FFprobe available on PATH. Install them, then restart Toybox.', 503);
        job.record.status = 'running';
        job.record.error = undefined;
        job.record.progress = 0;
        await persist(job);
        const clips = await movieClips(job.record.movie, job.controller.signal);
        const file = path.join(outputsDir, job.record.id, '0.mp4');
        const info = await movieTools.assemble(clips, file, { signal: job.controller.signal, progress: (progress) => { job.record.progress = progress; } });
        job.record.outputs = [{ url: `/api/outputs/${job.record.id}/0.mp4`, type: 'video', contentType: 'video/mp4', name: `${job.record.title}.mp4`, ...info }];
        job.record.status = 'completed';
        job.record.progress = 1;
      } catch (error) {
        if (closing && job.controller.signal.aborted) { job.record.status = 'queued'; job.record.error = 'Movie export will resume when Toybox restarts.'; }
        else { job.record.status = job.controller.signal.aborted ? 'canceled' : 'failed'; job.record.error = job.controller.signal.aborted ? 'Movie export canceled.' : safeError(error, config); }
      }
      await persist(job);
    })().finally(() => { job.task = null; });
    // Keep a storage failure observable without crashing the API process.
    void job.task.catch(() => { console.warn('A movie status could not be saved. Check that the Toybox data disk has free space.'); });
  }

  async function createMovie(body) {
    if (!movieExportAvailable) throw new RequestError('Movie export needs FFmpeg and FFprobe available on PATH. Install them, then restart Toybox.', 503);
    const movie = validateMovie(body), metadata = validateMetadata(body.metadata ?? { projectId: body.projectId, projectName: body.projectName });
    if (activeCount('movie') + submitting.movie >= 2) throw new RequestError('Two movies are already exporting. Wait for one to finish.', 429);
    submitting.movie++;
    try {
      await movieClips(movie);
      const record = { version: 1, id: randomUUID(), kind: 'movie', status: 'queued', createdAt: Date.now(), updatedAt: Date.now(), title: movie.title, metadata, outputs: [], movie };
      const job = { record, handle: null, poll: null, lastPolled: 0, task: null };
      await store.save(record);
      jobs.set(record.id, job);
      startMovie(job);
      return publicJob(record);
    } finally { submitting.movie--; }
  }
  app.post('/api/movies', async (req, res) => res.status(202).json(await createMovie(req.body)));

  // Poll independently of browser tabs so completed media is copied locally
  // before the upstream platform's retention window expires.
  const timer = options.backgroundPolling === false ? null : setInterval(() => {
    for (const job of jobs.values()) requestRefresh(job);
  }, options.pollIntervalMs ?? 2500);
  timer?.unref();
  app.locals.close = async () => {
    closing = true;
    clearInterval(timer);
    for (const job of jobs.values()) job.controller?.abort();
    await Promise.allSettled([...jobs.values()].flatMap((job) => [job.task, job.poll].filter(Boolean)));
    await store.flush();
  };

  app.use('/api/outputs', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    next();
  }, express.static(outputsDir, { dotfiles: 'deny', index: false, fallthrough: false }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (options.distDir !== false) app.use(productionFiles(options.distDir ?? path.join(ROOT, 'dist')));
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 400 : error.status ?? error.httpStatus ?? 502;
    const message = status === 413 ? 'Request is too large. Use keyframe images under 8 MB each.' : error instanceof SyntaxError ? 'The request contains invalid JSON.' : safeError(error, config);
    res.status(status >= 400 && status <= 599 ? status : 502).json({ error: message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const app = await createApp();
  const server = app.listen(port, '127.0.0.1', () => console.log(`Toybox API listening on http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { server.close(); await app.locals.close(); process.exit(0); });
}
