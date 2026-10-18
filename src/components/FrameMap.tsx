import type { Frame, Shot } from '../lib/project';

export function FrameMap({ shot, frame }: {shot: Shot; frame: Frame}) {
  if (frame.image) return <img src={frame.image} alt="Uploaded keyframe" />;
  return <svg className="frame-map" viewBox="0 0 200 110" aria-label="Top-down staging diagram"><rect width="200" height="110" fill="#e6e2d8" /><path d="M0 27.5H200M0 55H200M0 82.5H200M50 0V110M100 0V110M150 0V110" fill="none" stroke="#d5d0c5" strokeWidth=".5" />
    <path d={shot.frames.map((f, i) => {const p = f.poses[shot.props[0].id]; return `${i ? 'L' : 'M'}${100 + p.x * 13} ${55 + p.z * 11}`;}).join(' ')} stroke="#c27f63" strokeWidth="1" strokeDasharray="3 3" fill="none" />
    {shot.props.map(p => {const pose = frame.poses[p.id]; return <g key={p.id} transform={`translate(${100 + pose.x * 13}, ${55 + pose.z * 11}) rotate(${-pose.rotation * 180 / Math.PI}) scale(${p.scale})`}>{p.kind === 'car' ? <><rect x="-12" y="-6" width="24" height="12" rx="4" fill={p.color} /><rect x="-4" y="-5" width="8" height="10" rx="2" fill="#5c6663" /></> : p.kind === 'arch' ? <rect x="-12" y="-5" width="24" height="10" rx="2" fill={p.color} stroke="#a49e92" /> : <><circle r="11" fill={p.color} stroke="#ada79b" strokeWidth="1" />{p.kind === 'mug' && <circle r="7" fill="#83725e" />}</>}</g>;})}
  </svg>;
}
