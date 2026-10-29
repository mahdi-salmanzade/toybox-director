import { cloneShot } from './project.ts';
import type { Shot } from './project.ts';

export type DareId = 'scenery-leads' | 'scale-swap' | 'close-loop';
export const directorDares: {id: DareId; title: string; description: string; change: string; minimumProps: number}[] = [
  {id: 'scenery-leads', title: 'Let the scenery lead', description: 'What if the city did the chasing?', change: 'Hold the lead still. Move the surrounding set across all three frames.', minimumProps: 2},
  {id: 'scale-swap', title: 'Make the little thing enormous', description: 'Give your lead a towering entrance.', change: 'Enlarge the lead, shrink its surroundings, and lower the camera.', minimumProps: 2},
  {id: 'close-loop', title: 'Close the loop', description: 'Everything returns. What happened in between?', change: 'Match the final pose to the opening. Keep a detour in the middle.', minimumProps: 1},
];

const clamp = (value: number, bound: number) => Math.max(-bound, Math.min(bound, value));

/** Each dare is an editable stage take; original poses, photos and IDs stay untouched. */
export function makeDareShot(source: Shot, id: DareId): Shot {
  const dare = directorDares.find(item => item.id === id);
  if (!dare) throw new Error('Choose one of the available director’s dares.');
  if (source.props.length < dare.minimumProps) throw new Error('Add a second prop to try this rule.');
  const shot = cloneShot(source);
  const lead = shot.props[0];
  const leadName = lead.name || 'the lead prop';
  shot.frames.forEach(frame => { delete frame.image; });
  // Each dare stages a beginning, middle, and end.
  const last = shot.frames.length - 1;
  shot.frames = [shot.frames[0], shot.frames[Math.round(last / 2)], shot.frames[last]];
  shot.name = `${source.name || 'Untitled scene'} — ${dare.title}`.slice(0, 90);
  shot.note = `${dare.title}. ${dare.change}`.slice(0, 180);
  let direction: string;

  if (id === 'scenery-leads') {
    shot.camera = 'wide'; shot.cameraMove = 'static';
    const first = shot.frames[0].poses;
    shot.frames = shot.frames.map((frame, index) => ({...frame,
      label: ['Hold the lead', 'The set slips', 'Still standing'][index],
      poses: Object.fromEntries(shot.props.map((prop, propIndex) => {
        const pose = first[prop.id];
        if (propIndex === 0) return [prop.id, {...pose}];
        const travel = pose.x >= 0 ? -2.4 : 2.4;
        return [prop.id, {...pose, x: clamp(pose.x + travel * index / 2, 5.5), z: clamp(pose.z, 3.6)}];
      })),
    }));
    direction = `A deadpan impossible chase. Keep ${leadName} completely still as the surrounding structures glide across the frame. Locked wide camera. Let a large moving background pass a small motionless foreground subject. This movement rule takes precedence over movement in the original premise.`;
  } else if (id === 'scale-swap') {
    shot.camera = 'low';
    shot.props = shot.props.map((prop, index) => ({...prop, scale: index === 0 ? 2.2 : .45,
      role: `${index === 0 ? 'An enormous version of' : 'A miniature version of'} ${prop.role || prop.name}`.slice(0, 500),
    }));
    direction = `Reverse the scale hierarchy: ${leadName} is enormous, and every surrounding object is miniature. Use a low camera to make this reversal legible. Keep the staged layout and let the size difference carry the surprise. Treat this scale rule as the central visual idea.`;
  } else {
    shot.cameraMove = 'static';
    shot.frames[2].poses = structuredClone(shot.frames[0].poses);
    const start = shot.frames[0].poses[lead.id];
    const middle = shot.frames[1].poses[lead.id];
    if (Math.hypot(start.x - middle.x, start.z - middle.z) < .2) {
      middle.x = clamp(start.x + (start.x >= 0 ? -2 : 2), 5.5);
      middle.z = clamp(start.z + (start.z >= 0 ? -.7 : .7), 3.6);
    }
    shot.frames.forEach((frame, index) => {frame.label = ['The ordinary', 'The detour', 'Back again'][index];});
    direction = `A small visual ritual: ${leadName} takes a curious detour, then the entire arrangement returns to its opening position. Keep the camera still. Seek an ending that can meet the beginning in an edit. The local stage poses form the loop; generated motion may need trimming.`;
  }
  const prefix = `DIRECTOR'S DARE: ${direction}\n\nOriginal setting and premise:\n`;
  shot.prompt = prefix + source.prompt.slice(0, Math.max(0, 4000 - prefix.length));
  return shot;
}
