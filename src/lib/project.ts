import { cameraMoves, isCameraMove } from './camera-moves.ts';
import type { CameraMove } from './camera-moves.ts';

export type PropKind = 'car' | 'mug' | 'arch' | 'sphere' | 'tree';
export type WorldId = 'desert' | 'lunar' | 'noir';
export type Pose = { x: number; z: number; rotation: number };
export type StageProp = { id: string; name: string; kind: PropKind; role: string; color: string; scale: number };
export type Frame = { id: string; label: string; poses: Record<string, Pose>; image?: string; time?: number };
export type Shot = {
  id: string; name: string; note: string; world: WorldId; props: StageProp[]; frames: Frame[];
  duration: number; prompt: string; camera: 'wide' | 'low' | 'overhead'; cameraMove: CameraMove; seed: number;
  /** Toy → real: keyframe 1 is the toy set, the last keyframe is the real world. */
  reveal: boolean;
};
export type MovieClip = { id: string; jobId: string; outputIndex: number; inPoint: number; outPoint?: number };
export type Project = { version: 1; id: string; name: string; shots: Shot[]; activeShotId: string; edit?: { clips: MovieClip[] } };
export type Health = { connected: boolean; provider?: string; message: string; workflowConfigured?: boolean; keyframeGuides?: number[]; keyframeSlots?: number; restyleAvailable?: boolean };
export type RenderJob = { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress?: number; outputs?: { url: string; type: string }[]; error?: string };
export const worlds: {id: WorldId; name: string; subtitle: string; image: string; prompt: string; color: string}[] = [
  { id: 'desert', name: 'Dune roads', subtitle: 'Warm · cinematic', image: '/images/desert-escape.webp', color: '#c4976a', prompt: 'a monumental sandstone canyon, winding desert highway, dusty golden-hour light, warm ochre palette, cinematic 35mm film' },
  { id: 'lunar', name: 'Lunar delivery', subtitle: 'Quiet · otherworldly', image: '/images/lunar-delivery.webp', color: '#9b9db4', prompt: 'a lunar outpost, monumental pale structures, indigo sky, pink moon on the horizon, soft otherworldly lighting, cinematic science fiction' },
  { id: 'noir', name: 'After hours', subtitle: 'Moody · electric', image: '/images/noir-city.webp', color: '#678183', prompt: 'a rainy brutalist city at night, neon cyan and muted red reflections, wet asphalt, cinematic noir atmosphere' },
];
export const uid = () => crypto.randomUUID();
const presets: Record<WorldId, { note: string; prompt: string; roles: [string, string, string] }> = {
  desert: {
    note: 'A tiny car. A very big getaway.',
    prompt: 'A little red car escapes through an enormous canyon. A slow, graceful tracking shot. Preserve the arrangement and scale of the staged objects.',
    roles: ['A vintage red getaway car', 'A monumental sandstone tower', 'A distant canyon formation'],
  },
  lunar: {
    note: 'One small delivery. One giant moon.',
    prompt: 'A little red delivery rover glides through a quiet lunar outpost beneath a pink moon. A slow, graceful tracking shot. Preserve the arrangement and scale of the staged objects.',
    roles: ['A red lunar delivery rover', 'A pale lunar communications tower', 'A distant lunar habitat'],
  },
  noir: {
    note: 'A red car. A city after midnight.',
    prompt: 'A little red car slips through a rain-soaked city after midnight. Neon reflections ripple across the road during a slow tracking shot. Preserve the arrangement and scale of the staged objects.',
    roles: ['A red car on a midnight getaway', 'A towering brutalist apartment building', 'A distant neon-lit office tower'],
  },
};
export function makeShot(name = 'The great escape', world: WorldId = 'desert'): Shot {
  const preset = presets[world];
  const props: StageProp[] = [
    { id: uid(), name: 'Little red car', kind: 'car', role: preset.roles[0], color: '#df543e', scale: 1 },
    { id: uid(), name: 'Coffee mug', kind: 'mug', role: preset.roles[1], color: '#e4ddd1', scale: 1.15 },
    { id: uid(), name: 'Second mug', kind: 'mug', role: preset.roles[2], color: '#c7bdab', scale: .88 },
  ];
  return {
    id: uid(), name, note: preset.note, world, props,
    frames: ['Beginning', 'The turn', 'The getaway'].map((label, index) => ({ id: uid(), label, poses: {
      [props[0].id]: [{ x: -3.6, z: 2.5, rotation: 0 }, { x: 0, z: .8, rotation: -.25 }, { x: 3.6, z: -1.6, rotation: -.6 }][index],
      [props[1].id]: { x: -1.6, z: -1.4, rotation: -.2 },
      [props[2].id]: { x: 2.5, z: .6, rotation: 2.2 },
    } })),
    duration: 6, prompt: preset.prompt, camera: 'wide', cameraMove: 'push-in', seed: 42, reveal: false,
  };
}
export function makeProject(): Project {
  const shot = makeShot();
  return { version: 1, id: uid(), name: 'Small things, big worlds', shots: [shot], activeShotId: shot.id };
}
/** Duplicate the entire shot without sharing mutable objects or staging identifiers. */
export function cloneShot(shot: Shot): Shot {
  const propIds = new Map(shot.props.map(prop => [prop.id, uid()]));
  return {
    ...shot, id: uid(), name: `${shot.name.slice(0, 195)} copy`,
    props: shot.props.map(prop => ({ ...prop, id: propIds.get(prop.id)! })),
    frames: shot.frames.map(frame => ({
      ...frame, id: uid(),
      poses: Object.fromEntries(shot.props.map(prop => [propIds.get(prop.id)!, { ...frame.poses[prop.id] }])),
    })),
  };
}
export function removeShot(project: Project, id: string): Project {
  const index = project.shots.findIndex(shot => shot.id === id);
  if (project.shots.length === 1 || index === -1) return project;
  const shots = project.shots.filter(shot => shot.id !== id);
  return { ...project, shots, activeShotId: project.activeShotId === id ? shots[Math.min(index, shots.length - 1)].id : project.activeShotId };
}
export function reorderShot(project: Project, id: string, direction: -1 | 1): Project {
  const index = project.shots.findIndex(shot => shot.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= project.shots.length) return project;
  const shots = [...project.shots];
  [shots[index], shots[target]] = [shots[target], shots[index]];
  return { ...project, shots };
}
/** Keep authored copy while replacing unchanged defaults, including early v1 canyon defaults. */
export function changeShotWorld(shot: Shot, world: WorldId): Shot {
  const before = presets[shot.world]; const after = presets[world];
  const replaceDefault = (value: string, field: 'prompt' | 'note') =>
    value === before[field] || value === presets.desert[field] ? after[field] : value;
  return {
    ...shot, world, prompt: replaceDefault(shot.prompt, 'prompt'), note: replaceDefault(shot.note, 'note'),
    props: shot.props.map(prop => {
      const index = before.roles.indexOf(prop.role);
      const legacyIndex = presets.desert.roles.indexOf(prop.role);
      const roleIndex = index >= 0 ? index : legacyIndex;
      return roleIndex < 0 ? prop : { ...prop, role: after.roles[roleIndex] };
    }),
  };
}
// Base positions of the cinematic capture cameras, used to describe motion from the viewer's side.
const viewpoints: Record<Shot['camera'], [number, number]> = { wide: [8, 12], low: [9, 9], overhead: [0, 1] };
const subject = (prop: StageProp) => {
  const role = prop.role.trim().replace(/^(a|an|the)\s+/i, '');
  return role ? `The ${role}` : prop.name;
};
/** Describe how each prop travels between the first and last keyframes, relative to the camera. */
export function describeMotion(shot: Shot): string {
  const [vx, vz] = viewpoints[shot.camera];
  const length = Math.hypot(vx, vz);
  const forward = [-vx / length, -vz / length], right = [-forward[1], forward[0]];
  const sentences = shot.props.flatMap(prop => {
    const a = shot.frames[0].poses[prop.id], b = shot.frames[shot.frames.length - 1].poses[prop.id];
    const dx = b.x - a.x, dz = b.z - a.z;
    const lateral = dx * right[0] + dz * right[1], depth = dx * forward[0] + dz * forward[1];
    const parts = [lateral > .6 ? 'from left to right' : lateral < -.6 ? 'from right to left' : '', depth > .6 ? 'away from the camera' : depth < -.6 ? 'toward the camera' : ''].filter(Boolean);
    const turns = Math.abs(b.rotation - a.rotation) > .5;
    if (!parts.length) return turns ? [`${subject(prop)} turns in place.`] : [];
    return [`${subject(prop)} moves ${parts.join(' and ')}${turns ? ', turning as it goes' : ''}.`];
  });
  return sentences.length ? [...new Set(sentences)].join(' ') : 'Every object holds its position.';
}
export function compilePrompt(shot: Shot): string {
  const world = worlds.find(w => w.id === shot.world)!;
  const cast = shot.props.map(prop => `${prop.name} represents ${prop.role}`).join('. ');
  const angle = shot.camera === 'low' ? 'Low angle close to the ground' : shot.camera === 'overhead' ? 'Overhead establishing shot' : 'Wide three-quarter view';
  const move = cameraMoves.find(item => item.id === shot.cameraMove)!.direction;
  // Photo keyframes already fix the world, cast, and staging; describing the stage would fight them.
  if (shot.frames.every(frame => frame.image)) return `${shot.prompt}\nCamera: ${move}`;
  const reveal = shot.reveal ? '\nTransformation: The shot opens on toys on a tabletop and holds still. Then, in one fast seamless transformation, the tabletop becomes the real world and every toy becomes the real thing it represents.' : '';
  return `${shot.prompt}\nWorld: ${world.prompt}.\nCast: ${cast}.\nCamera: ${angle}. ${move}\nMotion: ${describeMotion(shot)}${reveal}`;
}
export const MIN_KEYFRAMES = 3, MAX_KEYFRAMES = 8;
/** Where a keyframe sits in the shot (0–1). Keyframes are evenly spaced until one is retimed. */
export function frameTime(shot: Shot, index: number): number {
  const last = shot.frames.length - 1;
  if (index <= 0) return 0;
  if (index >= last) return 1;
  return shot.frames[index].time ?? index / last;
}
export const isRetimed = (shot: Shot) => shot.frames.some(frame => frame.time !== undefined);
/** Retimed keyframes stay at least this far apart (a fraction of the shot). */
export const MIN_KEYFRAME_GAP = .01;
const withTimes = (shot: Shot, frames: Frame[], times: number[]): Shot => ({ ...shot, frames: frames.map((frame, i) => ({ ...frame, time: times[i] })) });
/** Insert an in-between keyframe after `index`, starting from that keyframe's staging. */
export function addKeyframe(shot: Shot, index: number): Shot {
  if (shot.frames.length >= MAX_KEYFRAMES) return shot;
  const frame: Frame = { id: uid(), label: 'In between', poses: structuredClone(shot.frames[index].poses) };
  const frames = [...shot.frames.slice(0, index + 1), frame, ...shot.frames.slice(index + 1)];
  if (!isRetimed(shot)) return { ...shot, frames };
  // A retimed shot keeps its timing: the new keyframe lands halfway to the next one.
  const times = shot.frames.map((_, i) => frameTime(shot, i)), last = times.length - 1;
  if (index < last) return withTimes(shot, frames, [...times.slice(0, index + 1), (times[index] + times[index + 1]) / 2, ...times.slice(index + 1)]);
  return withTimes(shot, frames, [...times.slice(0, last), (times[last - 1] + 1) / 2, 1]);
}
/** Move a middle keyframe to `time` (0–1), keeping it between its neighbours. */
export function retimeKeyframe(shot: Shot, index: number, time: number): Shot {
  const last = shot.frames.length - 1;
  if (index <= 0 || index >= last || !Number.isFinite(time)) return shot;
  const times = shot.frames.map((_, i) => frameTime(shot, i));
  times[index] = Math.min(Math.max(time, times[index - 1] + MIN_KEYFRAME_GAP), times[index + 1] - MIN_KEYFRAME_GAP);
  return withTimes(shot, shot.frames, times);
}
export function evenKeyframes(shot: Shot): Shot {
  return { ...shot, frames: shot.frames.map(({ time: _time, ...frame }) => frame) };
}
export function removeKeyframe(shot: Shot, index: number): Shot {
  return shot.frames.length <= MIN_KEYFRAMES ? shot : { ...shot, frames: shot.frames.filter((_, i) => i !== index) };
}
export function interpolatePose(shot: Shot, id: string, time: number): Pose {
  time = Number.isFinite(time) ? Math.max(0, Math.min(time, 1)) : 0;
  const last = shot.frames.length - 1;
  let index = 0;
  while (index < last - 1 && time >= frameTime(shot, index + 1)) index++;
  const start = frameTime(shot, index), end = frameTime(shot, index + 1);
  const t = end > start ? Math.min(Math.max((time - start) / (end - start), 0), 1) : 1;
  const smooth = t * t * (3 - 2 * t);
  const a = shot.frames[index].poses[id]; const b = shot.frames[index + 1].poses[id];
  return { x: a.x + (b.x - a.x) * smooth, z: a.z + (b.z - a.z) * smooth, rotation: a.rotation + (b.rotation - a.rotation) * smooth };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => finite(value, min, max) && Number.isInteger(value);
const shortText = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length <= max;
const validId = (value: unknown): value is string => shortText(value) && value.trim().length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value);
const worldId = (value: unknown): value is WorldId => typeof value === 'string' && ['desert', 'lunar', 'noir'].includes(value);
const cameraId = (value: unknown): value is Shot['camera'] => typeof value === 'string' && ['wide', 'low', 'overhead'].includes(value);
const propKind = (value: unknown): value is PropKind => typeof value === 'string' && ['car', 'mug', 'arch', 'sphere', 'tree'].includes(value);
/** Read portable v1 files into a fresh, known schema. Early v1 files acquire a project ID. */
export function parseProject(raw: string): Project {
  if (raw.length > 25_000_000) throw new Error('This project is too large. Keep project files under 25 MB.');
  let p: unknown;
  try { p = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON. Choose an exported Toybox project.'); }
  if (!object(p) || p.version !== 1 || (p.id !== undefined && !validId(p.id)) || !shortText(p.name) || !Array.isArray(p.shots) || p.shots.length < 1 || p.shots.length > 12) throw new Error('Choose a Toybox project (.toybox.json) with 1–12 shots.');
  const ids = new Set<string>();
  const shots: Shot[] = p.shots.map((s: unknown) => {
    if (!object(s) || !validId(s.id) || ids.has(s.id) || !shortText(s.name) || !shortText(s.note) || !shortText(s.prompt, 4000) || !worldId(s.world) || !cameraId(s.camera) || !integer(s.duration, 2, 12) || !integer(s.seed, 0, 2147483647) || !Array.isArray(s.props) || !s.props.length || s.props.length > 8 || !Array.isArray(s.frames) || s.frames.length < MIN_KEYFRAMES || s.frames.length > MAX_KEYFRAMES) throw new Error('This project contains an invalid shot. Export it again from Toybox.');
    ids.add(s.id);
    const propIds = new Set<string>();
    const props: StageProp[] = s.props.map((prop: unknown) => {
      if (!object(prop) || !validId(prop.id) || propIds.has(prop.id) || !shortText(prop.name) || !shortText(prop.role, 500) || !propKind(prop.kind) || typeof prop.color !== 'string' || !/^#[\da-f]{6}$/i.test(prop.color) || !finite(prop.scale, .3, 2.5)) throw new Error('This project contains an invalid prop.');
      propIds.add(prop.id);
      return { id: prop.id, name: prop.name, kind: prop.kind, role: prop.role, color: prop.color, scale: prop.scale };
    });
    const frameIds = new Set<string>();
    const frames: Frame[] = s.frames.map((f: unknown) => {
      if (!object(f) || !validId(f.id) || frameIds.has(f.id) || !shortText(f.label) || !object(f.poses)) throw new Error('This project has an invalid keyframe.');
      frameIds.add(f.id);
      if (f.image !== undefined && (typeof f.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(f.image) || f.image.length > 7_000_000)) throw new Error('A frame image is unsupported or too large.');
      if (f.time !== undefined && !finite(f.time, 0, 1)) throw new Error('This project has an invalid keyframe time.');
      const poses: Record<string, Pose> = {};
      for (const id of propIds) {
        const pose = f.poses[id];
        if (!object(pose) || !finite(pose.x, -6, 6) || !finite(pose.z, -4, 4) || !finite(pose.rotation, -Math.PI * 2, Math.PI * 2)) throw new Error('This project has invalid object positions.');
        poses[id] = { x: pose.x, z: pose.z, rotation: pose.rotation };
      }
      return { id: f.id, label: f.label, poses, ...(typeof f.image === 'string' ? { image: f.image } : {}), ...(typeof f.time === 'number' ? { time: f.time } : {}) };
    });
    const times = frames.map((_, i) => i === 0 ? 0 : i === frames.length - 1 ? 1 : frames[i].time ?? i / (frames.length - 1));
    if (times.some((time, i) => i > 0 && time <= times[i - 1])) throw new Error('This project has keyframes out of order in time.');
    if (s.cameraMove !== undefined && !isCameraMove(s.cameraMove)) throw new Error('This project contains an unknown camera move.');
    if (s.reveal !== undefined && typeof s.reveal !== 'boolean') throw new Error('This project contains an invalid reveal setting.');
    // Projects saved before camera moves keep their original locked camera.
    return { id: s.id, name: s.name, note: s.note, world: s.world, props, frames, duration: s.duration, prompt: s.prompt, camera: s.camera, cameraMove: s.cameraMove ?? 'static', seed: s.seed, reveal: s.reveal ?? false };
  });
  if (!validId(p.activeShotId) || !ids.has(p.activeShotId)) throw new Error('This project is missing its active shot.');
  let edit: Project['edit'];
  if (p.edit !== undefined) {
    if (!object(p.edit) || !Array.isArray(p.edit.clips) || p.edit.clips.length > 24) throw new Error('This project contains an invalid film edit.');
    const clipIds = new Set<string>();
    edit = { clips: p.edit.clips.map((clip: unknown): MovieClip => {
      if (!object(clip) || !validId(clip.id) || clipIds.has(clip.id) || !validId(clip.jobId) || !integer(clip.outputIndex, 0, 11) || !finite(clip.inPoint, 0, 3600) || (clip.outPoint !== undefined && (!finite(clip.outPoint, 0, 3600) || clip.outPoint <= clip.inPoint))) throw new Error('This project contains an invalid film clip.');
      clipIds.add(clip.id);
      return { id: clip.id, jobId: clip.jobId, outputIndex: clip.outputIndex, inPoint: clip.inPoint, ...(typeof clip.outPoint === 'number' ? { outPoint: clip.outPoint } : {}) };
    }) };
  }
  return { version: 1, id: typeof p.id === 'string' ? p.id : uid(), name: p.name, shots, activeShotId: p.activeShotId, ...(edit ? { edit } : {}) };
}
export function downloadFile(content: BlobPart, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > 15_000_000) throw new Error('Choose an image smaller than 15 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Try exporting it again as PNG or JPG.'); }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('This image has no visible pixels.');
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the image. Try again or use a different browser.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .88);
    if (!image.startsWith('data:image/jpeg;base64,')) throw new Error('Your browser could not encode the image. Try a different image.');
    return image;
  } finally { bitmap.close(); }
}
