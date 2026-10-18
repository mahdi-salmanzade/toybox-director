import { useState } from 'react';
import { ArrowRight, Clapperboard, LoaderCircle } from 'lucide-react';
import { makeStoryProject, storySparks } from '../lib/story-sparks';
import type { StorySparkId } from '../lib/story-sparks';
import { FrameMap } from './FrameMap';
import './StorySparks.css';

export function StorySparks({ busy, onStart, onBack }: { busy: boolean; onStart: (id: StorySparkId) => Promise<void>; onBack: () => void }) {
  const [previews] = useState(() => storySparks.map(spark => makeStoryProject(spark.id)));
  const [starting, setStarting] = useState<StorySparkId | null>(null);
  async function start(id: StorySparkId) {
    if (busy || starting) return;
    setStarting(id);
    try { await onStart(id); }
    finally { setStarting(null); }
  }
  return <section className="story-sparks" aria-labelledby="story-sparks-title">
    <div className="story-sparks-heading">
      <div><h1 id="story-sparks-title">Give an ordinary object an impossible job.</h1><p>Three short films to take apart and make your own.</p></div>
      <button className="button" onClick={onBack} disabled={busy || !!starting}><Clapperboard size={15} /> Back to your stage</button>
    </div>
    <div className="story-sparks-shelf">{storySparks.map((spark, index) => <article className="story-spark" key={spark.id} aria-labelledby={`spark-${spark.id}`}>
      <div className="story-spark-direction">
        <h2 id={`spark-${spark.id}`}>{spark.title}</h2>
        <p className="story-spark-premise">{spark.premise}</p>
        <dl className="story-spark-notes"><div><dt>The cast</dt><dd>{spark.cast.join(' · ')}</dd></div><div><dt>The creative rule</dt><dd>{spark.rule}</dd></div></dl>
        <button className="button primary" aria-label={`Start this film: ${spark.title}`} disabled={busy || !!starting} onClick={() => void start(spark.id)}>{starting === spark.id ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />} Start this film</button>
      </div>
      <ol className="story-spark-beats" aria-label={`${spark.title}: three scenes`}>{previews[index].shots.map((shot, beatIndex) => <li key={shot.id}>
        <figure><div className="story-spark-plan"><FrameMap shot={shot} frame={shot.frames[0]} /></div><figcaption><span className="story-spark-beat-number">{beatIndex + 1}</span><div><h3>{spark.beats[beatIndex]}</h3><p>{shot.camera === 'overhead' ? 'Overhead' : shot.camera === 'low' ? 'Low angle' : 'Wide angle'} · {shot.duration}s preview</p></div></figcaption></figure>
      </li>)}</ol>
    </article>)}</div>
    <p className="story-sparks-footnote">Editable stage plans. All three keyframes guide the generated video.</p>
  </section>;
}
