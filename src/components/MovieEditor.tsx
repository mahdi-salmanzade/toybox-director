import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clapperboard, Download, Film, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { MovieClip, Project } from '../lib/project';
import { uid } from '../lib/project';
import { jobTitle } from '../lib/render';
import type { StudioJob } from '../lib/render';
import { clipSeconds, clipTrimProblem, completedVideoTakes, createClipBoundary, MAX_FILM_SECONDS, takesForProject } from '../lib/film';
import type { FilmTake } from '../lib/film';

export function MovieEditor({project, jobs, onChange, onExport, onRenders}: {project: Project; jobs: StudioJob[]; onChange: (clips: MovieClip[]) => void; onExport: (clips: MovieClip[]) => Promise<void>; onRenders: () => void}) {
  const clips = project.edit?.clips || [];
  const [mediaDurations, setMediaDurations] = useState<Record<string, number>>({});
  const takes = completedVideoTakes(jobs).map(take => ({...take, duration: mediaDurations[`${take.job.id}:${take.outputIndex}`] ?? take.duration}));
  const projectTakes = takesForProject(takes, project.id);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [takeKey, setTakeKey] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playingRef = useRef(false);
  const boundary = useRef(createClipBoundary());
  const current = clips[Math.min(selected, Math.max(0,clips.length-1))];
  const currentTake = current && takes.find(t => t.job.id === current.jobId && t.outputIndex === current.outputIndex);
  const durationFor = (clip: MovieClip) => clipSeconds(clip, takes.find(t => t.job.id === clip.jobId && t.outputIndex === clip.outputIndex)?.duration);
  const total = clips.reduce((sum,clip) => sum + durationFor(clip),0);
  const missing = clips.some(clip => !takes.some(t => t.job.id === clip.jobId && t.outputIndex === clip.outputIndex));
  const invalidClip = clips.findIndex(clip => !!clipTrimProblem(clip, takes.find(t => t.job.id === clip.jobId && t.outputIndex === clip.outputIndex)?.duration));
  const problem = missing ? 'Remove or replace missing takes before exporting.'
    : invalidClip >= 0 ? `Clip ${invalidClip + 1}: ${clipTrimProblem(clips[invalidClip], takes.find(t => t.job.id === clips[invalidClip].jobId && t.outputIndex === clips[invalidClip].outputIndex)?.duration)}`
    : total > MAX_FILM_SECONDS ? 'Keep your film under five minutes. Trim or remove a clip before exporting.' : '';
  const chosenTake = projectTakes.find(t => `${t.job.id}:${t.outputIndex}` === takeKey);
  useEffect(() => {
    const video = videoRef.current;
    if (!playing) {video?.pause(); return;}
    if (video && video.readyState >= 1) void video.play().catch(() => {
      if (video !== videoRef.current) return;
      playingRef.current = false;
      setPlaying(false);
    });
    // Native timeupdate can be hundreds of milliseconds apart. Watch the cut
    // boundary each display frame as well so short trims do not visibly overrun.
    let frame: number;
    const watchBoundary = () => {
      if (video && current && video === videoRef.current && video.currentTime >= endFor(video,current)-.001) next(video,current);
      frame=requestAnimationFrame(watchBoundary);
    };
    frame=requestAnimationFrame(watchBoundary);
    return () => cancelAnimationFrame(frame);
  }, [playing,current?.id,current?.inPoint,current?.outPoint,clips]);
  function stop() {playingRef.current=false; setPlaying(false); videoRef.current?.pause();}
  function endFor(video: HTMLVideoElement, clip: MovieClip) {
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    return Math.min(clip.outPoint ?? duration, duration);
  }
  function next(video: HTMLVideoElement, clip: MovieClip) {
    if (video !== videoRef.current || !playingRef.current || !boundary.current.finish(clip.id)) return;
    video.pause();
    const index = clips.findIndex(item => item.id === clip.id);
    if (index >= 0 && index + 1 < clips.length) setSelected(index + 1);
    else stop();
  }
  function nativePlay(video: HTMLVideoElement, clip: MovieClip) {
    if (video !== videoRef.current) return;
    const end = endFor(video, clip);
    if (end <= clip.inPoint) {stop(); return;}
    boundary.current.start(clip.id);
    if (video.currentTime < clip.inPoint || video.currentTime >= end - .001) video.currentTime = clip.inPoint;
    playingRef.current=true; setPlaying(true);
  }
  function nativePause(video: HTMLVideoElement, clip: MovieClip) {
    if (video !== videoRef.current || boundary.current.finished(clip.id)) return;
    if (video.currentTime >= endFor(video, clip) - .001) {next(video, clip); return;}
    playingRef.current=false; setPlaying(false);
  }
  function constrainSeek(video: HTMLVideoElement, clip: MovieClip) {
    const time = Math.min(endFor(video, clip), Math.max(clip.inPoint, video.currentTime));
    if (Math.abs(time - video.currentTime) > .001) video.currentTime=time;
  }
  function startCut() {
    if (playingRef.current) {stop(); return;}
    if (!clips.length) return;
    setSelected(0);
    const video = videoRef.current;
    if (current?.id === clips[0].id && video) video.currentTime=clips[0].inPoint;
    playingRef.current=true; setPlaying(true);
  }
  function select(index: number) {stop(); setSelected(index); setError('');}
  function add(take: FilmTake) { if (clips.length >= 24) return; onChange([...clips,{id:uid(),jobId:take.job.id,outputIndex:take.outputIndex,inPoint:0,...(take.duration ? {outPoint:take.duration} : {})}]); select(clips.length); }
  function reorder(index: number, delta: number) {const target=index+delta; if (target<0 || target>=clips.length) return; const next=[...clips]; [next[index],next[target]]=[next[target],next[index]]; onChange(next); select(target);}
  function trim(key: 'inPoint' | 'outPoint', raw: string) {
    if (!current) return; const value=Number(raw); if (!Number.isFinite(value)) return;
    const max=currentTake?.duration || 3600;
    const safe=key==='inPoint' ? Math.max(0,Math.min(value,Math.min(current.outPoint ?? max,max)-.1)) : Math.min(max,Math.max(value,current.inPoint+.1));
    const trimmed = {...current,[key]:Number(safe.toFixed(3))};
    stop(); onChange(clips.map(c => c.id===current.id ? trimmed : c)); setError('');
    if (videoRef.current) videoRef.current.currentTime = Math.min(trimmed.inPoint, max);
  }
  async function exportMovie() {if(problem) return; stop(); setBusy(true); setError(''); try {await onExport(clips);} catch(e) {setError(e instanceof Error ? e.message : 'Could not export the film.');} finally {setBusy(false);}}
  function buildSceneCut() {
    const next = project.shots.flatMap(shot => {const take=projectTakes.find(t => t.job.shotId === shot.id && t.job.kind !== 'movie'); return take ? [{id:uid(),jobId:take.job.id,outputIndex:take.outputIndex,inPoint:0,...(take.duration ? {outPoint:take.duration} : {})}] : [];});
    if (!next.length) {setError('Render a scene first, then assemble its latest take.'); return;}
    onChange(next); select(0); setError('');
  }
  return <div className="movie-editor">
    <div className="library-toolbar"><div><h2>Make the cut</h2><p>Choose takes, find the rhythm, export one film.</p></div><span className="cut-total">{clips.length} clips · {total.toFixed(1)}s</span></div>
    <div className="cut-viewer"><div className="cut-preview">{currentTake && current ? <video key={current.id} ref={videoRef} controls playsInline preload="metadata" src={currentTake.job.outputs[currentTake.outputIndex].url}
      onLoadedMetadata={e => {
        const video=e.currentTarget;
        if (Number.isFinite(video.duration) && video.duration>0) {
          const key=`${currentTake.job.id}:${currentTake.outputIndex}`;
          setMediaDurations(previous => previous[key]===video.duration ? previous : {...previous,[key]:video.duration});
        }
        video.currentTime=Math.min(current.inPoint,Number.isFinite(video.duration)?video.duration:current.inPoint);
        if (playingRef.current) void video.play().catch(() => {if(video===videoRef.current) stop();});
      }}
      onPlay={e => nativePlay(e.currentTarget,current)} onPause={e => nativePause(e.currentTarget,current)}
      onSeeking={e => constrainSeek(e.currentTarget,current)}
      onTimeUpdate={e => {if(e.currentTarget.currentTime>=endFor(e.currentTarget,current)-.001) next(e.currentTarget,current);}}
      onEnded={e => next(e.currentTarget,current)}
      onError={() => {stop(); setError('This take could not be played. Check its file on the render shelf or choose another take.');}}
    /> : <div className="cut-empty"><Clapperboard size={34} /><h3>{current ? 'This take is unavailable.' : 'Every story starts with a first cut.'}</h3><p>{current ? 'The render may have been removed. Choose another take or remove this clip.' : 'Add a completed render, or assemble the latest take of each scene.'}</p><button className="button" onClick={onRenders}><Film size={14} /> Open render shelf</button></div>}</div>
    <div className="cut-controls"><button className="button" disabled={!clips.length || missing || invalidClip>=0} onClick={startCut}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause cut' : 'Play cut'}</button><button className="button subtle" onClick={buildSceneCut} disabled={busy}><Clapperboard size={14} /> Assemble scenes</button></div>
    </div><div className="cut-assembly"><div className="cut-add"><label><span className="sr-only">Choose a take</span><select value={chosenTake ? takeKey : ''} onChange={e => setTakeKey(e.target.value)}><option value="">Choose a finished take…</option>{projectTakes.map(t => <option key={`${t.job.id}:${t.outputIndex}`} value={`${t.job.id}:${t.outputIndex}`}>{jobTitle(t.job)} · {t.duration.toFixed(1)}s{t.job.kind==='movie'?' · Film':''}</option>)}</select></label><button className="button" disabled={!chosenTake || clips.length>=24} onClick={() => {if(chosenTake) add(chosenTake);}}><Plus size={15} /> Add take</button></div>
    <ol className="cut-timeline">{clips.map((clip,index) => {const take=takes.find(t => t.job.id===clip.jobId && t.outputIndex===clip.outputIndex); return <li key={clip.id} className={current?.id===clip.id?'selected':''}><button className="cut-select" onClick={() => select(index)}><span className="cut-index">{String(index+1).padStart(2,'0')}</span><span><strong>{take ? jobTitle(take.job) : 'Missing take'}</strong><small>{clip.inPoint.toFixed(1)}s → {(clip.outPoint ?? take?.duration ?? 0).toFixed(1)}s</small></span><span>{durationFor(clip).toFixed(1)}s</span></button><div className="cut-item-tools"><button className="icon-button" aria-label={`Move clip ${index+1} earlier`} disabled={index===0} onClick={() => reorder(index,-1)}><ArrowUp size={14} /></button><button className="icon-button" aria-label={`Move clip ${index+1} later`} disabled={index===clips.length-1} onClick={() => reorder(index,1)}><ArrowDown size={14} /></button><button className="icon-button danger" aria-label={`Remove clip ${index+1}`} onClick={() => {onChange(clips.filter(c => c.id!==clip.id)); select(Math.max(0,index-1));}}><Trash2 size={14} /></button></div></li>;})}</ol>
    {current && currentTake && <div className="trim-fields"><span>Trim selected take</span><label>In (seconds)<input aria-label="Clip in point" type="number" step="0.1" min="0" max={Math.max(0,(current.outPoint ?? currentTake.duration)-.1) || undefined} value={current.inPoint} onChange={e => trim('inPoint',e.target.value)} /></label><label>Out (seconds)<input aria-label="Clip out point" type="number" step="0.1" min={current.inPoint+.1} max={currentTake.duration || undefined} value={current.outPoint ?? currentTake.duration} onChange={e => trim('outPoint',e.target.value)} /></label></div>}
    {(error || problem) && <p className="error-message" role="alert">{error || problem}</p>}
    </div><div className="cut-export"><p>MP4 · 24 fps · Silent film · Up to 5 minutes<br /><span>Your edit stays in this project. The export appears on your render shelf.</span></p><button className="button primary" disabled={busy || !clips.length || !!problem} onClick={() => void exportMovie()}><Download size={15} />{busy?'Starting export…':'Export film'}</button></div>
  </div>;
}
