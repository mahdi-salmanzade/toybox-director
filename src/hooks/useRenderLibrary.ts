import { useCallback, useEffect, useRef, useState } from 'react';
import { responseJson } from '../lib/api';
import { createJobActionGate, type JobAction } from '../lib/job-actions';
import type { StudioJob } from '../lib/render';

export function useRenderLibrary() {
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const refreshing = useRef<Promise<void> | null>(null);
  const mutationVersion = useRef(0);
  const actionGate = useRef<ReturnType<typeof createJobActionGate> | null>(null);
  if (!actionGate.current) actionGate.current = createJobActionGate();
  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        let stale: boolean;
        do {
          const version = mutationVersion.current;
          try {
            const response = await fetch('/api/jobs', {signal: AbortSignal.timeout(25000)});
            const data = await responseJson<{jobs: StudioJob[]}>(response);
            if (mounted.current && version === mutationVersion.current) { setJobs(data.jobs); setError(''); }
          } catch (e) {
            if (mounted.current && version === mutationVersion.current) setError(e instanceof Error ? e.message : 'Render history is temporarily unavailable.');
          }
          // A submission, cancellation, retry or deletion beat this snapshot. Fetch
          // again before resolving refresh(), preserving the accepted local result.
          stale = version !== mutationVersion.current;
        } while (mounted.current && stale);
      } finally {
        if (mounted.current) setLoading(false);
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 2500); };
    void poll();
    return () => { mounted.current = false; stopped = true; clearTimeout(timer); };
  }, [refresh]);
  const accept = useCallback((job: StudioJob) => {
    mutationVersion.current++;
    if (mounted.current) setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)]);
  }, []);
  const action = useCallback((id: string, operation: JobAction) => actionGate.current!(id, operation, async () => {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}${operation === 'delete' ? '' : `/${operation}`}`, {method: operation === 'delete' ? 'DELETE' : 'POST'});
    if (operation === 'delete' && response.ok) {
      mutationVersion.current++;
      if (mounted.current) setJobs(previous => previous.filter(job => job.id !== id));
    }
    else accept(await responseJson<StudioJob>(response));
  }), [accept]);
  return {jobs, error, loading, refresh, accept, action};
}
