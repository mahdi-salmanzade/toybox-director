import { uid } from './project.ts';
import type { Pose, Project, PropKind, Shot, StageProp, WorldId } from './project.ts';

export type StorySparkId = 'city-crosses-first' | 'doorway-looking-for-home' | 'last-tree-parade';
export type StorySpark = {
  id: StorySparkId;
  title: string;
  premise: string;
  rule: string;
  world: WorldId;
  cast: string[];
  beats: [string, string, string];
};

export const storySparks: StorySpark[] = [
  {
    id: 'city-crosses-first', title: 'The city crosses first', world: 'noir',
    premise: 'A patient car discovers that the buildings have somewhere to be.',
    rule: 'Keep the car still. Give the city the right of way.',
    cast: ['One patient car', 'Three commuting towers'],
    beats: ['The street wakes up', 'The buildings cross', 'A little one is late'],
  },
  {
    id: 'doorway-looking-for-home', title: 'A door looking for a home', world: 'desert',
    premise: 'A wandering doorway tries the whole desert before finding one tree worth framing.',
    rule: 'Let the doorway do the searching. Leave the tree where it is.',
    cast: ['A wandering gateway', 'A lonely tree', 'Two unhelpful rocks'],
    beats: ['No address', 'The wrong room', 'Home has no walls'],
  },
  {
    id: 'last-tree-parade', title: 'A parade for the last tree', world: 'lunar',
    premise: 'A rover and a few moon rocks make a place of honor for the smallest tree on the moon.',
    rule: 'Make room for the smallest thing. Let nobody travel alone.',
    cast: ['The guest of honor', 'A little rover', 'Two moon rocks', 'A quiet tower'],
    beats: ['Someone arrives', 'A space is made', 'Nobody walks alone'],
  },
];

type Point = readonly [x: number, z: number, rotation?: number];
type Blocking = readonly [Point, Point, Point];
type CastMember = Omit<StageProp, 'id'> & { blocking: Blocking };
type SceneScore = {
  name: string; note: string; camera: Shot['camera']; prompt: string;
  labels: [string, string, string]; cast: CastMember[];
};

const still = (x: number, z: number, rotation = 0): Blocking => [[x, z, rotation], [x, z, rotation], [x, z, rotation]];
const member = (kind: PropKind, name: string, role: string, color: string, scale: number, blocking: Blocking): CastMember =>
  ({ kind, name, role, color, scale, blocking });

function cityScores(): SceneScore[] {
  const car = () => member('car', 'The patient car', 'A small red car waiting politely while buildings cross its road', '#cf5547', .8, still(-3.6, 2.4));
  const commuter = (name: string, scale: number, blocking: Blocking) => member('mug', name, 'A brutalist office tower commuting across the street on its own', '#8c9fa6', scale, blocking);
  const latecomer = (blocking: Blocking) => member('mug', 'The little latecomer', 'A small office building hurrying to catch up with the taller buildings', '#b3b2a7', .46, blocking);
  return [
    {
      name: 'Rush hour, reversed', note: 'The car has stopped. The skyline has not.', camera: 'wide',
      prompt: 'A locked wide shot of a rainy miniature city at night. A small red car waits at the left of the road. Two upright brutalist office towers begin gliding slowly from the far pavement toward the road, as if they are commuters. Keep the car patiently stationary. Let the strange movement unfold with dry, everyday calm; no camera move, no destruction.',
      labels: ['A normal stop', 'The skyline stirs', 'Buildings have places to be'],
      cast: [car(), commuter('The early commuter', 1.05, [[-1, -2.7], [-1, -1], [-1, .7]]), commuter('The second commuter', .86, [[1.3, -3.2], [1.3, -2.1], [1.3, -.8]]), latecomer(still(3.2, -3.1))],
    },
    {
      name: 'Pedestrians, twenty floors tall', note: 'At this crossing, the buildings have priority.', camera: 'overhead',
      prompt: 'An overhead shot of a miniature city crossing at night. A red car waits at the left, staying in place. Two office towers glide upright across the road in a staggered procession, leaving polite space between them. Their movement should feel as unremarkable as people crossing a street. Keep the overhead camera still and the buildings intact.',
      labels: ['First building', 'Mind the gap', 'Second building'],
      cast: [car(), commuter('The early commuter', 1.05, [[-1, .7], [-1, 1.85], [-1, 3]]), commuter('The second commuter', .86, [[1.3, -.8], [1.3, .5], [1.3, 1.8]]), latecomer(still(3.2, -3.1))],
    },
    {
      name: 'One last commuter', note: 'Just as the way clears, a little building is late.', camera: 'low',
      prompt: 'A low, locked shot of the same rain-soaked miniature city. A small red car remains patiently stopped. The tall commuting buildings have nearly crossed. A much smaller office building now hurries diagonally from the far pavement into the opening to catch up with them. The car waits one beat longer. Play the late arrival as quiet visual comedy, with no collision or destruction.',
      labels: ['Almost clear', 'Wait for me', 'The car can wait'],
      cast: [car(), commuter('The early commuter', 1.05, still(-1, 3)), commuter('The second commuter', .86, [[1.3, 1.8], [1.3, 2.5], [1.3, 3.2]]), latecomer([[3.2, -3.1], [1.9, -.9], [.6, 1.4]])],
    },
  ];
}

function doorwayScores(): SceneScore[] {
  const cast = (blocking: Blocking): CastMember[] => [
    member('arch', 'The wandering doorway', 'A freestanding sandstone gateway searching for something worth framing', '#c79d75', 1.04, blocking),
    member('tree', 'The lonely tree', 'A small desert tree, quietly waiting in the open', '#899078', .7, still(2, -.8)),
    member('sphere', 'The wrong room', 'A broad weathered desert boulder, an unpromising place for a doorway', '#cba67e', 1.05, still(-2.5, -1.1)),
    member('sphere', 'A distant pebble', 'A small warm sandstone rock in the distance', '#be936b', .45, still(4, -2.3)),
  ];
  return [
    {
      name: 'A door without an address', note: 'A doorway wanders through a place with no walls.', camera: 'wide',
      prompt: 'A locked wide shot in a warm sandstone desert. A freestanding stone gateway glides gently across the ground by itself, searching for a home. A small tree waits farther to the right and two rocks stay still. The gateway remains upright and solid. Give its slow search a curious, slightly uncertain rhythm, like a character looking for its place.',
      labels: ['No address', 'Try over here', 'Still searching'],
      cast: cast([[-3.6, 1.6], [-2.7, .9, -.2], [-1.8, .2, -.3]]),
    },
    {
      name: 'The wrong room', note: 'A rock makes a very disappointing view.', camera: 'overhead',
      prompt: 'An overhead miniature desert shot. A wandering sandstone gateway approaches a broad boulder, turns to inspect it, then changes its mind and glides away toward the small tree on the other side. The rocks and tree stay still. Treat the doorway as a curious character; keep the structure intact and the camera locked. The turn away from the rock is the small joke.',
      labels: ['Perhaps this rock', 'Not much of a room', 'Something else is growing'],
      cast: cast([[-1.8, .2, -.3], [-1.8, -1.2, Math.PI / 2], [.3, -1.2]]),
    },
    {
      name: 'Home has no walls', note: 'It only needed one good thing to frame.', camera: 'low',
      prompt: 'A low, locked shot of a small tree in a quiet golden desert. A freestanding sandstone gateway glides gently into the foreground and settles in front of the tree, framing it through its opening. The tree remains rooted in place. Let the gateway make a small final adjustment, then come to rest. End on the simple sight of a doorway and a tree: a home without any walls.',
      labels: ['There you are', 'A little to the left', 'Home'],
      cast: cast([[.3, -1.2], [1.7, .3, .1], [2.75, .2]]),
    },
  ];
}

function paradeScores(): SceneScore[] {
  const cast = (tree: Blocking, rover: Blocking, left: Blocking, right: Blocking, tower: Blocking): CastMember[] => [
    member('tree', 'The guest of honor', 'A small lone lunar tree, the guest of honor in a gentle procession', '#b1a0c3', .8, tree),
    member('car', 'The little escort', 'A tiny coral-colored lunar rover making room for the tree', '#df917d', .55, rover),
    member('sphere', 'The left companion', 'A rounded moon boulder moving carefully beside the tree', '#aaa1b6', .55, left),
    member('sphere', 'The right companion', 'A slightly larger moon boulder joining the quiet procession', '#c1b6c9', .66, right),
    member('mug', 'The quiet witness', 'A small pale lunar tower joining the procession from behind', '#d1c9d6', .65, tower),
  ];
  return [
    {
      name: 'An invitation, quietly', note: 'The smallest tree on the moon gets a visitor.', camera: 'wide',
      prompt: 'A wide, locked miniature lunar landscape beneath a pink moon. A small tree stands alone near the center. A tiny coral rover approaches slowly from the left, while two rounded moon boulders begin drawing closer at a respectful distance. A pale tower waits behind them. Keep the tree upright and still. This is an invitation, tender and unhurried, with no danger.',
      labels: ['A tree alone', 'A visitor slows down', 'Company'],
      cast: cast(still(0, 0), [[-4.3, 1.3], [-3.3, 1.3], [-2.2, 1.3]], [[-3.2, -2], [-2.4, -1.5], [-1.5, -1]], [[3.3, -2.4], [2.8, -2], [2.4, -1.6]], still(1.2, -2.6)),
    },
    {
      name: 'A place of honor', note: 'The procession leaves its best space for the tree.', camera: 'overhead',
      prompt: 'A locked overhead shot of a little lunar gathering. A small tree stays in the middle. A coral rover, two moon boulders and a pale tower carefully rearrange themselves around it, leaving a generous space at the center. Each companion yields room instead of crowding the tree. Make the motion a soft, deliberate ceremony. The tree is the guest of honor.',
      labels: ['Make some room', 'A little more space', 'For you'],
      cast: cast(still(0, 0), [[-2.2, 1.3], [-1.8, 1.7], [-1.4, 2.1]], [[-1.5, -1], [-1.7, -.8], [-2, 0]], [[2.4, -1.6], [2, -.9], [2, .1]], [[1.2, -2.6], [.5, -2.2], [0, -2.1]]),
    },
    {
      name: 'Nobody walks alone', note: 'Even the moon knows how to give someone a parade.', camera: 'low',
      prompt: 'A low, locked view of an impossible but gentle lunar procession. A small upright tree, a tiny coral rover, two rounded moon boulders and one pale tower drift together slowly toward the right. The companions keep their places around the tree, with comfortable space between them. The tree moves with the group instead of being left behind. Keep their shapes intact; end on a feeling of quiet belonging.',
      labels: ['All together', 'At the tree’s pace', 'Nobody left behind'],
      cast: cast([[0, 0], [.65, -.3], [1.3, -.6]], [[-1.4, 2.1], [-.75, 1.8], [-.1, 1.5]], [[-2, 0], [-1.35, -.3], [-.7, -.6]], [[2, .1], [2.65, -.2], [3.3, -.5]], [[0, -2.1], [.65, -2.4], [1.3, -2.7]]),
    },
  ];
}

const scores: Record<StorySparkId, () => SceneScore[]> = {
  'city-crosses-first': cityScores,
  'doorway-looking-for-home': doorwayScores,
  'last-tree-parade': paradeScores,
};

/** Author the preview and each shot's opening image; later poses remain model direction. */
export function makeStoryProject(id: StorySparkId): Project {
  const spark = storySparks.find(item => item.id === id);
  if (!spark) throw new Error('Choose one of the available story sparks.');
  const shots: Shot[] = scores[id]().map((score, sceneIndex) => {
    const props: StageProp[] = score.cast.map(({ blocking: _blocking, ...prop }) => ({ ...prop, id: uid() }));
    return {
      id: uid(), name: score.name, note: score.note, world: spark.world, props,
      camera: score.camera, cameraMove: 'static', reveal: false, duration: 3, seed: 1701 + sceneIndex, prompt: score.prompt,
      frames: score.labels.map((label, frameIndex) => ({
        id: uid(), label,
        poses: Object.fromEntries(props.map((prop, propIndex): [string, Pose] => {
          const [x, z, rotation = 0] = score.cast[propIndex].blocking[frameIndex];
          return [prop.id, { x, z, rotation }];
        })),
      })),
    };
  });
  return { version: 1, id: uid(), name: spark.title, shots, activeShotId: shots[0].id };
}
