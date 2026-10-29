export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function allowedStudioOrigins(env = process.env) {
  if (env.TOYBOX_ALLOWED_ORIGINS) {
    return new Set(env.TOYBOX_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
  }
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const ports = new Set([port, 5173, 4173]);
  return new Set([...ports].flatMap((value) => [`http://localhost:${value}`, `http://127.0.0.1:${value}`]));
}

export function validateWorkflow(workflow) {
  if (!isObject(workflow) || Array.isArray(workflow.nodes)) {
    throw new RequestError('Import a ComfyUI workflow saved in API format (not the visual editor JSON).');
  }
  const entries = Object.entries(workflow);
  if (entries.length === 0 || entries.length > 500 || JSON.stringify(workflow).length > 1024 * 1024) {
    throw new RequestError('The workflow must contain 1–500 nodes and be smaller than 1 MB.');
  }
  for (const [id, node] of entries) {
    if (forbidden.has(id) || !isObject(node) || typeof node.class_type !== 'string' || !node.class_type || !isObject(node.inputs)) {
      throw new RequestError(`Node ${id} is not a valid API-format node with class_type and inputs.`);
    }
    if (Object.keys(node.inputs).some((key) => forbidden.has(key))) {
      throw new RequestError('The workflow contains an invalid input name.');
    }
  }
  return structuredClone(workflow);
}

export function validateBindings(bindings, workflow) {
  if (!isObject(bindings)) throw new RequestError('Map the workflow image and prompt inputs before rendering.');
  const result = {};
  for (const name of ['image', 'prompt', 'negativePrompt', 'seed', 'duration']) {
    const binding = bindings[name];
    if (!binding) {
      if (name === 'image' || name === 'prompt') throw new RequestError(`Choose a ${name} input mapping.`);
      continue;
    }
    if (!isObject(binding) || typeof binding.nodeId !== 'string' || typeof binding.input !== 'string' || forbidden.has(binding.input)) {
      throw new RequestError(`The ${name} mapping needs a nodeId and input name.`);
    }
    const node = workflow[binding.nodeId];
    if (!node || !Object.hasOwn(node.inputs, binding.input)) {
      throw new RequestError(`The ${name} mapping does not match an input in this workflow.`);
    }
    const value = node.inputs[binding.input];
    if (Array.isArray(value) || isObject(value)) {
      throw new RequestError(`Map ${name} to a widget value, not a connected node socket.`);
    }
    if (['image', 'prompt', 'negativePrompt'].includes(name) && typeof value !== 'string') {
      throw new RequestError(`The ${name} mapping must point to a text/file widget.`);
    }
    if (['seed', 'duration'].includes(name) && typeof value !== 'number') {
      throw new RequestError(`The ${name} mapping must point to a numeric widget.`);
    }
    result[name] = { nodeId: binding.nodeId, input: binding.input };
    if (name === 'duration' && binding.unit === 'frames') {
      if (!Number.isInteger(binding.fps) || binding.fps < 1 || binding.fps > 60 || !Number.isInteger(binding.frameStep ?? 1) || (binding.frameStep ?? 1) < 1 || (binding.frameStep ?? 1) > 32) {
        throw new RequestError('A frame-duration mapping needs fps (1–60) and an optional frameStep (1–32).');
      }
      Object.assign(result[name], { unit: 'frames', fps: binding.fps, frameStep: binding.frameStep ?? 1 });
    } else if (name === 'duration' && binding.unit && binding.unit !== 'seconds') {
      throw new RequestError('A duration mapping uses seconds or frames.');
    }
  }
  if (bindings.keyframes !== undefined) result.keyframes = validateKeyframeBindings(bindings.keyframes, workflow);
  const slots = [...Object.values(result), ...(result.keyframes ?? []).flatMap((item) => [item, ...(item.frame ? [item.frame] : [])])]
    .filter((item) => !Array.isArray(item)).map((item) => `${item.nodeId}\0${item.input}`);
  if (new Set(slots).size !== slots.length) throw new RequestError('Each mapping must use a different workflow input.');
  if (bindings.outputNodeId !== undefined && bindings.outputNodeId !== '') {
    if (typeof bindings.outputNodeId !== 'string' || !Object.hasOwn(workflow, bindings.outputNodeId)) {
      throw new RequestError('The output node does not exist in this workflow.');
    }
    result.outputNodeId = bindings.outputNodeId;
  }
  return result;
}

const widget = (binding, workflow, type, label) => {
  if (!isObject(binding) || typeof binding.nodeId !== 'string' || typeof binding.input !== 'string' || forbidden.has(binding.input)) {
    throw new RequestError(`The ${label} mapping needs a nodeId and input name.`);
  }
  const node = workflow[binding.nodeId];
  if (!node || !Object.hasOwn(node.inputs, binding.input) || typeof node.inputs[binding.input] !== type) {
    throw new RequestError(`The ${label} mapping must point to a ${type === 'string' ? 'file' : 'numeric'} widget in this workflow.`);
  }
  return { nodeId: binding.nodeId, input: binding.input };
};

/**
 * Later keyframes guide the video at a position in the clip (0–1]. A guide
 * with a bypass can be left out: its node is removed and each consumer of
 * output N is connected to the input named by bypass.outputs[N]. A guide with
 * a frame mapping but no fixed position is a spare slot: it is used only when
 * the studio sends that keyframe's position.
 */
const validPosition = (value) => typeof value === 'number' && value > 0 && value <= 1;

function validateKeyframeBindings(keyframes, workflow) {
  if (!Array.isArray(keyframes) || keyframes.length < 1 || keyframes.length > 8) throw new RequestError('Keyframe mappings must be a list of 1–8 guide images.');
  return keyframes.map((binding, index) => {
    const label = `keyframe ${index + 2}`;
    const result = widget(binding, workflow, 'string', label);
    if (binding.frame !== undefined) result.frame = widget(binding.frame, workflow, 'number', `${label} frame`);
    if (binding.position !== undefined || !result.frame) {
      if (!validPosition(binding.position)) throw new RequestError(`The ${label} mapping needs a position after 0 and up to 1.`);
      result.position = binding.position;
    } else if (binding.bypass === undefined) throw new RequestError(`The ${label} mapping needs a fixed position or a bypass.`);
    if (binding.bypass !== undefined) {
      const { nodeId, outputs } = binding.bypass ?? {};
      const node = typeof nodeId === 'string' && !forbidden.has(nodeId) ? workflow[nodeId] : undefined;
      if (!node || !Array.isArray(outputs) || outputs.length < 1 || outputs.length > 8 || outputs.some((name) => typeof name !== 'string' || forbidden.has(name) || !Array.isArray(node.inputs[name]))) {
        throw new RequestError(`The ${label} bypass must name a node and the connected input behind each of its outputs.`);
      }
      result.bypass = { nodeId, outputs: [...outputs] };
    }
    return result;
  });
}

/** Apply guide frame positions and remove unused guides before submission. */
export function guideWorkflow(workflow, bindings, keyframes, frames) {
  const graph = structuredClone(workflow);
  for (const [index, binding] of (bindings.keyframes ?? []).entries()) {
    if (keyframes[index]) {
      const position = keyframes[index].position ?? binding.position;
      if (binding.frame && Number.isInteger(frames)) graph[binding.frame.nodeId].inputs[binding.frame.input] = Math.round(position * (frames - 1));
      continue;
    }
    const { nodeId, outputs } = binding.bypass;
    const guide = graph[nodeId];
    delete graph[nodeId];
    for (const node of Object.values(graph)) {
      for (const [name, value] of Object.entries(node.inputs)) {
        if (!Array.isArray(value) || value[0] !== nodeId) continue;
        if (!outputs[value[1]]) throw new RequestError(`Keyframe ${index + 2} cannot be skipped: its bypass does not cover output ${value[1]}.`);
        node.inputs[name] = guide.inputs[outputs[value[1]]];
      }
    }
    const loaderStillUsed = Object.values(graph).some((node) => Object.values(node.inputs).some((value) => Array.isArray(value) && value[0] === binding.nodeId));
    if (!loaderStillUsed) delete graph[binding.nodeId];
  }
  return graph;
}

export function mapDuration(seconds, binding) {
  if (binding?.unit !== 'frames') return seconds;
  // LTX requires 8n+1 frames; a step of 1 also supports ordinary frame counts.
  return Math.max(1, 1 + Math.round((seconds * binding.fps - 1) / binding.frameStep) * binding.frameStep);
}

export function durationInfo(workflow, bindings) {
  const binding = bindings?.duration;
  if (!binding) return { mapped: false, message: 'Render length is fixed by the imported workflow. Stage timing affects only the preview.' };
  const value = workflow[binding.nodeId].inputs[binding.input];
  return { mapped: true, unit: binding.unit ?? 'seconds', fps: binding.fps ?? null, frameStep: binding.frameStep ?? null, workflowSeconds: binding.unit === 'frames' ? value / binding.fps : value };
}

export function workflowNodes(workflow) {
  return Object.entries(workflow).map(([id, node]) => ({
    id,
    classType: node.class_type,
    title: typeof node._meta?.title === 'string' ? node._meta.title : node.class_type,
    inputs: Object.entries(node.inputs).map(([name, value]) => ({
      name,
      type: Array.isArray(value) ? 'connection' : typeof value,
      value,
    })),
  }));
}

export function decodeImage(image) {
  if (typeof image !== 'string' || image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64) {
    throw new RequestError('Choose a PNG, JPEG, or WebP image smaller than 8 MB.');
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new RequestError('The image must be an inline PNG, JPEG, or WebP file. Remote URLs are not accepted.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) {
    throw new RequestError('The image is empty, invalid, or larger than 8 MB.');
  }
  const signatures = {
    png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!signatures[match[1]]) throw new RequestError('The uploaded image contents do not match its file type.');
  return { bytes, contentType: `image/${match[1]}`, filename: `toybox-stage.${match[1] === 'jpeg' ? 'jpg' : match[1]}` };
}

export function validateRender(body, saved) {
  if (!isObject(body)) throw new RequestError('Send a JSON render request.');
  const workflow = validateWorkflow(body.workflow ?? saved?.workflow);
  const bindings = validateBindings(body.bindings ?? saved?.bindings, workflow);
  const image = decodeImage(body.image);
  if (body.keyframes !== undefined && (!Array.isArray(body.keyframes) || body.keyframes.length > 8)) throw new RequestError('Send up to eight keyframe images.');
  // Positions place each keyframe in time; without them each guide keeps its mapped position.
  const positions = body.positions;
  if (positions !== undefined) {
    if (!Array.isArray(positions) || positions.length !== (body.keyframes?.length ?? 0) || !positions.every(validPosition)) throw new RequestError('Send one position after 0 and up to 1 for each keyframe.');
    if (positions.length > (bindings.keyframes?.length ?? 0)) throw new RequestError(`This workflow guides up to ${bindings.keyframes?.length ?? 0} later keyframes.`);
  }
  // Studios may always send their later keyframes; only mapped guides are used.
  const keyframes = (bindings.keyframes ?? []).map((binding, index) => {
    const source = body.keyframes?.[index] ?? null;
    if (source === null) {
      if (!binding.bypass) throw new RequestError(`This workflow needs an image for keyframe ${index + 2}.`);
      return null;
    }
    const position = positions?.[index] ?? binding.position;
    if (position === undefined) throw new RequestError(`Keyframe ${index + 2} needs a position in the shot.`);
    if (positions && position !== binding.position && !binding.frame) throw new RequestError(`This workflow fixes the time of keyframe ${index + 2}.`);
    const decoded = decodeImage(source);
    return { ...decoded, filename: decoded.filename.replace('toybox-stage', `toybox-keyframe-${index + 2}`), source, position };
  });
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 20000) {
    throw new RequestError('Write a compiled shot direction between 1 and 20,000 characters.');
  }
  if (body.negativePrompt !== undefined && (typeof body.negativePrompt !== 'string' || body.negativePrompt.length > 4000)) {
    throw new RequestError('The negative prompt must be text under 4,000 characters.');
  }
  const seed = body.seed ?? 42;
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RequestError('Seed must be a nonnegative safe integer.');
  const duration = body.duration ?? 5;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1 || duration > 30) {
    throw new RequestError('Duration must be between 1 and 30 seconds.');
  }
  return { workflow, bindings, image, keyframes, positions, prompt: body.prompt.trim(), negativePrompt: body.negativePrompt, seed, duration };
}

export function validateMetadata(value) {
  if (value === undefined) return {};
  if (!isObject(value)) throw new RequestError('Render metadata must be an object.');
  const result = {};
  for (const name of ['shotId', 'shotName', 'world', 'projectId', 'projectName']) {
    if (value[name] === undefined) continue;
    const identity = name.endsWith('Id');
    if (typeof value[name] !== 'string' || !value[name].trim() || value[name].length > 200 || (identity ? forbidden.has(value[name]) : /[\u0000-\u001f]/.test(value[name]))) {
      throw new RequestError(`The ${name} metadata must be short text between 1 and 200 characters${identity ? ' using a valid project identifier' : ' without control characters'}.`);
    }
    // Project IDs are opaque references, never filenames. Preserve their exact
    // imported identity so trimming cannot detach a render from its project.
    result[name] = identity ? value[name] : value[name].trim();
  }
  return result;
}
