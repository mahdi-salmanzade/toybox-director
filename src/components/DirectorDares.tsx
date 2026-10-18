import { useState } from 'react';
import { Copy } from 'lucide-react';
import { directorDares } from '../lib/director-dares';
import type { DareId } from '../lib/director-dares';
import type { Shot } from '../lib/project';
import './DirectorDares.css';

export function DirectorDares({shot, disabled, atSceneLimit = false, onCreate}: {shot: Shot; disabled: boolean; atSceneLimit?: boolean; onCreate: (id: DareId) => void}) {
  const [choice, setChoice] = useState<DareId>('scenery-leads');
  const chosen = directorDares.find(item => item.id === choice)!;
  const rule = shot.props.length >= chosen.minimumProps ? chosen : directorDares[2];
  const hasPhotos = shot.frames.some(frame => frame.image);
  return <section className="inspector-section director-dares" aria-labelledby="dares-heading">
    <div className="field-heading"><h2 id="dares-heading">Director’s dares</h2></div>
    <p className="section-description">One rule. A different film.</p>
    <label className="field"><span>Choose a creative rule</span><select value={rule.id} disabled={disabled} onChange={event => setChoice(event.target.value as DareId)}>
      {directorDares.map(item => <option key={item.id} value={item.id} disabled={shot.props.length < item.minimumProps}>{item.title}</option>)}
    </select></label>
    <p className="dare-question">{rule.description}</p>
    <p className="dare-change">{rule.change}</p>
    <p className="dare-lead">Lead: <strong>{shot.props[0].name || 'First prop'}</strong></p>
    <button className="button full-width" disabled={disabled} onClick={() => onCreate(rule.id)} aria-label={`Make a new take: ${rule.title}`}><Copy size={14} /> Make a new take</button>
    <p className="dare-footnote">Your original stays. {hasPhotos ? 'The new take uses the miniature stage; your photos stay in the original.' : 'Every prop and pose stays editable.'}{atSceneLimit && ' A project holds up to 12 scenes.'}</p>
  </section>;
}
