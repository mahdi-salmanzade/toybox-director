import { RoundedBox } from '@react-three/drei';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { StageProp, WorldId } from '../lib/project';

const palettes = {
  desert: { ground: '#cfa879', sky: '#d5b394', horizon: '#ecd1ae', zenith: '#b7c5c1', road: '#9e8063', edge: '#d7b78f', rock: '#b98960', shadow: '#806d64' },
  lunar: { ground: '#bab5c5', sky: '#34334f', horizon: '#82718e', zenith: '#171d36', road: '#8a899f', edge: '#b7a5bd', rock: '#c5c2cb', shadow: '#68647f' },
  noir: { ground: '#172b32', sky: '#0c1c29', horizon: '#24434d', zenith: '#06101d', road: '#12232b', edge: '#34484b', rock: '#293c44', shadow: '#10242e' },
} satisfies Record<WorldId, Record<string, string>>;

function seedFor(text: string) {
  let seed = 17;
  for (let index = 0; index < text.length; index++) seed = (seed * 31 + text.charCodeAt(index)) >>> 0;
  return (seed % 1000) / 97;
}

function Sandstone({ seed = 1, color = '#b98960' }: { seed?: number; color?: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.CylinderGeometry(.57, .82, 2.64, 9, 14, false);
    const positions = shape.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const base = new THREE.Color(color);
    const tint = new THREE.Color();
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const height = (y + 1.32) / 2.64;
      const angle = Math.atan2(z, x);
      const layer = Math.floor(height * 14);
      const erosion = 1 + Math.sin(layer * 1.7 + seed) * .085 + Math.sin(angle * 3 + seed) * .075;
      positions.setXYZ(index, x * erosion + Math.sin(height * 7 + seed) * .045, y, z * erosion);
      const brightness = .86 + Math.sin(layer * 1.35 + seed) * .085 + height * .18;
      tint.copy(base).multiplyScalar(brightness);
      tint.toArray(colors, index * 3);
    }
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    shape.computeVertexNormals();
    return shape;
  }, [seed, color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} position={[0, 1.32, 0]} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.94} flatShading /></mesh>
    <mesh position={[.42, .19, .45]} rotation={[.15, .6 + seed, .12]} scale={[.7, .45, .65]} castShadow receiveShadow><dodecahedronGeometry args={[.57, 0]} /><meshStandardMaterial color={color} roughness={1} flatShading /></mesh>
    <mesh position={[-.56, .11, -.18]} rotation={[.2, seed, .3]} scale={[.6, .3, .5]} castShadow><dodecahedronGeometry args={[.52, 0]} /><meshStandardMaterial color="#bc956f" roughness={1} flatShading /></mesh>
  </group>;
}

function LunarTower({ seed = 1 }: { seed?: number }) {
  return <group>
    <mesh position={[0, .075, 0]} castShadow receiveShadow><cylinderGeometry args={[.8, .88, .15, 32]} /><meshStandardMaterial color="#a49dab" roughness={.85} /></mesh>
    <mesh position={[0, 1.2, 0]} castShadow receiveShadow><cylinderGeometry args={[.62, .69, 2.25, 32]} /><meshStandardMaterial color="#d0cbd1" roughness={.72} metalness={.08} /></mesh>
    {[.3, 1.65, 2.24].map((height, index) => <mesh key={height} position={[0, height, 0]} castShadow><cylinderGeometry args={[index === 2 ? .7 : .69, .7, index === 1 ? .045 : .12, 32]} /><meshStandardMaterial color={index === 1 ? '#79788d' : '#b6b0bf'} roughness={.65} /></mesh>)}
    <mesh position={[0, 2.34, 0]}><cylinderGeometry args={[.54, .61, .12, 32]} /><meshStandardMaterial color="#e0d8de" roughness={.8} /></mesh>
    <mesh position={[0, 2.52, 0]} castShadow><cylinderGeometry args={[.025, .035, .27, 8]} /><meshStandardMaterial color="#7d7d91" metalness={.5} roughness={.3} /></mesh>
    <mesh position={[0, 2.68, 0]}><sphereGeometry args={[.045, 12, 8]} /><meshStandardMaterial color="#f6baaa" emissive="#e98e88" emissiveIntensity={1.3} /></mesh>
    {[0, 1, 2, 3].map(index => <group key={index} rotation={[0, index * Math.PI / 2 + seed * .04, 0]}>
      <mesh position={[0, 1.12, .674]}><boxGeometry args={[.105, .42, .025]} /><meshStandardMaterial color="#6c778b" metalness={.45} roughness={.22} /></mesh>
      <mesh position={[0, 1.12, .69]}><boxGeometry args={[.055, .3, .015]} /><meshStandardMaterial color="#e0e4ff" emissive="#a7c2f4" emissiveIntensity={.65} /></mesh>
    </group>)}
    <RoundedBox args={[.38, .38, .34]} radius={.045} smoothness={2} position={[.55, .23, .3]} castShadow><meshStandardMaterial color="#aea9b6" roughness={.7} /></RoundedBox>
  </group>;
}

function Windows({ seed = 1, color = '#e2b77b' }: { seed?: number; color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    const object = new THREE.Object3D();
    for (let side = 0; side < 4; side++) for (let floor = 0; floor < 7; floor++) for (let column = 0; column < 3; column++) {
      if ((floor * 7 + column * 3 + side * 2 + Math.floor(seed)) % 5 === 0) continue;
      const offset = (column - 1) * .27;
      const height = .35 + floor * .28;
      if (side === 0) object.position.set(offset, height, .496);
      if (side === 1) object.position.set(.566, height, offset);
      if (side === 2) object.position.set(-offset, height, -.496);
      if (side === 3) object.position.set(-.566, height, -offset);
      object.rotation.set(0, side * Math.PI / 2, 0);
      object.updateMatrix(); matrices.push(object.matrix.clone());
    }
    return matrices;
  }, [seed]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    placements.forEach((matrix, index) => ref.current!.setMatrixAt(index, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [placements]);
  return <instancedMesh ref={ref} args={[undefined, undefined, placements.length]}>
    <planeGeometry args={[.115, .145]} />
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.25} roughness={.4} />
  </instancedMesh>;
}

function NoirTower({ seed = 1 }: { seed?: number }) {
  return <group>
    <RoundedBox args={[1.12, 2.4, .98]} radius={.045} smoothness={2} position={[0, 1.2, 0]} castShadow receiveShadow><meshStandardMaterial color="#263e46" roughness={.47} metalness={.28} /></RoundedBox>
    <mesh position={[0, .09, 0]} receiveShadow><boxGeometry args={[1.3, .18, 1.16]} /><meshStandardMaterial color="#33464a" roughness={.55} /></mesh>
    <Windows seed={seed} color={Math.floor(seed) % 2 ? '#d9b18a' : '#91c4cc'} />
    {[-.39, .39].map(x => <mesh key={x} position={[x, 1.27, .501]}><boxGeometry args={[.034, 2.18, .025]} /><meshStandardMaterial color="#526b70" roughness={.42} metalness={.35} /></mesh>)}
    <mesh position={[0, 2.42, 0]} castShadow><boxGeometry args={[1.22, .13, 1.07]} /><meshStandardMaterial color="#3e5157" roughness={.6} /></mesh>
    <RoundedBox args={[.55, .2, .52]} radius={.025} smoothness={2} position={[.05, 2.57, -.05]} castShadow><meshStandardMaterial color="#20333e" roughness={.55} /></RoundedBox>
    <mesh position={[.575, 1.62, .2]}><boxGeometry args={[.04, .62, .13]} /><meshStandardMaterial color="#c65d57" emissive="#ec7767" emissiveIntensity={1.9} /></mesh>
    <mesh position={[0, .38, .51]}><boxGeometry args={[.25, .6, .035]} /><meshStandardMaterial color="#0d202b" metalness={.45} roughness={.15} /></mesh>
    <mesh position={[0, .72, .54]}><boxGeometry args={[.38, .035, .1]} /><meshStandardMaterial color="#9ed7dc" emissive="#77b6ca" emissiveIntensity={1.6} /></mesh>
  </group>;
}

function Gateway({ world }: { world: WorldId }) {
  if (world === 'desert') return <group>
    {[-1.02, 1.02].map(x => <group key={x} position={[x, 0, 0]}>
      <RoundedBox args={[.48, 1.45, .65]} radius={.08} smoothness={2} position={[0, .725, 0]} castShadow receiveShadow><meshStandardMaterial color="#bd8e65" roughness={.95} /></RoundedBox>
      {[.12, .65, 1.32].map(y => <mesh key={y} position={[0, y, 0]} castShadow><boxGeometry args={[.53, .08, .7]} /><meshStandardMaterial color="#ab7e5b" roughness={1} /></mesh>)}
    </group>)}
    <mesh position={[0, 1.4, 0]} scale={[1, 1.02, 1.25]} castShadow receiveShadow><torusGeometry args={[1.02, .25, 8, 28, Math.PI]} /><meshStandardMaterial color="#c69b74" roughness={.95} flatShading /></mesh>
  </group>;
  const lunar = world === 'lunar';
  return <group>
    {[-.95, .95].map(x => <group key={x} position={[x, 0, 0]}>
      <RoundedBox args={[.36, 2.35, .55]} radius={.055} smoothness={2} position={[0, 1.175, 0]} castShadow receiveShadow><meshStandardMaterial color={lunar ? '#d0c9d3' : '#2b444c'} roughness={lunar ? .65 : .38} metalness={lunar ? .1 : .4} /></RoundedBox>
      <mesh position={[-Math.sign(x) * .185, 1.32, .2]}><boxGeometry args={[.025, 1.7, .045]} /><meshStandardMaterial color={lunar ? '#dfc1c7' : '#98d7dc'} emissive={lunar ? '#f5c2bb' : '#67aebc'} emissiveIntensity={1} /></mesh>
      <mesh position={[0, .1, 0]} castShadow><boxGeometry args={[.62, .2, .77]} /><meshStandardMaterial color={lunar ? '#9b96a8' : '#1e343f'} roughness={.7} /></mesh>
    </group>)}
    <RoundedBox args={[2.3, .35, .55]} radius={.06} smoothness={2} position={[0, 2.35, 0]} castShadow><meshStandardMaterial color={lunar ? '#c4becd' : '#29434b'} roughness={.55} metalness={.2} /></RoundedBox>
    <mesh position={[0, 2.35, .285]}><boxGeometry args={[.7, .07, .02]} /><meshStandardMaterial color={lunar ? '#f6c9bf' : '#dc7970'} emissive={lunar ? '#e8acaa' : '#dd6b63'} emissiveIntensity={1.3} /></mesh>
  </group>;
}

function WorldRock({ world, seed }: { world: WorldId; seed: number }) {
  const lunar = world === 'lunar';
  const craters = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const angle = index * 1.7 + seed;
    const normal = new THREE.Vector3(Math.sin(angle) * .75, .28 + (index % 3) * .22, Math.cos(angle) * .75).normalize();
    return {
      position: [normal.x * .748, .69 + normal.y * .706, normal.z * .748] as [number, number, number],
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
      radius: .075 + (index % 2) * .04,
    };
  }), [seed]);
  return <group>
    <mesh position={[0, lunar ? .69 : .49, 0]} rotation={[.1, seed, .12]} scale={lunar ? [1, .95, 1] : [1.15, .7, .92]} castShadow receiveShadow>
      <icosahedronGeometry args={[.76, lunar ? 2 : 0]} /><meshStandardMaterial color={palettes[world].rock} roughness={.96} flatShading={!lunar} />
    </mesh>
    {lunar && craters.map((crater, index) => <mesh key={index} position={crater.position} quaternion={crater.rotation}><circleGeometry args={[crater.radius, 16]} /><meshStandardMaterial color="#9c93ab" roughness={1} polygonOffset polygonOffsetFactor={-1} /></mesh>)}
  </group>;
}

function WorldTree({ world }: { world: WorldId }) {
  const lunar = world === 'lunar', noir = world === 'noir';
  const bark = lunar ? '#c6bccb' : noir ? '#3e5254' : '#77664f';
  const foliage = lunar ? '#a997bd' : noir ? '#57716b' : '#899078';
  return <group>
    <mesh position={[0, .82, 0]} rotation={[0, 0, -.08]} castShadow><cylinderGeometry args={[.07, .17, 1.65, 8]} /><meshStandardMaterial color={bark} roughness={.92} /></mesh>
    {[-1, 1].map(side => <group key={side} position={[side * .24, 1.46, 0]} rotation={[0, side * .4, -side * .65]}>
      <mesh castShadow><cylinderGeometry args={[.035, .075, .75, 7]} /><meshStandardMaterial color={bark} roughness={.9} /></mesh>
    </group>)}
    {[[0, 1.88, 0, .84], [-.53, 1.73, .08, .55], [.45, 1.8, -.07, .55]].map(([x, y, z, scale], index) => <group key={index} position={[x, y, z]}>
      <mesh scale={[scale, lunar ? .2 : .38, scale * .83]} castShadow receiveShadow><icosahedronGeometry args={[1, lunar ? 2 : 1]} /><meshStandardMaterial color={foliage} roughness={.9} flatShading={!lunar} /></mesh>
      {lunar && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[scale * .72, .018, 6, 32]} /><meshStandardMaterial color="#e1c4d9" emissive="#d5a7d0" emissiveIntensity={.5} /></mesh>}
    </group>)}
  </group>;
}

/** Geometry only; the parent owns each prop's pose, scale, and editing handlers. */
export const WorldProp = memo(function WorldProp({ prop, world }: { prop: StageProp; world: WorldId }) {
  const seed = seedFor(prop.id);
  if (prop.kind === 'car') return null;
  if (prop.kind === 'mug') return world === 'desert' ? <Sandstone seed={seed} /> : world === 'lunar' ? <LunarTower seed={seed} /> : <NoirTower seed={seed} />;
  if (prop.kind === 'arch') return <Gateway world={world} />;
  if (prop.kind === 'tree') return <WorldTree world={world} />;
  return <WorldRock world={world} seed={seed} />;
}, (previous, next) => previous.world === next.world && previous.prop.id === next.prop.id && previous.prop.kind === next.prop.kind && previous.prop.color === next.prop.color);

function makeRoad(width: number, y: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-72, y, 34), new THREE.Vector3(-18, y, 9), new THREE.Vector3(-8, y, 4),
    new THREE.Vector3(-3.6, y, 2.5), new THREE.Vector3(0, y, .8), new THREE.Vector3(3.6, y, -1.6),
    new THREE.Vector3(9, y, -4.8), new THREE.Vector3(23, y, -16), new THREE.Vector3(65, y, -42),
  ], false, 'centripetal');
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= 192; index++) {
    const time = index / 192;
    const center = curve.getPoint(time), tangent = curve.getTangent(time);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    positions.push(center.x - side.x, y, center.z - side.z, center.x + side.x, y, center.z + side.z);
    uvs.push(0, time * 24, 1, time * 24);
    if (index < 192) { const a = index * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return { geometry, curve };
}

function Road({ world }: { world: WorldId }) {
  const ribbon = useMemo(() => makeRoad(1.72, .016), []);
  const shoulder = useMemo(() => makeRoad(2.04, .011), []);
  const markers = useMemo(() => {
    const pieces: { position: THREE.Vector3; rotation: number }[] = [];
    // Fixed distances along the spline avoid accumulating an animation loop.
    for (let distance = .25; distance < .8; distance += .012) {
      const position = ribbon.curve.getPointAt(distance), tangent = ribbon.curve.getTangentAt(distance);
      position.y = .024;
      pieces.push({ position, rotation: Math.atan2(tangent.x, tangent.z) });
    }
    return pieces;
  }, [ribbon]);
  useEffect(() => () => { ribbon.geometry.dispose(); shoulder.geometry.dispose(); }, [ribbon, shoulder]);
  return <group>
    <mesh geometry={shoulder.geometry} receiveShadow><meshStandardMaterial color={palettes[world].edge} roughness={world === 'noir' ? .45 : 1} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={ribbon.geometry} receiveShadow><meshStandardMaterial color={palettes[world].road} roughness={world === 'noir' ? .2 : .92} metalness={world === 'noir' ? .25 : 0} side={THREE.DoubleSide} /></mesh>
    {world === 'noir' && markers.map((marker, index) => <mesh key={index} position={marker.position} rotation={[0, marker.rotation, 0]}><boxGeometry args={[.045, .004, .48]} /><meshStandardMaterial color="#a49d7a" roughness={.52} /></mesh>)}
  </group>;
}

function Ground({ world }: { world: WorldId }) {
  const texture = useMemo(() => {
    const size = 128, pixels = new Uint8Array(size * size * 4);
    const base = new THREE.Color(palettes[world].ground).convertLinearToSRGB();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const noise = ((x * 73 + y * 151 + x * y * 31) % 101) / 101;
      const grain = .94 + noise * .1 + Math.sin(x * .19 + y * .06) * .015;
      pixels[index] = Math.min(255, base.r * grain * 255);
      pixels[index + 1] = Math.min(255, base.g * grain * 255);
      pixels[index + 2] = Math.min(255, base.b * grain * 255);
      pixels[index + 3] = 255;
    }
    const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(32, 32); map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    return map;
  }, [world]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.025, 0]} receiveShadow>
    <planeGeometry args={[220, 220]} /><meshStandardMaterial map={texture} roughness={world === 'noir' ? .28 : .95} metalness={world === 'noir' ? .24 : 0} />
  </mesh>;
}

function Sky({ world }: { world: WorldId }) {
  const uniforms = useMemo(() => ({ horizon: { value: new THREE.Color(palettes[world].horizon) }, zenith: { value: new THREE.Color(palettes[world].zenith) } }), [world]);
  return <mesh renderOrder={-10}>
    <sphereGeometry args={[120, 32, 16]} />
    <shaderMaterial side={THREE.BackSide} depthWrite={false} uniforms={uniforms}
      vertexShader={'varying vec3 skyPosition; void main() { skyPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
      fragmentShader={'uniform vec3 horizon; uniform vec3 zenith; varying vec3 skyPosition; void main() { float altitude = normalize(skyPosition).y; float blend = smoothstep(-0.03, 0.65, altitude); gl_FragColor = vec4(mix(horizon, zenith, blend), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'} />
  </mesh>;
}

function DistantWorld({ world }: { world: WorldId }) {
  if (world === 'desert') return <group>
    {[
      [-12, -7, 4.2, 2.5, 2.9], [-16, -17, 5.2, 3.3, 3.6], [7, -13, 4.2, 2.1, 3],
      [16, -22, 5.3, 3.9, 4], [-26, -30, 7, 4.2, 5], [30, -39, 8, 4.7, 5.5],
    ].map(([x, z, sx, sy, sz], index) => <group key={index} position={[x, 0, z]} scale={[sx, sy, sz]} rotation={[0, index * 1.2, 0]}><Sandstone seed={index * 2.3 + 1} color={index > 2 ? '#c19f81' : '#b78e68'} /></group>)}
    <mesh position={[-20, 13, -48]}><sphereGeometry args={[3.1, 32, 24]} /><meshBasicMaterial color="#ffe3af" fog={false} /></mesh>
  </group>;
  if (world === 'lunar') return <group>
    <mesh position={[-13, 10, -37]} rotation={[.2, 0, -.3]}><sphereGeometry args={[5.1, 40, 32]} /><meshStandardMaterial color="#cc9da8" roughness={1} fog={false} /></mesh>
    <mesh position={[-13, 10, -37]} rotation={[.5, .2, -.4]} scale={[1.7, 1.7, 1.7]}><torusGeometry args={[4.8, .035, 6, 96]} /><meshBasicMaterial color="#b0a5ba" transparent opacity={.45} fog={false} /></mesh>
    {[[-9, -8, 1.7], [-12, -15, 2.6], [10, -14, 2.3], [19, -24, 3.2]].map(([x, z, scale], index) => <group key={index} position={[x, 0, z]} scale={scale}><LunarTower seed={index} /></group>)}
    {Array.from({ length: 14 }, (_, index) => <mesh key={index} position={[Math.sin(index * 2.4) * (6 + index * .7), .18, -4 - index * 1.7]} rotation={[.2, index, .2]} scale={[.7 + (index % 3) * .2, .28, .6]} castShadow><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#9290a6" roughness={1} flatShading /></mesh>)}
  </group>;
  return <group>
    {Array.from({ length: 13 }, (_, index) => {
      const x = (index % 7 - 3) * 4.1;
      const z = -13 - Math.floor(index / 7) * 11 - Math.sin(index * 1.7) * 2;
      return <group key={index} position={[x, 0, z]} scale={[1.7 + index % 2, 1.4 + index % 4 * .45, 1.5 + index % 3 * .2]} rotation={[0, .12, 0]}><NoirTower seed={index * 1.7} /></group>;
    })}
    {[-5.4, 5.9].map((x, index) => <group key={x} position={[x, 0, index ? -3.4 : 1.4]}>
      <mesh position={[0, 1.35, 0]} castShadow><cylinderGeometry args={[.035, .055, 2.7, 8]} /><meshStandardMaterial color="#446067" metalness={.55} roughness={.3} /></mesh>
      <mesh position={[.25, 2.68, 0]} castShadow><boxGeometry args={[.56, .065, .1]} /><meshStandardMaterial color="#526b70" metalness={.5} roughness={.3} /></mesh>
      <mesh position={[.36, 2.63, 0]}><boxGeometry args={[.24, .025, .075]} /><meshStandardMaterial color="#d2d9bd" emissive="#c8e0ca" emissiveIntensity={2.5} /></mesh>
      <pointLight position={[.36, 2.5, 0]} color={index ? '#e8ac82' : '#9cd6df'} intensity={8} distance={7} decay={2} />
    </group>)}
  </group>;
}

/** A complete physical set: atmosphere, light, terrain, road and distant scenery. */
export const WorldEnvironment = memo(function WorldEnvironment({ world }: { world: WorldId }) {
  const noir = world === 'noir', lunar = world === 'lunar';
  return <>
    <color attach="background" args={[palettes[world].sky]} />
    <fog attach="fog" args={[palettes[world].sky, noir ? 17 : 24, noir ? 72 : 105]} />
    <Sky world={world} />
    <ambientLight intensity={noir ? .45 : lunar ? .6 : .7} color={noir ? '#8babb8' : '#eee7e0'} />
    <hemisphereLight args={[noir ? '#6d9fb7' : lunar ? '#c2c2e0' : '#fff0d8', palettes[world].shadow, noir ? 1.4 : 1.9]} />
    <directionalLight position={[-9, 11, -5]} intensity={noir ? 1.5 : lunar ? 3.1 : 4.1} color={noir ? '#94b8d6' : lunar ? '#f7d8de' : '#ffe0ae'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={15} shadow-camera-bottom={-15} shadow-camera-near={.1} shadow-camera-far={55} shadow-bias={-.00035} shadow-normalBias={.025} />
    <directionalLight position={[8, 4, 9]} intensity={noir ? 1.3 : .75} color={noir ? '#709fa6' : lunar ? '#8e96ca' : '#bdcfce'} />
    {noir && <pointLight position={[3, 3, 2]} color="#df8f7d" intensity={14} distance={12} decay={2} />}
    <Ground world={world} />
    <Road world={world} />
    <DistantWorld world={world} />
  </>;
});
