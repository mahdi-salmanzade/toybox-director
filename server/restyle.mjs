import { RequestError, decodeImage } from './validation.mjs';

// Node IDs in workflows/qwen-restyle.api.json.
export const RESTYLE_NODES = { image: '7', reference: '17', referenceScale: '18', prompt: '9', negative: '10', seed: '14', output: '16' };

export function validateRestyle(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('Send a JSON restyle request.');
  const named = (image, name) => ({ ...image, filename: image.filename.replace('toybox-stage', name) });
  const image = named(decodeImage(body.image), 'toybox-restyle-source');
  const reference = body.reference === undefined || body.reference === null ? null : named(decodeImage(body.reference), 'toybox-restyle-reference');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) throw new RequestError('Write a restyle instruction between 1 and 4,000 characters.');
  const seed = body.seed ?? 7;
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RequestError('Seed must be a nonnegative safe integer.');
  return { image, reference, prompt: body.prompt.trim(), seed };
}

/** Set the instruction and seed; without a look reference, remove its loader and inputs. */
export function restyleGraph(workflow, { prompt, seed, reference }) {
  const graph = structuredClone(workflow);
  const { prompt: promptNode, negative, seed: seedNode, reference: loader, referenceScale } = RESTYLE_NODES;
  for (const id of [promptNode, negative, seedNode, loader, referenceScale]) {
    if (!graph[id]) throw new RequestError(`The restyle workflow is missing node ${id}.`, 500);
  }
  graph[promptNode].inputs.prompt = prompt;
  graph[seedNode].inputs.seed = seed;
  if (!reference) {
    delete graph[loader]; delete graph[referenceScale];
    delete graph[promptNode].inputs.image2; delete graph[negative].inputs.image2;
  }
  return graph;
}
