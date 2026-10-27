import type { PropKind, Shot, WorldId } from './project.ts';

export type Look = 'toy' | 'real';

const toys: Record<PropKind, string> = {
  car: 'a small die-cast toy car', mug: 'a ceramic coffee mug', arch: 'a wooden toy building-block arch',
  sphere: 'a glass marble', tree: 'a small painted wooden toy tree',
};
// How each prop looks in the stage world, so the instruction names what the model sees.
const shapes: Record<PropKind, string> = { car: 'car', mug: 'tall column', arch: 'arch', sphere: 'rounded rock', tree: 'tree' };
const places: Record<WorldId, string> = {
  desert: 'a real desert canyon at golden hour',
  lunar: 'a real lunar landscape under an indigo sky',
  noir: 'a real rain-soaked city street at night',
};
// Short, literal edits keep Qwen-Image-Edit on the staged layout; long scene descriptions invite it to recompose.
const keep = 'Change nothing else: keep the same camera angle, framing, and ground shape, and the exact position, size, and orientation of every object.';

/** The restyle look for each keyframe; a reveal's middle keyframes reuse its toy opening at render time. */
export function keyframeLooks(shot: Shot): (Look | null)[] {
  const last = shot.frames.length - 1;
  return shot.frames.map((_, index) => !shot.reveal ? 'real' : index === 0 ? 'toy' : index === last ? 'real' : null);
}

/**
 * Real keyframes are restyled together as one side-by-side strip (`frames` > 1): separate edits
 * drift between keyframes, and passing one as a look reference makes the model copy its layout.
 */
export function restyleInstruction(shot: Shot, look: Look, frames = 1): string {
  const kinds = [...new Set(shot.props.map(prop => prop.kind))];
  if (look === 'toy') {
    return `Make this image photorealistic, like a real macro photograph of toys on a white tabletop: ${kinds.map(kind => `the ${shapes[kind]} is ${toys[kind]}`).join(', ')}. ${keep}`;
  }
  const cast = [...new Set(shot.props.map(prop => `the ${shapes[prop.kind]} is a real ${prop.role.trim().replace(/^(an?|the)\s+/i, '')}`))];
  if (frames > 1) {
    const counts = Object.entries(shot.props.reduce<Record<string, number>>((all, prop) => ({...all, [prop.kind]: (all[prop.kind] ?? 0) + 1}), {}))
      .map(([kind, count]) => `${count === 1 ? 'exactly one' : `exactly ${count}`} ${shapes[kind as PropKind]}${count === 1 ? '' : 's'}`).join(' and ');
    return `These are ${frames} frames from the same film shot, side by side. Make the whole image photorealistic, like real photographs taken in ${places[shot.world]}. In every frame, ${cast.join(', ')}; nothing stays a toy or a 3D model. Each frame contains ${counts}: never add or duplicate an object. All ${frames} frames show the same real place, light, and objects, and each object keeps the same size and faces the same direction as in each frame here. Change nothing else: keep each frame's camera angle and framing, and the exact position, size, and orientation of every object in each frame.`;
  }
  return `Make this image photorealistic, like a real photograph taken in ${places[shot.world]}: ${cast.join(', ')}. ${keep}`;
}
