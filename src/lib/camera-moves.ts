export type CameraMove = 'static' | 'push-in' | 'pull-out' | 'orbit-left' | 'orbit-right' | 'crane-up' | 'crane-down';
export type Vec3 = readonly [x: number, y: number, z: number];

export const cameraMoves: {id: CameraMove; name: string; direction: string}[] = [
  {id: 'static', name: 'Locked off', direction: 'The camera stays perfectly still.'},
  {id: 'push-in', name: 'Push in', direction: 'The camera slowly pushes in toward the action.'},
  {id: 'pull-out', name: 'Pull out', direction: 'The camera slowly pulls back to reveal more of the scene.'},
  {id: 'orbit-left', name: 'Orbit left', direction: 'The camera arcs slowly to the left around the action.'},
  {id: 'orbit-right', name: 'Orbit right', direction: 'The camera arcs slowly to the right around the action.'},
  {id: 'crane-up', name: 'Crane up', direction: 'The camera cranes slowly upward, rising above the scene.'},
  {id: 'crane-down', name: 'Crane down', direction: 'The camera cranes slowly down toward ground level.'},
];
export const isCameraMove = (value: unknown): value is CameraMove => cameraMoves.some(move => move.id === value);

const MIN_POLAR = .12, MAX_POLAR = Math.PI / 2.15;
const ease = (t: number) => { t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)); return t * t * (3 - 2 * t); };

/** Where the camera sits at time t (0–1) of a move that starts at `position`, looking at `target`. */
export function moveCamera(position: Vec3, target: Vec3, move: CameraMove, time: number): Vec3 {
  const [dx, dy, dz] = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
  let radius = Math.hypot(dx, dy, dz);
  if (move === 'static' || radius === 0) return [...position];
  let azimuth = Math.atan2(dx, dz), polar = Math.acos(Math.max(-1, Math.min(1, dy / radius)));
  const e = ease(time);
  if (move === 'push-in') radius *= 1 - .38 * e;
  else if (move === 'pull-out') radius *= 1 + .5 * e;
  // Increasing azimuth carries the camera toward its own right.
  else if (move === 'orbit-left') azimuth -= .6 * e;
  else if (move === 'orbit-right') azimuth += .6 * e;
  else if (move === 'crane-up') { polar = Math.max(MIN_POLAR, polar - .45 * e); radius *= 1 + .1 * e; }
  else polar = Math.min(MAX_POLAR, polar + .35 * e);
  const ground = radius * Math.sin(polar);
  return [target[0] + ground * Math.sin(azimuth), target[1] + radius * Math.cos(polar), target[2] + ground * Math.cos(azimuth)];
}
