export type JobStatus = 'queued' | 'running' | 'canceling' | 'completed' | 'failed' | 'canceled';
export type RenderOutput = {url: string; type: string; name?: string; contentType?: string; duration?: number};
export type StudioJob = {
  id: string; status: JobStatus; kind?: 'render' | 'movie'; createdAt: number;
  shotId?: string; shotName?: string; world?: string; projectId?: string; projectName?: string;
  title?: string; renderSeconds?: number; progress?: number; outputs: RenderOutput[]; error?: string;
};
export const isActiveJob = (job: StudioJob) => ['queued', 'running', 'canceling'].includes(job.status);
export const jobTitle = (job: StudioJob) => job.title || job.shotName || (job.kind === 'movie' ? 'Untitled film' : 'Recovered render');
export const statusLabel: Record<JobStatus, string> = {queued: 'In queue', running: 'Rendering', canceling: 'Stopping', completed: 'Ready', failed: 'Needs attention', canceled: 'Canceled'};
