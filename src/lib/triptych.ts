import { imageDataUrlToBlob } from './image-export.ts';

/** Horizontal panel bounds for splitting a strip of `count` equal frames; edges are rounded once so panels tile exactly. */
export function panelBounds(width: number, count: number): {x: number; width: number}[] {
  const edges = Array.from({length: count + 1}, (_, index) => Math.round(width * index / count));
  return edges.slice(0, -1).map((x, index) => ({x, width: edges[index + 1] - x}));
}

// Decoded without fetch(): the production CSP does not allow data: URLs in connect-src.
const bitmap = (dataUrl: string) => createImageBitmap(imageDataUrlToBlob(dataUrl));
function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the keyframes. Try again or use a different browser.');
  return {element, context};
}

/** Lay frames side by side, so one image edit gives them a single consistent look. */
export async function tileFrames(frames: string[]): Promise<string> {
  const images = await Promise.all(frames.map(bitmap));
  try {
    const {width, height} = images[0];
    const {element, context} = canvas(width * images.length, height);
    images.forEach((image, index) => context.drawImage(image, index * width, 0, width, height));
    return element.toDataURL('image/jpeg', .92);
  } finally { images.forEach(image => image.close()); }
}

export async function splitFrames(strip: string, count: number): Promise<string[]> {
  const image = await bitmap(strip);
  try {
    return panelBounds(image.width, count).map(({x, width}) => {
      const {element, context} = canvas(width, image.height);
      context.drawImage(image, x, 0, width, image.height, 0, 0, width, image.height);
      return element.toDataURL('image/jpeg', .9);
    });
  } finally { image.close(); }
}
