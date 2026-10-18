import { useRef, useState } from 'react';
import { CheckCircle2, Download, Film, LoaderCircle, Plus, RefreshCw, Square, Trash2 } from 'lucide-react';
import { isActiveJob, jobTitle, statusLabel } from '../lib/render';
import type { StudioJob } from '../lib/render';

export function RenderLibrary({jobs, loading, error, projectId, onAction, onAdd, onRender, onRefresh}: {jobs: StudioJob[]; loading: boolean; error: string; projectId: string; onAction: (id: string, action: 'cancel' | 'retry' | 'delete') => Promise<void>; onAdd: (job: StudioJob, outputIndex: number) => void; onRender: () => void; onRefresh: () => void}) {
  const [scope, setScope] = useState('project');
  const pending = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const visible = jobs.filter(job => scope === 'all' || job.projectId === projectId || !job.projectId);
  async function act(id: string, action: 'cancel' | 'retry' | 'delete') {
    if (pending.current.has(id)) return;
    pending.current.add(id); setBusy(new Set(pending.current)); setActionError('');
    try {await onAction(id, action); setDeleting(current => current === id ? null : current);}
    catch(e) {setActionError(e instanceof Error ? e.message : 'Action failed. Try again.');}
    finally {pending.current.delete(id); setBusy(new Set(pending.current));}
  }
  return <div className="render-library">
    <div className="library-toolbar"><div><h2>Your render shelf</h2><p>Saved on this machine, including after a restart.</p></div><label><span className="sr-only">Show renders</span><select value={scope} onChange={e => setScope(e.target.value)}><option value="project">This project</option><option value="all">All projects</option></select></label><button className="icon-button" aria-label="Refresh renders" onClick={onRefresh}><RefreshCw size={15} /></button></div>
    {(error || actionError) && <p className="error-message" role="alert">{actionError || `Connection interrupted: ${error} Retrying automatically.`}</p>}
    {loading && <p className="library-loading" role="status">Loading your renders…</p>}
    {!loading && !visible.length && <div className="output-empty"><Film size={34} /><h2>Your first take starts here.</h2><p>Render a scene, then add your favorite takes to the film edit.</p><button className="button primary" onClick={onRender}>Render this scene</button></div>}
    <div className="render-library-grid">{visible.map(job => <article className="render-item" key={job.id}>
      <div className="render-title"><span><Film size={16} /><strong>{jobTitle(job)}</strong></span><span className={`job-status ${job.status}`}>{isActiveJob(job) ? <LoaderCircle size={13} className="spin" /> : job.status === 'completed' ? <CheckCircle2 size={13} /> : null}{statusLabel[job.status]}</span></div>
      <p className="render-meta">{job.kind === 'movie' ? 'Film export' : job.projectName || 'Local render'} · {new Date(job.createdAt).toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p>
      {job.status === 'completed' ? job.outputs.map((output, index) => <div className="render-media" key={output.url}>
        {output.type === 'video' ? <video controls src={output.url} playsInline preload="metadata" /> : output.type === 'audio' ? <audio controls src={output.url} /> : <img src={output.url} alt={jobTitle(job)} />}
        <div className="media-actions"><a className="button" href={output.url} download={output.name || undefined}><Download size={14} /> Download {output.type}</a>{output.type === 'video' && <button className="button" onClick={() => onAdd(job,index)}><Plus size={14} /> Add to film</button>}</div>
      </div>) : isActiveJob(job) ? <div className="render-progress"><LoaderCircle size={25} className="spin" /><p>{job.kind === 'movie' ? 'Assembling your film…' : 'Your scene is rendering on your machine.'}</p>{typeof job.progress === 'number' && <progress value={job.progress} max={1} aria-label={`Progress for ${jobTitle(job)}`} />}</div> : <p className="error-message">{job.error || 'This render was canceled.'}</p>}
      <div className="render-job-actions">{isActiveJob(job) ? <button className="button subtle" disabled={busy.has(job.id) || job.status === 'canceling'} onClick={() => void act(job.id,'cancel')}><Square size={12} /> {job.kind==='movie' ? 'Stop export' : 'Stop render'}</button> : <>{['failed','canceled'].includes(job.status) && <button className="button" disabled={busy.has(job.id)} onClick={() => void act(job.id,'retry')}><RefreshCw size={13} /> Try again</button>}{deleting === job.id ? <div className="inline-confirm"><span>Delete render and file?</span><button className="button danger" disabled={busy.has(job.id)} onClick={() => void act(job.id,'delete')}>Delete</button><button className="button" disabled={busy.has(job.id)} onClick={() => setDeleting(null)}>Keep</button></div> : <button className="icon-button danger" aria-label={`Delete render ${jobTitle(job)}`} disabled={busy.has(job.id)} onClick={() => setDeleting(job.id)}><Trash2 size={15} /></button>}</>}</div>
    </article>)}</div>
  </div>;
}
