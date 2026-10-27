import type { Project, Shot } from './project.ts';

/** Names are display metadata; project and shot identities must remain byte-for-byte stable. */
export function renderDisplayName(value: string, fallback: string): string {
  return value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200) || fallback;
}
export function shotRenderMetadata(shot: Shot, project: Project) {
  return {
    shotId:shot.id,
    shotName:renderDisplayName(shot.name,'Untitled scene'),
    world:shot.world,
    projectId:project.id,
    projectName:renderDisplayName(project.name,'Untitled project'),
  };
}
export function filmExportMetadata(project: Project) {
  return {
    title:renderDisplayName(project.name,'Untitled film').slice(0,160),
    projectId:project.id,
    projectName:renderDisplayName(project.name,'Untitled project'),
  };
}

export type GuideSource = {kind: 'photo'; image: string} | {kind: 'stage'; frameIndex: number; time: number} | {kind: 'skip'};
/** Choose the image for a workflow guide at a position (0–1] of the shot. */
export function guideSource(shot: Shot, position: number): GuideSource {
  const step = position * (shot.frames.length - 1), index = Math.round(step);
  // A reveal holds its toy opening through the middle, so the change lands late and fast.
  if (shot.reveal && index > 0 && index < shot.frames.length - 1) return shot.frames[0].image ? {kind: 'photo', image: shot.frames[0].image} : {kind: 'skip'};
  const photo = Math.abs(step - index) < 1e-6 ? shot.frames[index]?.image : undefined;
  if (photo) return {kind: 'photo', image: photo};
  // A photographed opening must not be steered toward the stage world's look, except by a reveal.
  if (shot.frames[0].image && !shot.reveal) return {kind: 'skip'};
  return {kind: 'stage', frameIndex: Math.min(index, shot.frames.length - 1), time: position};
}

/** Freeze the same source the stage is showing before asynchronous capture starts. */
export function prepareFrameExport(shot: Shot, frameIndex: number, previewTime: number | null) {
  const snapshot = structuredClone(shot);
  return {
    shot: snapshot,
    frameIndex,
    time: previewTime,
    image: previewTime === null ? snapshot.frames[frameIndex].image : undefined,
  };
}

type KeyInput = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>;
type ShortcutContext = {
  busy: boolean;
  dialog: string | null;
  textEntry: boolean;
  interactive: boolean;
  stageVisible: boolean;
};
export type StudioShortcut = { kind: 'save' | 'undo' | 'redo' | 'play' } | { kind: 'frame'; index: number };

/** Global project shortcuts and native control shortcuts have different focus rules. */
export function studioShortcut(event: KeyInput, context: ShortcutContext): StudioShortcut | null {
  if (event.defaultPrevented || context.busy) return null;
  const key = event.key.toLowerCase();
  const command = event.metaKey || event.ctrlKey;
  if (command && !event.altKey && key === 's' && (!context.dialog || context.dialog === 'export')) return { kind: 'save' };
  if (context.dialog) return null;
  if (command && !event.altKey && key === 'z' && !context.textEntry) return { kind: event.shiftKey ? 'redo' : 'undo' };
  if (command || event.altKey || context.interactive || !context.stageVisible) return null;
  if (event.code === 'Space') return { kind: 'play' };
  if (['1', '2', '3'].includes(key)) return { kind: 'frame', index: Number(key) - 1 };
  return null;
}
