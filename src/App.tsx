import { flushSync } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Camera, Car, Check, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Coffee, Copy, Download, FileText, Film, FolderOpen, Grid2X2, Layers3, LoaderCircle, Maximize2, MousePointer2, Move, Pause, Play, Plus, Redo2, Settings2, Scissors, Shuffle, Sparkles, Trash2, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Stage } from './components/Stage';
import type { StageHandle } from './components/Stage';
import { Dialog } from './components/Dialog';
import { Connection } from './components/Connection';
import { FrameMap } from './components/FrameMap';
import { ProjectLibrary } from './components/ProjectLibrary';
import { RenderLibrary } from './components/RenderLibrary';
import { MovieEditor } from './components/MovieEditor';
import { StorySparks } from './components/StorySparks';
import { DirectorDares } from './components/DirectorDares';
import { useRenderLibrary } from './hooks/useRenderLibrary';
import { isActiveJob } from './lib/render';
import type { StudioJob } from './lib/render';
import { getActiveProjectId, loadProject, migrateLegacyProject, saveProject, setActiveProjectId } from './lib/project-store';
import { responseJson } from './lib/api';
import { editSource, filmExportMetadata, guideSource, prepareFrameExport, shotRenderMetadata, studioShortcut } from './lib/studio-controls';
import type { EditFrom } from './lib/studio-controls';
import { cameraMoves } from './lib/camera-moves';
import { keyframeLooks, restyleInstruction } from './lib/restyle';
import { splitFrames, stripGroups, tileFrames } from './lib/triptych';
import type { CameraMove } from './lib/camera-moves';
import { imageDataUrlToBlob } from './lib/image-export';
import { makeStoryProject } from './lib/story-sparks';
import type { StorySparkId } from './lib/story-sparks';
import { makeDareShot } from './lib/director-dares';
import type { DareId } from './lib/director-dares';
import { addKeyframe, changeShotWorld, cloneShot, evenKeyframes, isRetimed, removeKeyframe, retimeKeyframe, removeShot, reorderShot, compilePrompt, downloadFile, frameTime, makeProject, makeShot, MAX_KEYFRAMES, MIN_KEYFRAMES, parseProject, readImage, uid, worlds } from './lib/project';
import type { Health, Pose, Project, PropKind, MovieClip, Shot, StageProp, WorldId } from './lib/project';

function boundedNumber(raw: string, min: number, max: number) { const value = Number(raw); return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0; }
const propOptions: {kind: PropKind; name: string; role: string; color: string; icon: LucideIcon}[] = [
  {kind: 'car', name: 'Little car', role: 'A vintage getaway car', color: '#df543e', icon: Car},
  {kind: 'mug', name: 'Coffee mug', role: 'A monumental tower', color: '#ddd4c2', icon: Coffee},
  {kind: 'arch', name: 'Building block', role: 'A grand gateway', color: '#bac4b0', icon: Box},
  {kind: 'sphere', name: 'Marble', role: 'A small mysterious moon', color: '#d9a266', icon: Sparkles},
  {kind: 'tree', name: 'Wooden tree', role: 'An enormous ancient tree', color: '#78937e', icon: Layers3},
];
export default function App() {
  const [project, setProject] = useState<Project>(makeProject);
  const [frameChoice, setFrameIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'stage' | 'look' | 'renders' | 'film' | 'sparks'>('stage');
  const [inspector, setInspector] = useState<'direction' | 'objects'>('direction');
  const [dialog, setDialog] = useState<'connection' | 'help' | 'templates' | 'export' | 'projects' | 'deleteScene' | null>(null);
  const [worldPreview, setWorldPreview] = useState(false);
  const [editText, setEditText] = useState(''); const [editFrom, setEditFrom] = useState<EditFrom>('this');
  const [showGrid, setShowGrid] = useState(true); const [showPath, setShowPath] = useState(true);
  const [playing, setPlaying] = useState(false); const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [toast, setToast] = useState(''); const [storageError, setStorageError] = useState(false);
  const [projectReady, setProjectReady] = useState(false); const [saving, setSaving] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false); const projectTransition = useRef(false);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const persistProject = useCallback((snapshot: Project, activate = false) => {
    const saved = structuredClone(snapshot);
    const operation = pendingSave.current.catch(() => undefined).then(async () => {await saveProject(saved); if (activate) await setActiveProjectId(saved.id);});
    pendingSave.current = operation; return operation;
  }, []);
  const [busyLabel, setBusyLabel] = useState('Preparing your shot…'); const batchCancel = useRef(false);
  const [health, setHealth] = useState<Health>({connected: false, message: 'Checking your local render engine…'});
  const renders = useRenderLibrary(); const {jobs} = renders; const [submitting, setSubmitting] = useState(false);
  const [captureRequest, setCaptureRequest] = useState<{shot:Shot; key:string; cinematic:boolean; frameIndex:number; time:number | null} | null>(null);
  const capturing = !!captureRequest; const [mobilePanel, setMobilePanel] = useState<'stage' | 'director'>('stage');
  const [historyVersion, setHistoryVersion] = useState(0);
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);
  const history = useRef<Project[]>([]); const future = useRef<Project[]>([]); const lastCommit = useRef(0);
  const stageRef = useRef<StageHandle>(null); const workspaceRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null); const imageRef = useRef<HTMLInputElement>(null);
  const shot = project.shots.find(s => s.id === project.activeShotId) || project.shots[0];
  const frameIndex = Math.min(frameChoice, shot.frames.length - 1);
  // A chosen keyframe that is now this one, the previous one, or gone falls back to the plain choices.
  const editChoice: EditFrom = typeof editFrom !== 'number' ? editFrom : editFrom === frameIndex || editFrom >= shot.frames.length ? 'this' : editFrom === frameIndex - 1 ? 'previous' : editFrom;
  const world = worlds.find(w => w.id === shot.world)!;
  const selected = shot.props.find(p => p.id === selectedId);
  const activeJobs = jobs.filter(isActiveJob);
  const wideWorkspace = view === 'film' || view === 'sparks';
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    let canceled=false;
    void (async () => {
      try {await migrateLegacyProject();} catch (e) {notify(e instanceof Error ? e.message : 'Could not migrate the earlier project.');}
      try {
        const id=await getActiveProjectId(); const saved=id ? await loadProject(id) : null;
        if (!canceled && saved) {projectRef.current=saved; setProject(saved);}
      } catch (e) {if(!canceled) {setStorageError(true); notify(e instanceof Error ? e.message : 'Project storage is unavailable. Export a backup.');}}
      finally {if(!canceled) setProjectReady(true);}
    })();
    return () => {canceled=true;};
  }, [notify]);
  useEffect(() => {
    if (!projectReady) return;
    let current=true; setSaving(true);
    const timer=setTimeout(() => {
      if (projectTransition.current) return;
      void persistProject(project, true).then(() => {if(current) setStorageError(false);}).catch(() => {if(current) setStorageError(true);}).finally(() => {if(current) setSaving(false);});
    }, 400);
    return () => {current=false; clearTimeout(timer);};
  }, [project, projectReady, persistProject]);
  const refreshHealth = useCallback(async () => {
    try { const response = await fetch('/api/health'); if (!response.ok) throw new Error('API unavailable'); setHealth(await response.json()); }
    catch { setHealth({connected: false, message: 'The studio API is offline. Start it with npm run dev.'}); }
  }, []);
  useEffect(() => { void refreshHealth(); const timer = setInterval(() => void refreshHealth(), 15000); return () => clearInterval(timer); }, [refreshHealth]);
  useEffect(() => {
    if (!playing) return;
    const startTime = performance.now() - (previewTime || 0) * shot.duration * 1000;
    let request: number;
    const tick = (now: number) => { const progress = (now - startTime) / (shot.duration * 1000); if (progress >= 1) {setPreviewTime(1); setPlaying(false); return;} setPreviewTime(progress); request = requestAnimationFrame(tick); };
    request = requestAnimationFrame(tick); return () => cancelAnimationFrame(request);
    // The initial playhead is intentionally captured when playback starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, shot.duration]);
  function editProject(transform: (p: Project) => Project, separate = false) {
    if (projectTransition.current) return;
    const previous = projectRef.current;
    if (separate || Date.now() - lastCommit.current > 700) {history.current = [...history.current.slice(-29), previous]; lastCommit.current = Date.now();}
    const next = transform(previous); projectRef.current = next;
    future.current = []; setHistoryVersion(v => v + 1); setProject(next);
  }
  function editShot(transform: (s: Shot) => Shot, separate = false) { editProject(p => ({...p, shots: p.shots.map(s => s.id === p.activeShotId ? transform(s) : s)}), separate); }
  function undo() { const previous = history.current.pop(); if (!previous) return; future.current.push(project); lastCommit.current = 0; projectRef.current = previous; setProject(previous); setHistoryVersion(v => v + 1); }
  function redo() { const next = future.current.pop(); if (!next) return; history.current.push(project); lastCommit.current = 0; projectRef.current = next; setProject(next); setHistoryVersion(v => v + 1); }
  function switchMobilePanel(panel: 'stage' | 'director') { if(panel==='director' && wideWorkspace) setView('stage'); setMobilePanel(panel); window.scrollTo({top: 0, behavior: 'instant'}); }
  function showStorySparks() {setPlaying(false); setView('sparks'); setMobilePanel('stage'); window.scrollTo({top:0,behavior:'instant'});}
  function selectFrame(index: number) { if(index >= shot.frames.length) return; setFrameIndex(index); setPlaying(false); setPreviewTime(null); }
  function play() { setView('stage'); if (!playing && previewTime === 1) setPreviewTime(0); setPlaying(value => !value); }
  function selectShot(id: string) { editProject(p => ({...p, activeShotId: id}), true); selectFrame(0); setSelectedId(null); setView('stage'); }
  function moveProp(id: string, pose: Pose) { editShot(s => ({...s, frames: s.frames.map((f, i) => i === frameIndex ? {...f, poses: {...f.poses, [id]: pose}} : f)})); }
  function editProp(values: Partial<StageProp>) { if (!selectedId) return; editShot(s => ({...s, props: s.props.map(prop => prop.id === selectedId ? {...prop, ...values} : prop)})); }
  function addProp(kind: PropKind) {
    if (shot.props.length >= 8) {notify('This stage holds up to eight props.'); return;}
    const option = propOptions.find(p => p.kind === kind)!; const prop: StageProp = {id: uid(), name: option.name, role: option.role, kind, color: option.color, scale: 1};
    editShot(s => ({...s, props: [...s.props, prop], frames: s.frames.map(f => ({...f, poses: {...f.poses, [prop.id]: {x: 0, z: 2.5, rotation: 0}}}))}), true);
    setSelectedId(prop.id); setInspector('objects'); setView('stage'); selectFrame(frameIndex);
  }
  function removeProp() {
    if (!selectedId || shot.props.length < 2) {notify('Keep at least one prop on your stage.'); return;}
    editShot(s => ({...s, props: s.props.filter(p => p.id !== selectedId), frames: s.frames.map(f => ({...f, poses: Object.fromEntries(Object.entries(f.poses).filter(([id]) => id !== selectedId))}))}), true); setSelectedId(null);
  }
  function newShot(worldId: WorldId = 'desert') {
    if (project.shots.length >= 12) {notify('A project can hold up to 12 shots.'); return;}
    const title = worldId === 'lunar' ? 'A special delivery' : worldId === 'noir' ? 'One last night' : `Untitled shot ${project.shots.length + 1}`;
    const next = makeShot(title, worldId); editProject(p => ({...p, shots: [...p.shots, next], activeShotId: next.id}), true); setDialog(null); selectFrame(0); setSelectedId(null); setView('stage');
  }
  function duplicateShot() {
    if (project.shots.length >= 12) {notify('A project can hold up to 12 shots.'); return;}
    const copy = cloneShot(shot); editProject(p => ({...p, shots: [...p.shots, copy], activeShotId: copy.id}), true); selectFrame(0); setSelectedId(null); setView('stage'); notify('A fresh take. Make it yours.');
  }
  function createDare(id: DareId) {
    const current = projectRef.current;
    if (projectTransition.current) return;
    if (current.shots.length >= 12) {notify('A project can hold up to 12 shots. Remove a scene before making a new take.'); return;}
    const source = current.shots.find(scene => scene.id === current.activeShotId) || current.shots[0];
    const next = makeDareShot(source, id);
    editProject(p => ({...p, shots:[...p.shots, next], activeShotId:next.id}), true);
    selectFrame(0); setSelectedId(null); setInspector('direction'); setView('stage'); switchMobilePanel('stage');
    notify('A new take is ready. Your original scene is still here.');
  }
  function exportProject() { downloadFile(JSON.stringify(project, null, 2), `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.toybox.json`); notify('Your editable project is ready to share.'); }
  async function transitionProject(resolveNext: () => Promise<Project>) {
    if (projectTransition.current) return;
    projectTransition.current=true; setSwitchingProject(true); setPlaying(false);
    try {
      await persistProject(projectRef.current);
      const next=await resolveNext(); await persistProject(next,true);
      projectRef.current=next; setProject(next); history.current=[]; future.current=[]; lastCommit.current=0; setHistoryVersion(v=>v+1);
      selectFrame(0); setSelectedId(null); setView('stage'); setDialog(null); switchMobilePanel('stage'); setStorageError(false);
    } finally {projectTransition.current=false; setSwitchingProject(false);}
  }
  async function openProject(id: string) {
    if(id===projectRef.current.id) {setDialog(null); return;}
    await transitionProject(async () => {const next=await loadProject(id); if(!next) throw new Error('This project no longer exists.'); return next;});
  }
  async function createProject() {await transitionProject(async () => {const next=makeProject(); next.name='Untitled film'; return next;});}
  async function startStory(id: StorySparkId) {
    try {await transitionProject(async () => makeStoryProject(id)); notify('Three scenes, ready to make your own. Your earlier project is saved.');}
    catch (e) {notify(e instanceof Error ? e.message : 'Could not start this film. Please try again.');}
  }
  async function showProjects() {
    if (projectTransition.current) return;
    projectTransition.current=true; setSwitchingProject(true);
    try {await persistProject(projectRef.current); setSaving(false); setDialog('projects');}
    catch(e) {setStorageError(true); notify(e instanceof Error ? e.message : 'Could not open your library.');}
    finally {projectTransition.current=false; setSwitchingProject(false);}
  }
  async function importProject(file?: File) {
    if (!file || projectTransition.current) return;
    try {
      if(file.size>25_000_000) throw new Error('Choose a project smaller than 25 MB.');
      await transitionProject(async () => {const next=parseProject(await file.text()); next.id=uid(); return next;});
      notify('Imported as a new project. Your earlier work is safe.');
    } catch(e) {notify(e instanceof Error ? e.message : 'Could not import this project.');}
  }
  async function uploadFrame(file?: File) {
    if (!file) return; const ownerId=project.id; const targetShotId = shot.id; const targetFrameId = shot.frames[frameIndex].id; try { const data = await readImage(file); editProject(p => p.id!==ownerId ? p : ({...p, shots: p.shots.map(s => s.id === targetShotId ? {...s, frames: s.frames.map(f => f.id === targetFrameId ? {...f, image: data} : f)} : s)}), true); setView('stage'); notify('Photo added to this keyframe.'); } catch (e) {notify(e instanceof Error ? e.message : 'Could not load this photo.');}
  }
  async function captureStage(snapshot: Shot, asWorld = false, index = 0, time: number | null = null) {
    const key=uid();
    flushSync(() => {setCaptureRequest({shot:snapshot, key, cinematic:asWorld, frameIndex:index, time}); setMobilePanel('stage');});
    try {const image=await stageRef.current?.capture({readyKey:key}); if(!image) throw new Error('The stage could not prepare a frame. Enable WebGL or upload a beginning photo.'); return image;}
    finally {flushSync(() => setCaptureRequest(null));}
  }
  async function exportFrame() {
    const source=prepareFrameExport(shot,frameIndex,previewTime);
    setPlaying(false); setSubmitting(true); setBusyLabel('Exporting your frame…');
    try {
      const image=source.image || await captureStage(source.shot,worldPreview,source.frameIndex,source.time);
      const blob=imageDataUrlToBlob(image); const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
      const position=source.time===null?`frame-${source.frameIndex+1}`:`at-${(source.time*source.shot.duration).toFixed(2)}s`;
      downloadFile(blob,`${source.shot.name}-${position}.${extension}`,blob.type); notify('Frame exported at 1024 × 640, or your original photo size.');
    } catch(e) {notify(e instanceof Error ? e.message : 'Could not export the frame.');}
    finally {setSubmitting(false);}
  }
  async function submitShot(snapshot: Shot, owner: Project) {
    // A reveal opens on the toy tabletop instead of the stage world.
    const source=snapshot.frames[0].image || await captureStage(snapshot,!snapshot.reveal,0,0);
    // Later keyframes become the workflow's guide frames, camera move included.
    const keyframes: (string | null)[]=[];
    // Every later keyframe guides at its own time when the workflow has a guide slot for each.
    const later=snapshot.frames.slice(1).map((_,index)=>frameTime(snapshot,index+1));
    const positions=(health.keyframeSlots ?? 0)>=later.length ? later : null;
    for(const position of positions || health.keyframeGuides || []) {
      const guide=guideSource(snapshot,position);
      keyframes.push(guide.kind==='photo' ? guide.image : guide.kind==='stage' ? await captureStage(snapshot,true,guide.frameIndex,guide.time) : null);
    }
    const response=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source,...(keyframes.length?{keyframes}:{}),...(positions?{positions}:{}),prompt:compilePrompt(snapshot),negativePrompt:'blurry, distorted, text, watermark, low quality',seed:snapshot.seed,duration:snapshot.duration,metadata:shotRenderMetadata(snapshot,owner)})});
    const job=await responseJson<StudioJob>(response); renders.accept(job); return job;
  }
  async function renderShot(all = false) {
    if(!health.connected || !health.workflowConfigured) {setDialog('connection'); return;}
    const owner=structuredClone(project); const snapshots=all?owner.shots:[structuredClone(shot)];
    if(activeJobs.length+snapshots.length>12) {notify('The queue holds 12 renders. Let a few finish before adding more.'); return;}
    batchCancel.current=false; setSubmitting(true); setPlaying(false); setPreviewTime(null); switchMobilePanel('stage');
    let submitted=0;
    try {
      for(const [index,snapshot] of snapshots.entries()) {
        if(batchCancel.current) break;
        setBusyLabel(all?`Preparing scene ${index+1} of ${snapshots.length}: ${snapshot.name}`:'Preparing your shot…');
        await submitShot(snapshot,owner); submitted++;
      }
      setView('renders'); notify(`${submitted} ${submitted===1?'shot is':'shots are'} in the local queue.`);
    } catch(e) {notify(`${e instanceof Error?e.message:'Could not start rendering.'}${submitted?` ${submitted} shots were already queued.`:''}`); if(submitted) setView('renders');}
    finally {setSubmitting(false); setCaptureRequest(null); void renders.refresh();}
  }
  const restyleImage=async (image: string, prompt: string, seed: number) => (await responseJson<{image:string}>(await fetch('/api/restyle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,prompt,seed})}))).image;
  // Store results like uploaded keyframe photos, re-encoded to keep projects small.
  async function keepFramePhoto(ownerId: string, shotId: string, frameId: string, image: string) {
    const blob=imageDataUrlToBlob(image), photo=await readImage(new File([blob],'keyframe.jpg',{type:blob.type}));
    editProject(p=>p.id!==ownerId?p:({...p,shots:p.shots.map(s=>s.id!==shotId?s:{...s,frames:s.frames.map(f=>f.id===frameId?{...f,image:photo}:f)})}),true);
  }
  async function restyleKeyframes() {
    if(!health.connected || !health.restyleAvailable) {setDialog('connection'); return;}
    const snapshot=structuredClone(shot), ownerId=project.id, looks=keyframeLooks(snapshot), last=snapshot.frames.length-1;
    const real=looks.flatMap((look,index)=>look==='real'?[index]:[]), toy=looks.flatMap((look,index)=>look==='toy'?[index]:[]);
    const restyle=(image: string, prompt: string) => restyleImage(image,prompt,snapshot.seed);
    const keep=(index: number, image: string) => keepFramePhoto(ownerId,snapshot.id,snapshot.frames[index].id,image);
    setPlaying(false); setSubmitting(true); switchMobilePanel('stage');
    try {
      for(const index of toy) {
        setBusyLabel('Making the opening a real toy photo (about a minute)…');
        await keep(index,await restyle(await captureStage(snapshot,false,index,index/last),restyleInstruction(snapshot,'toy')));
      }
      if(real.length) {
        setBusyLabel(`Making ${real.length===1?'the last keyframe':`${real.length} keyframes`} real (about a minute)…`);
        for(const group of stripGroups(real)) {
          const captures: string[]=[];
          for(const index of group) captures.push(await captureStage(snapshot,true,index,index/last));
          const result=await restyle(group.length>1?await tileFrames(captures):captures[0],restyleInstruction(snapshot,'real',group.length));
          const panels=group.length>1?await splitFrames(result,group.length):[result];
          for(const [position,index] of group.entries()) await keep(index,panels[position]);
        }
      }
      notify('Your keyframes are real now. Select one to compare; shuffle the seed and try again for a different take.');
    } catch(e) {notify(e instanceof Error?e.message:'Could not restyle the keyframes.');}
    finally {setSubmitting(false); setCaptureRequest(null);}
  }
  async function editKeyframe() {
    const prompt=editText.trim();
    if(prompt && (!health.connected || !health.restyleAvailable)) {setDialog('connection'); return;}
    const owner=structuredClone(project), snapshot=owner.shots.find(s=>s.id===shot.id)!, index=frameIndex, source=editSource(owner.shots,snapshot.id,index,editChoice);
    if(!source) {notify('The first scene has no keyframe before this one. Edit this keyframe instead.'); return;}
    setPlaying(false); setSubmitting(true); switchMobilePanel('stage');
    try {
      const image=source.shot.frames[source.index].image || await captureStage(source.shot,worldPreview,source.index,frameTime(source.shot,source.index));
      if(prompt) setBusyLabel(`Editing keyframe ${index+1} (about a minute)…`);
      await keepFramePhoto(owner.id,snapshot.id,snapshot.frames[index].id,prompt?await restyleImage(image,prompt,snapshot.seed):image);
      notify(prompt?'Keyframe edited. Shuffle the seed and edit again for a different take.':'Keyframe copied. Describe a change to edit it.');
    } catch(e) {notify(e instanceof Error?e.message:'Could not edit this keyframe.');}
    finally {setSubmitting(false); setCaptureRequest(null);}
  }
  function insertKeyframe() {
    if(shot.frames.length>=MAX_KEYFRAMES) return;
    editShot(s=>addKeyframe(s,frameIndex),true); setFrameIndex(frameIndex+1); setPlaying(false); setPreviewTime(null);
    notify('In-between keyframe added. Move props or edit its photo, then render.');
  }
  function retime(value: string) {
    const seconds=Number(value), time=seconds/shot.duration;
    if(!value.trim() || !Number.isFinite(seconds) || Math.abs(time-frameTime(shot,frameIndex))<1e-9) return;
    editShot(s=>retimeKeyframe(s,frameIndex,time),true); setPlaying(false); setPreviewTime(null);
  }
  function deleteKeyframe() {
    if(shot.frames.length<=MIN_KEYFRAMES) return;
    editShot(s=>removeKeyframe(s,frameIndex),true); setFrameIndex(Math.max(0,frameIndex-1));
  }
  function addToFilm(job: StudioJob, outputIndex: number) {
    const clips=project.edit?.clips || []; if(clips.length>=24) {notify('A film edit holds up to 24 takes.'); return;}
    const duration=job.outputs[outputIndex].duration || job.renderSeconds;
    editProject(p=>({...p,edit:{clips:[...(p.edit?.clips || []),{id:uid(),jobId:job.id,outputIndex,inPoint:0,...(duration?{outPoint:duration}:{})}]}}),true);
    setView('film'); notify('Take added to your film.');
  }
  async function exportFilm(clips: MovieClip[]) {
    const response=await fetch('/api/movies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...filmExportMetadata(project),clips:clips.map(({jobId,outputIndex,inPoint,outPoint})=>({jobId,outputIndex,inPoint,outPoint}))})});
    renders.accept(await responseJson<StudioJob>(response)); setView('renders'); notify('Assembling your film. The MP4 will appear here.');
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target=event.target instanceof Element ? event.target : null;
      const action=studioShortcut(event, {
        busy:submitting || switchingProject || !projectReady, dialog,
        textEntry:!!target?.closest('input, textarea, select, [contenteditable]'),
        interactive:!!target?.closest('input, textarea, select, button, a, video, audio, [contenteditable]'),
        stageVisible:view==='stage' || view==='look',
      });
      if(!action) return;
      event.preventDefault();
      if(action.kind==='save') exportProject();
      else if(action.kind==='undo') undo();
      else if(action.kind==='redo') redo();
      else if(action.kind==='play') play();
      else if(action.kind==='frame') selectFrame(action.index);
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  const currentPose = selectedId ? shot.frames[frameIndex].poses[selectedId] : null;
  return <><div className={`app-shell ${wideWorkspace ? 'editing-film' : ''}`} aria-busy={submitting || switchingProject} inert={submitting || switchingProject || !projectReady || undefined}>
    <header className="app-header">
      <button className="brand" onClick={() => {setView('stage'); setMobilePanel('stage');}} aria-label="Toybox studio home"><span className="brand-mark"><Box size={23} strokeWidth={1.8} /></span><span>toybox<span className="brand-period">.</span></span></button>
      <nav className="top-nav" aria-label="Main navigation"><button className={view !== 'sparks' ? 'active' : ''} onClick={() => setView('stage')}>Studio</button><button className={view === 'sparks' ? 'active' : ''} onClick={showStorySparks}>Story sparks <ArrowUpRight size={13} /></button></nav>
      <div className="header-end"><span className={`save-status ${storageError ? 'warning' : ''}`}><span />{storageError ? 'Export to save' : saving ? 'Saving…' : 'Saved on this device'}</span><button className="help-button icon-button" aria-label="How Toybox works" onClick={() => setDialog('help')}><CircleHelp size={19} /></button><button className="button export-button" onClick={() => setDialog('export')}><ArrowUpRight size={15} /> Share project</button><span className="avatar" title="Local workspace">You</span></div>
    </header>
    <aside className="sidebar">
      <button className="workspace-label" aria-label="Open project library" onClick={() => void showProjects()}><span className="workspace-symbol">T</span><span>Your workspace<small>Local & yours</small></span><ChevronDown size={14} /></button>
      <div className="side-nav"><button className={view === 'stage' || view === 'look' ? 'selected' : ''} onClick={() => setView('stage')}><Clapperboard size={17} /> Scene board <span>{project.shots.length}</span></button><button className={view === 'renders' ? 'selected' : ''} onClick={() => setView('renders')}><Film size={17} /> My renders {jobs.length > 0 && <span>{jobs.length}</span>}</button><button className={view === 'film' ? 'selected' : ''} onClick={() => setView('film')}><Scissors size={17} /> Film edit</button><button onClick={() => void showProjects()}><FolderOpen size={17} /> Projects</button></div>
      <div className="section-heading"><h2>Your scenes</h2><button className="icon-button small" aria-label="Add a scene" onClick={() => newShot()}><Plus size={17} /></button></div>
      <div className="shot-list">{project.shots.map((item, index) => <button className={`shot-card ${item.id === shot.id ? 'active' : ''}`} key={item.id} onClick={() => selectShot(item.id)}><div className="shot-thumb"><img src={worlds.find(w => w.id === item.world)!.image} alt="" /><span>{String(index + 1).padStart(2, '0')}</span><small>Concept</small></div><div><strong>{item.name}</strong><small>{item.frames.length} keyframes <span>·</span> {item.duration}s preview</small></div></button>)}</div>
      <button className="add-scene" onClick={() => newShot()}><Plus size={16} /> New scene</button>
      <div className="sidebar-bottom"><div className="little-idea"><span className="idea-icon"><Sparkles size={19} /></span><p>Big ideas.<br /><strong>Little beginnings.</strong></p><button aria-label="Explore sample worlds" onClick={() => setDialog('templates')}><ArrowUpRight size={17} /></button></div><button className={`engine-button ${health.connected ? 'connected' : ''}`} onClick={() => setDialog('connection')}><span className="engine-light" /><span>{health.connected ? 'Local ComfyUI' : 'Connect ComfyUI'}<small>{health.connected ? 'Your render engine is online' : 'Bring your own render engine'}</small></span><Settings2 size={15} /></button><button className="open-source-link" onClick={() => setDialog('help')}><Box size={13} /> Open source. Open possibilities.</button></div>
    </aside>
    <main className={`workspace ${mobilePanel === 'director' ? 'mobile-hidden' : ''}`} ref={workspaceRef}>
      {view !== 'sparks' && <div className="mobile-scene-bar"><label><span className="sr-only">Current scene</span><select value={shot.id} onChange={event => selectShot(event.target.value)}>{project.shots.map((scene,index) => <option key={scene.id} value={scene.id}>{index + 1}. {scene.name}</option>)}</select></label><button className="icon-button" aria-label="New scene" onClick={() => newShot()}><Plus size={18} /></button><button className="icon-button" aria-label="Open project library" onClick={() => void showProjects()}><FolderOpen size={18} /></button></div>}
      <div className="project-breadcrumb"><span>{view==='sparks' ? 'Story sparks' : view==='film' ? 'Film edit' : view==='renders' ? 'Render shelf' : 'Scene board'}</span><ChevronRight size={12} /><button className="breadcrumb-project" onClick={() => void showProjects()}>{project.name}</button><div className="history-controls"><button className="icon-button small" aria-label="Undo" disabled={!history.current.length} onClick={undo} data-history={historyVersion}><Undo2 size={16} /></button><button className="icon-button small" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 size={16} /></button></div></div>
      {view==='sparks' ? <StorySparks busy={submitting || switchingProject} onStart={startStory} onBack={() => {setView('stage'); setMobilePanel('stage');}} /> : view==='film' ? <div className="scene-heading film-heading"><div><h1>{project.name || 'Untitled film'}</h1><p>Your scenes, cut into one story.</p></div><button className="button" onClick={() => {setView('stage'); setMobilePanel('stage');}}><Clapperboard size={15} /> Direct a scene</button></div> : <>
      <div className="scene-heading"><div><input className="scene-title" aria-label="Scene name" maxLength={90} value={shot.name} onChange={e => editShot(s => ({...s, name: e.target.value}))} /><input className="scene-note" aria-label="Scene description" maxLength={180} value={shot.note} onChange={e => editShot(s => ({...s, note: e.target.value}))} /></div><div className="scene-actions"><button className="icon-button" aria-label="Move scene earlier" disabled={project.shots[0].id === shot.id} onClick={() => editProject(p => reorderShot(p,shot.id,-1),true)}><ArrowUp size={16} /></button><button className="icon-button" aria-label="Move scene later" disabled={project.shots.at(-1)?.id === shot.id} onClick={() => editProject(p => reorderShot(p,shot.id,1),true)}><ArrowDown size={16} /></button><button className="icon-button danger" aria-label="Delete scene" disabled={project.shots.length < 2} onClick={() => setDialog('deleteScene')}><Trash2 size={16} /></button><button className="icon-button" aria-label="Duplicate scene" title="Duplicate as a new take" onClick={duplicateShot}><Copy size={18} /></button></div></div></>}

      {view !== 'sparks' && <div className="viewport-toolbar"><div className="view-tabs" role="tablist" aria-label="Viewport"><button role="tab" aria-selected={view === 'stage'} onClick={() => setView('stage')}><Box size={15} /> Your stage</button><button role="tab" aria-selected={view === 'look'} onClick={() => setView('look')}><Sparkles size={15} /> Look reference</button><button role="tab" aria-selected={view === 'renders'} onClick={() => setView('renders')}><Film size={15} /> Output{activeJobs.length > 0 && <span className="tab-dot" />}</button><button role="tab" aria-selected={view === 'film'} onClick={() => setView('film')}><Scissors size={15} /> Film edit</button></div><button className="icon-button small fullscreen-control" aria-label="Expand viewport" onClick={() => {if (document.fullscreenElement) void document.exitFullscreen(); else void workspaceRef.current?.requestFullscreen().catch(() => notify('Fullscreen is unavailable in this browser.'));}}><Maximize2 size={15} /></button></div>}
      <section className={`viewport viewport-${view} ${view === 'sparks' ? 'sparks-stage-hidden' : ''}`} aria-label={view === 'stage' ? 'Stage editor' : view === 'look' ? 'Example cinematic look' : view === 'film' ? 'Film editor' : 'Render output'}>
        <div className={`stage-canvas ${view !== 'stage' || (shot.frames[frameIndex].image && previewTime === null) ? 'stage-canvas-hidden' : ''}`} aria-hidden={view !== 'stage'}>
          <Stage ref={stageRef} captureKey={captureRequest?.key} cinematic={captureRequest?.cinematic ?? worldPreview} shot={captureRequest?.shot ?? shot} frameIndex={captureRequest?.frameIndex ?? frameIndex} selectedId={capturing ? null : selectedId} onSelect={id => {setSelectedId(id); if(id) setInspector('objects');}} onMove={moveProp} time={captureRequest ? captureRequest.time : previewTime} showGrid={!capturing && showGrid} camera={(captureRequest?.shot ?? shot).camera} showPath={!capturing && showPath} />
        </div>
        {view === 'stage' && <>
          <div className="stage-topline"><span className="stage-tag"><span />{playing ? 'Playing your staging' : worldPreview ? 'World preview · 3D' : 'Miniature set'}</span><span className="lens-label">{shot.camera === 'low' ? 'Low angle' : shot.camera === 'overhead' ? 'Overhead' : 'Wide angle'}{shot.cameraMove !== 'static' && <> <span>·</span> {cameraMoves.find(move => move.id === shot.cameraMove)!.name}</>} <span>·</span> Frame {frameIndex + 1}</span></div>
          {shot.frames[frameIndex].image && previewTime === null ? <><img className="source-image" src={shot.frames[frameIndex].image} alt={`Uploaded ${shot.frames[frameIndex].label.toLowerCase()} frame`} /><button className="remove-photo button" onClick={() => editShot(s => ({...s, frames: s.frames.map((f, i) => i === frameIndex ? {...f, image: undefined} : f)}), true)}><X size={14} /> Use miniature stage</button></> : null}
          <div className="stage-bottomline"><span><MousePointer2 size={13} /> Drag a prop. Direct the impossible.</span><div className="stage-tools"><button className={`world-preview-toggle ${worldPreview ? 'active' : ''}`} aria-label="Preview cinematic world" title="Turn your props into a world" aria-pressed={worldPreview} onClick={() => setWorldPreview(v => !v)}><WandSparkles size={15} /><span>World preview</span></button><button className={showGrid ? 'active' : ''} aria-label="Toggle stage grid" disabled={worldPreview} aria-pressed={!worldPreview && showGrid} onClick={() => setShowGrid(v => !v)}><Grid2X2 size={15} /></button><button className={showPath ? 'active' : ''} aria-label="Toggle motion path" aria-pressed={showPath} onClick={() => setShowPath(v => !v)}><Move size={15} /></button><button aria-label="Switch camera angle" onClick={() => {editShot(s => ({...s, camera: s.camera === 'wide' ? 'low' : 'wide'}));}}><Camera size={15} /></button></div></div>
        </>}
        {view === 'look' && <><img className="look-image" src={world.image} alt={`${world.name}: a cinematic reference with a red vehicle in a monumental landscape`} /><div className="look-caption"><h2>{world.name}</h2><p>A little inspiration for your next big scene.</p></div><span className="reference-notice">Concept still · not a generated shot</span></>}
        {view === 'renders' && <RenderLibrary jobs={jobs} loading={renders.loading} error={renders.error} projectId={project.id} onAction={renders.action} onAdd={addToFilm} onRender={() => void renderShot()} onRefresh={() => void renders.refresh()} />}
        {view === 'film' && <MovieEditor project={project} jobs={jobs} onChange={clips => editProject(p => ({...p,edit:{clips}}),true)} onExport={exportFilm} onRenders={() => setView('renders')} />}

      </section>
      {(view === 'stage' || view === 'look') && <><div className="playback-bar"><button className="play-button" onClick={play} aria-label={playing ? 'Pause stage preview' : 'Play stage preview'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><span className="timecode">00:{String(Math.floor((previewTime || 0) * shot.duration)).padStart(2, '0')}<span> / 00:{String(shot.duration).padStart(2, '0')}</span></span><input aria-label="Stage preview position" type="range" min={0} max={1} step={.001} value={previewTime ?? frameTime(shot, frameIndex)} onChange={e => {setPlaying(false); setPreviewTime(Number(e.target.value)); setView('stage');}} /><span className="preview-label">Stage preview</span><button className="icon-button small" aria-label="Export current stage frame" onClick={() => void exportFrame()}><ArrowDownToLine size={16} /></button></div>
      <section className="storyboard"><div className="storyboard-heading"><div><h2>{shot.frames.length === 3 ? 'Three' : shot.frames.length} moments. One story.</h2><span>Set the scene, then move things along.</span></div><div className="storyboard-actions"><button className="text-button" title="Restyle each keyframe into a real photograph with your local image model" onClick={() => void restyleKeyframes()}><WandSparkles size={14} /> Make keyframes real</button><button className="text-button" onClick={() => imageRef.current?.click()}><Upload size={14} /> Add your photo</button>{frameIndex > 0 && frameIndex < shot.frames.length - 1 && <label className="keyframe-time" title="When this keyframe happens in the shot">At <input key={`${shot.frames[frameIndex].id}-${frameTime(shot, frameIndex)}`} type="number" inputMode="decimal" min={0} max={shot.duration} step={.1} defaultValue={(shot.duration * frameTime(shot, frameIndex)).toFixed(1)} aria-label={`Time of keyframe ${frameIndex + 1} in seconds`} onBlur={e => retime(e.currentTarget.value)} onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur();}} /> s</label>}{isRetimed(shot) && <button className="text-button" title="Space the keyframes evenly again" onClick={() => editShot(evenKeyframes, true)}>Even spacing</button>}{shot.frames.length > MIN_KEYFRAMES && <button className="text-button" aria-label={`Remove keyframe ${frameIndex + 1}`} onClick={deleteKeyframe}><Trash2 size={14} /> Remove</button>}</div></div><div className="frame-strip">{shot.frames.map((frame, index) => <button key={frame.id} className={`frame-card ${index === frameIndex && previewTime === null ? 'active' : ''}`} onClick={() => {selectFrame(index); setView('stage');}}><div className="frame-image"><FrameMap shot={shot} frame={frame} /><span className="frame-number">{String(index + 1).padStart(2, '0')}</span>{index === frameIndex && previewTime === null && <span className="frame-selected"><Check size={12} /></span>}</div><div className="frame-caption"><strong>{frame.label}</strong><span>{(shot.duration * frameTime(shot, index)).toFixed(1)}s</span></div></button>)}{shot.frames.length < MAX_KEYFRAMES && <button className="add-keyframe" aria-label={`Add a keyframe after keyframe ${frameIndex + 1}`} title="Add an in-between keyframe" onClick={insertKeyframe}><Plus size={17} /></button>}</div><form className="keyframe-edit" onSubmit={e => {e.preventDefault(); void editKeyframe();}}><WandSparkles size={14} aria-hidden /><input aria-label={`Describe a change to keyframe ${frameIndex + 1}`} maxLength={4000} value={editText} onChange={e => setEditText(e.target.value)} placeholder="Describe a change, like “the toy becomes a real car”" /><select aria-label="Edit from" value={typeof editChoice === 'number' ? `frame-${editChoice}` : editChoice} onChange={e => setEditFrom(e.target.value.startsWith('frame-') ? Number(e.target.value.slice(6)) : e.target.value as EditFrom)}><option value="this">From this keyframe</option><option value="previous">{frameIndex === 0 ? 'From the last scene' : 'From the previous keyframe'}</option>{shot.frames.map((_, index) => index !== frameIndex && index !== frameIndex - 1 && <option key={index} value={`frame-${index}`}>From keyframe {index + 1}</option>)}</select><button className="button" type="submit" disabled={!editText.trim() && editChoice === 'this'}>{!editText.trim() && editChoice !== 'this' ? 'Copy' : 'Edit'}</button></form></section></>}
      {view !== 'sparks' && <footer className="workspace-footer"><span><Box size={12} /> Built for the way you imagine.</span><span>Move props between frames <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></footer>}
    </main>
    <aside className={`inspector ${mobilePanel !== 'director' ? 'mobile-hidden' : ''}`}>
      <div className="inspector-tabs"><button className={inspector === 'direction' ? 'active' : ''} onClick={() => setInspector('direction')}><WandSparkles size={15} /> Direct</button><button className={inspector === 'objects' ? 'active' : ''} onClick={() => setInspector('objects')}><Box size={15} /> Props <span>{shot.props.length}</span></button></div>
      <div className="inspector-content">{inspector === 'direction' ? <>
        <button className="story-sparks-entry" onClick={showStorySparks}><Clapperboard size={19} /><span><strong>Story sparks</strong><small>Three small films. A place to begin.</small></span><ArrowUpRight size={16} /></button>
        <section className="inspector-section"><div className="field-heading"><h2>Choose a world</h2><Sparkles size={15} /></div><p className="section-description">Same little stage. A whole new place.</p><div className="world-list">{worlds.map(w => <button className={`world-option ${shot.world === w.id ? 'active' : ''}`} key={w.id} onClick={() => editShot(s => changeShotWorld(s,w.id), true)}><img src={w.image} alt="" /><span><strong>{w.name}</strong><small>{w.subtitle}</small></span><span className="radio-indicator">{shot.world === w.id && <span />}</span></button>)}</div><button className="text-button look-link" onClick={() => {setView('look'); setMobilePanel('stage');}}>Explore this look <ArrowUpRight size={13} /></button></section>
        <section className="inspector-section"><div className="field-heading"><h2>The direction</h2><span className="optional-note">Make it yours</span></div><label className="sr-only" htmlFor="direction">Shot direction</label><textarea id="direction" className="direction-input" value={shot.prompt} maxLength={4000} onChange={e => editShot(s => ({...s, prompt: e.target.value}))} rows={5} /><div className="prompt-note"><span className="tiny-dot" />Your props and world join this direction.</div></section>
        <DirectorDares shot={shot} disabled={submitting || switchingProject || project.shots.length >= 12} atSceneLimit={project.shots.length >= 12} onCreate={createDare} />
        <section className="inspector-section shot-settings"><div className="field-heading"><h2>Behind the camera</h2><Camera size={15} /></div><label className="inline-field"><span>Camera angle</span><select value={shot.camera} onChange={e => editShot(s => ({...s, camera: e.target.value as Shot['camera']}))}><option value="wide">Wide angle</option><option value="low">Low angle</option><option value="overhead">Overhead</option></select></label><label className="inline-field"><span>Camera move</span><select value={shot.cameraMove} onChange={e => {setPlaying(false); editShot(s => ({...s, cameraMove: e.target.value as CameraMove}), true);}}>{cameraMoves.map(move => <option key={move.id} value={move.id}>{move.name}</option>)}</select></label><label className="inline-field" title="Keyframe 1 stays toys on a tabletop; by the last keyframe they are the real thing."><span>Toy → real reveal</span><input type="checkbox" checked={shot.reveal} onChange={e => editShot(s => ({...s, reveal: e.target.checked}), true)} /></label><label className="inline-field"><span>Preview length</span><select value={shot.duration} onChange={e => {setPlaying(false); editShot(s => ({...s, duration: Number(e.target.value)}));}}>{[3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><div className="inline-field"><label htmlFor="seed">Seed</label><div className="seed-field"><input id="seed" type="number" min={0} max={2147483647} value={shot.seed} onChange={e => editShot(s => ({...s, seed: Math.max(0, Math.min(2147483647, Math.floor(Number(e.target.value))))}))} /><button className="icon-button small" aria-label="Randomize seed" onClick={() => editShot(s => ({...s, seed: Math.floor(Math.random() * 2147483647)}))}><Shuffle size={14} /></button></div></div></section>
      </> : <>
        <section className="inspector-section"><div className="field-heading"><h2>The cast of your scene</h2><span className="optional-note">{shot.props.length}/8 props</span></div><p className="section-description">Everyday objects. Extraordinary roles.</p><div className="prop-list">{shot.props.map(prop => {const Icon = propOptions.find(p => p.kind === prop.kind)!.icon; return <button key={prop.id} className={`prop-row ${selectedId === prop.id ? 'active' : ''}`} onClick={() => {setSelectedId(prop.id); setView('stage');}}><span className="prop-icon" style={{color: prop.color}}><Icon size={20} /></span><span><strong>{prop.name}</strong><small>{prop.role}</small></span><ChevronRight size={13} /></button>;})}</div></section>
        {selected && currentPose ? <section className="inspector-section prop-editor"><div className="field-heading"><h2>Give it a part to play</h2><button className="icon-button small danger" aria-label="Remove selected prop" disabled={shot.props.length < 2} onClick={removeProp}><Trash2 size={14} /></button></div><label className="field"><span>Prop name</span><input value={selected.name} maxLength={80} onChange={e => editProp({name: e.target.value})} /></label><label className="field"><span>In the movie, this becomes…</span><textarea rows={2} value={selected.role} maxLength={500} onChange={e => editProp({role: e.target.value})} /></label><div className="position-fields"><label className="field"><span>X position</span><input type="number" min={-5.5} max={5.5} step={.1} value={Number(currentPose.x.toFixed(1))} onChange={e => moveProp(selected.id, {...currentPose, x: boundedNumber(e.target.value, -5.5, 5.5)})} /></label><label className="field"><span>Z position</span><input type="number" min={-3.6} max={3.6} step={.1} value={Number(currentPose.z.toFixed(1))} onChange={e => moveProp(selected.id, {...currentPose, z: boundedNumber(e.target.value, -3.6, 3.6)})} /></label></div><label className="field range-field"><span>Rotation <span>{Math.round(currentPose.rotation * 180 / Math.PI)}°</span></span><input type="range" min={-Math.PI} max={Math.PI} step={.05} value={currentPose.rotation} onChange={e => moveProp(selected.id, {...currentPose, rotation: Number(e.target.value)})} /></label><label className="field range-field"><span>Scale <span>{selected.scale.toFixed(1)}×</span></span><input type="range" min={.3} max={2.5} step={.1} value={selected.scale} onChange={e => editProp({scale: Number(e.target.value)})} /></label><label className="color-field"><span>Prop color</span><input type="color" aria-label="Prop color" value={selected.color} onChange={e => editProp({color: e.target.value})} /></label><button className="button subtle full-width" onClick={() => {editShot(s => ({...s, frames: s.frames.map(f => ({...f, poses: {...f.poses, [selected.id]: {...currentPose}}}))}), true); notify('Position copied to all three frames.');}}><Copy size={13} /> Same position in every frame</button></section> : <div className="select-prop-note"><MousePointer2 size={18} /><p>Select a prop on the stage or in the list to direct its movement.</p></div>}
        <section className="inspector-section"><h2>Add to your toybox</h2><div className="prop-picker">{propOptions.map(option => <button key={option.kind} disabled={shot.props.length >= 8} onClick={() => addProp(option.kind)} title={`Add ${option.name}`}><option.icon size={20} /><span>{option.kind === 'sphere' ? 'Marble' : option.kind === 'arch' ? 'Block' : option.kind === 'tree' ? 'Tree' : option.kind === 'car' ? 'Car' : 'Mug'}</span><Plus size={10} /></button>)}</div></section>
      </>}</div>
      <div className="render-action"><div className="render-summary"><span><span className={`engine-light ${health.connected ? 'online' : ''}`} />{health.connected ? 'Local ComfyUI' : 'Local rendering'}</span><button className="icon-button small" aria-label="Render settings" onClick={() => setDialog('connection')}><Settings2 size={15} /></button></div><button className="button primary render-button" disabled={submitting || activeJobs.length >= 12} onClick={() => void renderShot()}>{submitting ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{submitting ? 'Preparing your shot…' : 'Make it cinematic'}{!submitting && <ArrowRight size={17} />}</button><p>{health.connected && health.workflowConfigured ? health.keyframeGuides?.length ? 'Your keyframes and camera move guide the render.' : 'First frame + your direction. Timing follows the workflow.' : 'Connect your engine when you’re ready to render.'}</p>{project.shots.length > 1 && <button className="button subtle full-width batch-render" disabled={submitting || activeJobs.length + project.shots.length > 12} onClick={() => void renderShot(true)}><Clapperboard size={14} /> Render all {project.shots.length} scenes</button>}</div>
    </aside>
    <div className="mobile-switch"><button className={mobilePanel === 'stage' ? 'active' : ''} onClick={() => switchMobilePanel('stage')}><Box size={16} /> Stage</button><button className={mobilePanel === 'director' ? 'active' : ''} onClick={() => switchMobilePanel('director')}><Settings2 size={16} /> Director</button></div>
    <input ref={importRef} className="sr-only" type="file" accept=".json" aria-label="Open Toybox project" onChange={e => {void importProject(e.target.files?.[0]); e.target.value = '';}} />
    <input ref={imageRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload keyframe photo" onChange={e => {void uploadFrame(e.target.files?.[0]); e.target.value = '';}} />
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
    {dialog === 'projects' && <ProjectLibrary switching={switchingProject} activeId={project.id} onOpen={openProject} onNew={createProject} onImport={() => importRef.current?.click()} onClose={() => {if(!projectTransition.current) setDialog(null);}} />}
    {dialog === 'deleteScene' && <Dialog title="Delete this scene?" onClose={() => setDialog(null)}><p className="dialog-intro">Remove {shot.name} from this project? Its completed renders will stay on your render shelf. You can undo this change.</p><div className="dialog-footer"><button className="button" onClick={() => setDialog(null)}>Keep scene</button><button className="button primary" onClick={() => {editProject(p => removeShot(p,shot.id),true); selectFrame(0); setSelectedId(null); setDialog(null);}}>Delete scene</button></div></Dialog>}
    {dialog === 'connection' && <Connection health={health} refresh={refreshHealth} onClose={() => setDialog(null)} />}
    {dialog === 'templates' && <Dialog title="Where will your little world go?" onClose={() => setDialog(null)} wide><p className="dialog-intro">Start with a feeling. Make the rest your own.</p><div className="template-grid">{worlds.map(w => <button className="template-card" key={w.id} onClick={() => newShot(w.id)}><img src={w.image} alt={`Example concept for ${w.name}`} /><div><h3>{w.name}</h3><ArrowUpRight size={19} /></div><p>{w.subtitle}</p></button>)}</div><p className="small-text">Illustrative concept artwork. Your generated shots depend on your model and workflow.</p></Dialog>}
    {dialog === 'export' && <Dialog title="Give someone else the director’s chair." onClose={() => setDialog(null)}><p className="dialog-intro">Share the scene behind the shot. Every prop, keyframe, and creative decision travels with it.</p><label className="field"><span>Project name</span><input value={project.name} maxLength={100} onChange={e => editProject(p => ({...p, name: e.target.value}))} /></label><div className="export-details"><span><Check size={15} /> {project.shots.length} editable {project.shots.length === 1 ? 'scene' : 'scenes'}</span><span><Check size={15} /> Props, positions & directions</span><span><Check size={15} /> Uploaded frame images</span></div><button className="button primary full-width" onClick={exportProject}><Download size={16} /> Export Toybox project</button><button className="button subtle full-width" onClick={() => {downloadFile(compilePrompt(shot), 'shot-direction.txt', 'text/plain'); notify('Shot direction exported.');}}><FileText size={16} /> Export this shot’s direction</button><p className="small-text export-footnote">Projects are portable JSON files. Rendered videos are downloaded separately from Output. Film edits reference the renders on this machine. API keys are never included.</p></Dialog>}
    {dialog === 'help' && <Dialog title="A little stage for big ideas." onClose={() => setDialog(null)} wide><div className="help-intro"><span className="brand-mark"><Box size={28} /></span><p>Toybox is an open-source filmmaking studio. Arrange the small things. Imagine the big things.</p></div><ol className="help-steps"><li><strong>Build your little world.</strong><p>Drag props around the stage, or upload a photo of a real tabletop set. Select a prop to say what it becomes in your movie.</p></li><li><strong>Give it a beginning, middle, and end.</strong><p>Use the wand on the stage to preview your props as a cinematic world. Move props in each keyframe. Press Space to preview the staging. Pick a camera move under Behind the camera. Add in-between keyframes with +. Every keyframe, seen through that move, guides the generated video.</p></li><li><strong>Make it cinematic.</strong><p>Choose a world and describe the action. Connect local ComfyUI and an API-format workflow to render a real shot. The look references are sample artwork.</p></li><li><strong>Pass the imagination along.</strong><p>Export your Toybox project so someone else can remix the same scene. Your photos stay in your browser until you send them to your configured render engine.</p></li></ol><div className="help-footer"><span>App: MIT license · Models: their respective licenses</span><span><kbd>Space</kbd> Play <kbd>⌘/Ctrl Z</kbd> Undo</span></div></Dialog>}
  </div>{(submitting || switchingProject || !projectReady) && <div className="preparing-overlay" role="status"><div><LoaderCircle size={25} className="spin" /><p>{!projectReady ? 'Opening your workspace…' : switchingProject ? 'Saving your project…' : busyLabel}</p>{submitting && busyLabel.startsWith('Preparing scene') && <button className="button" onClick={() => {batchCancel.current=true;}}>Stop adding shots</button>}</div></div>}</>;
}
