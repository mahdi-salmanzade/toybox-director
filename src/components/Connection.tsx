import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, CircuitBoard, FileJson, LoaderCircle, RefreshCw, Upload } from 'lucide-react';
import type { Health } from '../lib/project';
import { Dialog } from './Dialog';

type Binding = {nodeId: string; input: string};
type Bindings = {image?: Binding; prompt?: Binding; negativePrompt?: Binding; seed?: Binding; duration?: Binding; keyframes?: unknown[]; outputNodeId?: string};
type Starter = {id: string; name: string; detail: string; active: boolean};
type WorkflowNode = {id: string; classType: string; title: string; inputs: {name: string; type: string; value: unknown}[]};
type WorkflowState = {configured: boolean; workflow: Record<string, unknown> | null; bindings: Bindings | null; nodes: WorkflowNode[]};
export function Connection({ health, refresh, onClose }: { health: Health; refresh: () => Promise<void>; onClose: () => void }) {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [bindings, setBindings] = useState<Bindings>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starters, setStarters] = useState<Starter[]>([]);
  const operation = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/workflow', {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)])})
      .then(r => { if (!r.ok) throw new Error('Workflow unavailable'); return r.json(); })
      .then(data => { if (active) {setState(data); setBindings(data.bindings || {});} })
      .catch(() => {if (active) setError('The workflow could not be loaded. Check the Toybox server, then reopen these settings.');})
      .finally(() => {if (active) setLoading(false);});
    fetch('/api/starters', {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)])})
      .then(r => r.ok ? r.json() : []).then(data => {if (active && Array.isArray(data)) setStarters(data);}).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, []);
  function beginOperation() {
    if (loading || operation.current) return false;
    operation.current=true; setBusy(true); setError(''); return true;
  }
  function finishOperation() {operation.current=false; setBusy(false);}
  async function importWorkflow(file?: File) {
    if (!file || !beginOperation()) return; setSaved(false);
    try {
      if (file.size > 2_000_000) throw new Error('Choose a workflow JSON smaller than 2 MB.');
      const raw = JSON.parse(await file.text());
      const workflow = raw.workflow || raw;
      const response = await fetch('/api/workflow', { method: 'POST', signal: AbortSignal.timeout(25000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ workflow, inspect: true }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setState(data);
      const suggested: Bindings = raw.bindings || data.bindings || {};
      if (!raw.bindings && !data.bindings) {
        const nodes = data.nodes as WorkflowNode[];
        const image = nodes.find(n => n.classType === 'LoadImage');
        const prompt = nodes.find(n => n.classType === 'CLIPTextEncode');
        const seed = nodes.find(n => n.inputs.some(input => ['seed', 'noise_seed'].includes(input.name)));
        if (image) suggested.image = { nodeId: image.id, input: 'image' };
        if (prompt) suggested.prompt = { nodeId: prompt.id, input: 'text' };
        if (seed) suggested.seed = { nodeId: seed.id, input: seed.inputs.find(input => ['seed', 'noise_seed'].includes(input.name))!.name };
      }
      setBindings(suggested);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this workflow.'); } finally { finishOperation(); }
  }
  async function save() {
    if (!beginOperation()) return;
    try {
      const response = await fetch('/api/workflow', {method: 'POST', signal: AbortSignal.timeout(25000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ workflow: state?.workflow, bindings })});
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setState(data); setBindings(data.bindings || {}); setSaved(true); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your workflow.'); } finally { finishOperation(); }
  }
  async function chooseStarter(id: string) {
    if (!beginOperation()) return; setSaved(false);
    try {
      const response = await fetch('/api/workflow/starter', {method: 'POST', signal: AbortSignal.timeout(25000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setState(data); setBindings(data.bindings || {}); setSaved(true);
      setStarters(list => list.map(item => ({...item, active: item.id === id}))); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not use this starter.'); } finally { finishOperation(); }
  }
  async function checkConnection() {
    if (!beginOperation()) return;
    try {await refresh();} catch(e) {setError(e instanceof Error ? e.message : 'Could not check the render engine.');} finally {finishOperation();}
  }
  return <Dialog title="Your local render engine" onClose={onClose} busy={busy} wide>
    <div className={`connection-status ${health.connected ? 'is-connected' : ''}`}><CircuitBoard size={25} /><div><strong>{health.connected ? 'ComfyUI is connected' : 'Connect ComfyUI'}</strong><p>{health.connected ? 'Your shots are rendered on your own machine.' : 'The stage works offline. Connect the engine to generate video.'}</p></div><button className="icon-button" title="Check connection" aria-label="Check connection" disabled={busy || loading} onClick={() => void checkConnection()}><RefreshCw size={17} className={busy ? 'spin' : ''} /></button></div>
    {!health.connected && <div className="setup-steps"><p>From the project folder, run:</p><code>npm run setup:local</code><p>Then start the runtime and studio using the commands printed by setup. The studio connects through the Comfy API proxy on <strong>localhost:8189</strong>.</p><details><summary>Connection details</summary><p className="small-text">{health.message}</p></details></div>}
    <div className="workflow-title"><div><h3>Render workflow</h3><p>Bring your own Comfy workflow. Keep every creative decision.</p></div>{state?.configured && <span className="status-label"><CheckCircle2 size={14} /> Ready</span>}</div>
    {loading && <p className="small-text" role="status">Loading your workflow…</p>}
    {starters.length > 0 && <div className="starter-list">{starters.map(starter => <button key={starter.id} className={`starter ${starter.active ? 'is-active' : ''}`} disabled={busy || loading || starter.active} onClick={() => void chooseStarter(starter.id)}><span><strong>{starter.name}</strong><small>{starter.detail}</small></span>{starter.active ? <span className="status-label"><CheckCircle2 size={14} /> In use</span> : <span className="starter-use">Use</span>}</button>)}</div>}
    <button className="workflow-upload" onClick={() => fileRef.current?.click()} disabled={busy || loading}><FileJson size={23} /><span><strong>{state?.workflow ? 'Replace workflow JSON' : 'Import workflow JSON'}</strong><small>Export in API format from ComfyUI.</small></span><Upload size={17} /></button>
    <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" disabled={busy || loading} onChange={e => {void importWorkflow(e.target.files?.[0]); e.target.value = '';}} aria-label="Import Comfy workflow" />
    {state?.workflow && <div className="binding-grid">{(['image', 'prompt', 'seed', 'negativePrompt'] as const).map(key => <label className="field" key={key}><span>{({image: 'Source image', prompt: 'Shot direction', seed: 'Seed (optional)', negativePrompt: 'Negative prompt (optional)'})[key]}</span><select disabled={busy || loading} value={bindings[key] ? `${bindings[key]!.nodeId}|${bindings[key]!.input}` : ''} onChange={e => { const [nodeId, input] = e.target.value.split('|'); setBindings(prev => ({ ...prev, [key]: nodeId ? {nodeId, input} : undefined })); setSaved(false); }}><option value="">{key === 'image' || key === 'prompt' ? 'Select an input…' : 'Use workflow default'}</option>{state.nodes.flatMap(n => n.inputs.filter(i => key === 'seed' ? i.type === 'number' : i.type === 'string').map(input => <option key={`${n.id}-${input.name}`} value={`${n.id}|${input.name}`}>{n.title || n.classType} #{n.id} · {input.name}</option>))}</select></label>)}</div>}
    {state?.nodes.some(node => node.classType === 'LTXVAddGuide') && !bindings.keyframes?.length && <p className="small-text">This graph has keyframe guides that aren’t mapped, so only the first keyframe will steer the video. Use a starter above, or import a file that includes its bindings.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="dialog-footer"><span className="small-text">Model files and API keys stay on your machine.</span><button className="button primary" disabled={busy || loading || !state?.workflow || !bindings.image || !bindings.prompt} onClick={() => void save()}>{busy ? <LoaderCircle size={15} className="spin" /> : saved ? <Check size={15} /> : null}{saved ? 'Workflow saved' : 'Save workflow'}</button></div>
  </Dialog>;
}
