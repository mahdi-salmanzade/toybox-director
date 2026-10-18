import type { MovieClip } from './project.ts';
import type { StudioJob } from './render.ts';

export type FilmTake = { job: StudioJob; outputIndex: number; duration: number };
export const MAX_FILM_SECONDS = 300;
export const MIN_CLIP_SECONDS = 1 / 24;

/** References in imported edits and cross-project cuts resolve against the whole library. */
export function completedVideoTakes(jobs: StudioJob[]): FilmTake[] {
  return jobs.filter(job => job.status === 'completed').sort((a, b) => b.createdAt - a.createdAt).flatMap(job =>
    job.outputs.flatMap((output, outputIndex) => output.type === 'video'
      ? [{ job, outputIndex, duration: output.duration || job.renderSeconds || 0 }]
      : []));
}
export function takesForProject(takes: FilmTake[], projectId: string): FilmTake[] {
  return takes.filter(take => !take.job.projectId || take.job.projectId === projectId);
}
export function clipSeconds(clip: MovieClip, duration = 0): number {
  const end = clip.outPoint ?? duration;
  return Math.max(0, (duration > 0 ? Math.min(end, duration) : end) - clip.inPoint);
}
export function clipTrimProblem(clip: MovieClip, duration = 0): string | null {
  const end = clip.outPoint ?? (duration > 0 ? duration : undefined);
  if (duration > 0 && (clip.inPoint >= duration || (end !== undefined && end > duration + .05))) return 'Trim points must fit inside the video.';
  if (end !== undefined && end - clip.inPoint < MIN_CLIP_SECONDS - 1e-9) return 'Keep at least one frame in each clip.';
  return null;
}

/** A video can emit both timeupdate and ended at the same boundary. Consume it once. */
export function createClipBoundary() {
  let activeId: string | null = null;
  let consumed = false;
  return {
    start(id: string) { activeId = id; consumed = false; },
    finish(id: string) {
      if (id !== activeId || consumed) return false;
      consumed = true;
      return true;
    },
    finished(id: string) { return activeId === id && consumed; },
  };
}
