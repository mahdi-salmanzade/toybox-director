import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { Dialog } from './Dialog';
import { deleteProject, listProjects } from '../lib/project-store';
import type { ProjectSummary } from '../lib/project-store';
import { worlds } from '../lib/project';

export function ProjectLibrary({activeId, switching = false, onOpen, onNew, onImport, onClose}: {activeId: string; switching?: boolean; onOpen: (id: string) => Promise<void>; onNew: () => Promise<void>; onImport: () => void; onClose: () => void}) {
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => { let canceled = false; listProjects().then(data => {if (!canceled) setItems(data);}).catch(e => {if (!canceled) setError(e.message);}).finally(() => {if (!canceled) setLoading(false);}); return () => {canceled = true;}; }, []);
  async function run(action: () => Promise<void>) {setBusy(true); setError(''); try {await action();} catch (e) {setError(e instanceof Error ? e.message : 'Could not update your library.');} finally {setBusy(false);}}
  return <Dialog title="Your projects" onClose={onClose} busy={busy || switching} wide>
    <p className="dialog-intro">Different worlds, safely kept on this device. Export a project to take it elsewhere.</p>
    <div className="library-actions"><button className="button primary" disabled={busy} onClick={() => void run(onNew)}><Plus size={16} /> New project</button><button className="button" onClick={onImport} disabled={busy}><Upload size={16} /> Import project</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading ? <p className="library-loading" role="status">Opening your project shelf…</p> : <div className="project-shelf">{items.map(item => <article className="project-shelf-row" key={item.id}>
      <img src={worlds.find(w => w.id === item.world)?.image} alt="" />
      <button className="project-shelf-open" disabled={busy} onClick={() => void run(() => onOpen(item.id))}><strong>{item.name || 'Untitled project'}</strong><span>{item.shotCount} {item.shotCount === 1 ? 'scene' : 'scenes'} · {new Date(item.updatedAt).toLocaleDateString()}{item.id === activeId ? ' · Open now' : ''}</span></button>
      {deleting === item.id ? <div className="inline-confirm"><span>Delete this project?</span><button className="button danger" disabled={busy} onClick={() => void run(async () => {await deleteProject(item.id); setItems(previous => previous.filter(p => p.id !== item.id)); setDeleting(null);})}>Delete</button><button className="button" onClick={() => setDeleting(null)}>Keep</button></div> : <button className="icon-button" disabled={busy || item.id === activeId} aria-label={`Delete project ${item.name}`} onClick={() => setDeleting(item.id)}><Trash2 size={16} /></button>}
    </article>)}</div>}
    {!loading && !items.length && <p className="library-loading"><FolderOpen size={24} /> Your first project will appear here after saving.</p>}
  </Dialog>;
}
