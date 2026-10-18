import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDataUrlToBlob } from '../src/lib/image-export.ts';

test('PNG frame export preserves exact bytes without fetch or an image network request', async () => {
  const encoded='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async () => {throw new Error('CSP blocks inline network requests');};
  try {
    const blob=imageDataUrlToBlob(`data:image/png;base64,${encoded}`);
    assert.equal(blob.type,'image/png');
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()),Buffer.from(encoded,'base64'));
  } finally {globalThis.fetch=originalFetch;}
});

test('JPEG and WebP exports keep their declared MIME type and original bytes', async () => {
  for(const [format,bytes] of [
    ['jpeg',Buffer.from([255,216,255,224,0,16,74,70,73,70,0,255,217])],
    ['webp',Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP','binary')],
  ] as const) {
    const blob=imageDataUrlToBlob(`data:image/${format};base64,${bytes.toString('base64')}`);
    assert.equal(blob.type,`image/${format}`);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
  }
});

test('frame export rejects external URLs, unsupported types, invalid base64, and mismatched image signatures', () => {
  for(const source of ['https://example.invalid/image.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,','data:image/png;base64,AA=A']) {
    assert.throws(()=>imageDataUrlToBlob(source),/not a supported/);
  }
  assert.throws(()=>imageDataUrlToBlob('data:image/png;base64,AB=='),/invalid image data/);
  assert.throws(()=>imageDataUrlToBlob('data:image/png;base64,/9j/4A=='),/do not match/);
  assert.throws(()=>imageDataUrlToBlob('data:image/jpeg;base64,iVBORw0KGgo='),/do not match/);
  assert.throws(()=>imageDataUrlToBlob('data:image/webp;base64,SGVsbG8='),/do not match/);
});
