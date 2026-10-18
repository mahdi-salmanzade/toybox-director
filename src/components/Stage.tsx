import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Grid, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import type { Pose, Shot, StageProp } from '../lib/project';
import { interpolatePose } from '../lib/project';
import { moveCamera } from '../lib/camera-moves';
import type { CameraMove } from '../lib/camera-moves';
import { WorldEnvironment, WorldProp } from './CinematicWorld';

export type CaptureOptions = { width?: number; height?: number; readyKey?: string };
export type StageHandle = { capture: (options?: CaptureOptions) => Promise<string | undefined> };
type ReadyCapture = { key?: string; capture: (width: number, height: number) => Promise<string> };
type CaptureBridge = { current: ReadyCapture | null; disposed: boolean; listeners: Set<() => void> };

// Subscribe to React's committed scene, rather than guessing how many animation frames it needs.
function waitForCapture(bridge: CaptureBridge, key?: string): Promise<ReadyCapture> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (bridge.disposed) { cleanup(); reject(new Error('The stage was closed before its frame was ready.')); }
      else if (bridge.current && (key === undefined || bridge.current.key === key)) { cleanup(); resolve(bridge.current); }
    };
    const cleanup = () => { clearTimeout(timer); bridge.listeners.delete(finish); };
    // A failure deadline, not a rendering delay: a matching layout commit resolves immediately.
    timer = setTimeout(() => { cleanup(); reject(new Error('The stage could not prepare a frame. Check that WebGL is available.')); }, 15000);
    bridge.listeners.add(finish);
    finish();
  });
}

const targetFor = (cinematic?: boolean) => new THREE.Vector3(0, cinematic ? 1 : .25, 0);
const aspectFit = (aspect: number) => Math.max(1, 1.3 / Math.max(aspect, .01));
type Props = { shot: Shot; frameIndex: number; selectedId: string | null; onSelect: (id: string | null) => void; onMove: (id: string, pose: Pose) => void; time: number | null; showGrid: boolean; camera: Shot['camera']; showPath: boolean; cinematic?: boolean; captureKey?: string };

function Car({ color }: { color: string }) {
  return <group position={[0, .25, 0]}>
    <RoundedBox args={[1.65, .38, .8]} radius={.14} smoothness={4} castShadow><meshStandardMaterial color={color} roughness={.3} metalness={.15} /></RoundedBox>
    <RoundedBox args={[.86, .32, .7]} radius={.12} position={[-.05, .3, 0]} smoothness={4} castShadow><meshStandardMaterial color={color} roughness={.3} /></RoundedBox>
    <RoundedBox args={[.61, .25, .72]} radius={.07} position={[-.06, .31, 0]} smoothness={4}><meshStandardMaterial color="#405251" metalness={.35} roughness={.12} /></RoundedBox>
    <RoundedBox args={[.69, .07, .67]} radius={.025} position={[-.05, .47, 0]} smoothness={4} castShadow><meshStandardMaterial color={color} /></RoundedBox>
    {[-.53, .54].flatMap(x => [-.42, .42].map(z => <group key={`${x}-${z}`} position={[x, -.08, z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow><cylinderGeometry args={[.23, .23, .14, 24]} /><meshStandardMaterial color="#292c2b" roughness={.9} /></mesh>
      <mesh position={[0, z > 0 ? .075 : -.075, 0]}><cylinderGeometry args={[.12, .12, .012, 16]} /><meshStandardMaterial color="#d1d1c8" metalness={.5} roughness={.3} /></mesh>
    </group>))}
    {[-.25, .25].map(z => <mesh position={[.827, .05, z]} key={z}><boxGeometry args={[.03, .09, .17]} /><meshStandardMaterial color="#fff3bd" emissive="#dac891" emissiveIntensity={.25} /></mesh>)}
    <mesh position={[-.83, -.05, 0]}><boxGeometry args={[.04, .07, .62]} /><meshStandardMaterial color="#b7bab1" metalness={.5} roughness={.2} /></mesh>
  </group>;
}
function Mug({ color }: { color: string }) {
  const points = useMemo(() => [new THREE.Vector2(0, .04), new THREE.Vector2(.64, .04), new THREE.Vector2(.68, .12), new THREE.Vector2(.73, 1.65), new THREE.Vector2(.7, 1.71), new THREE.Vector2(.63, 1.71), new THREE.Vector2(.6, .17), new THREE.Vector2(0, .17)], []);
  return <group>
    <mesh castShadow receiveShadow><latheGeometry args={[points, 48]} /><meshStandardMaterial color={color} roughness={.38} metalness={.05} side={THREE.DoubleSide} /></mesh>
    <mesh position={[.75, .94, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><torusGeometry args={[.48, .11, 12, 32]} /><meshStandardMaterial color={color} roughness={.38} /></mesh>
    <mesh position={[0, 1.36, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.63, 32]} /><meshStandardMaterial color="#60432c" roughness={.2} /></mesh>
  </group>;
}
function PropMesh({ prop }: { prop: StageProp }) {
  if (prop.kind === 'car') return <Car color={prop.color} />;
  if (prop.kind === 'mug') return <Mug color={prop.color} />;
  if (prop.kind === 'sphere') return <mesh position={[0, .65, 0]} castShadow><sphereGeometry args={[.65, 32, 32]} /><meshStandardMaterial color={prop.color} roughness={.45} /></mesh>;
  if (prop.kind === 'tree') return <group><mesh castShadow position={[0, .5, 0]}><cylinderGeometry args={[.12, .16, 1, 12]} /><meshStandardMaterial color="#94725a" /></mesh><mesh castShadow position={[0, 1.3, 0]}><coneGeometry args={[.75, 1.8, 32]} /><meshStandardMaterial color={prop.color} roughness={.85} /></mesh></group>;
  return <group>{[-.85, .85].map(x => <RoundedBox key={x} args={[.5, 2, .7]} radius={.07} position={[x, 1, 0]} castShadow><meshStandardMaterial color={prop.color} /></RoundedBox>)}<RoundedBox args={[2.2, .5, .7]} radius={.07} position={[0, 2.1, 0]} castShadow><meshStandardMaterial color={prop.color} /></RoundedBox></group>;
}
function CameraPosition({ camera, cinematic }: { camera: Shot['camera']; cinematic?: boolean }) {
  const { camera: active, invalidate, size } = useThree();
  useLayoutEffect(() => {
    const position = camera === 'overhead' ? [0, 15, .01] : camera === 'low' ? [9, 3.8, 9] : cinematic ? [8, 5, 12] : [9, 9, 12];
    const target = targetFor(cinematic);
    active.position.set(position[0], position[1], position[2]).sub(target).multiplyScalar(aspectFit(size.width / Math.max(size.height, 1))).add(target);
    active.lookAt(target); active.updateProjectionMatrix(); invalidate();
  }, [active, camera, cinematic, invalidate, size.width, size.height]);
  return null;
}
/** Plays the shot's camera move over the preview time, then hands the view back to orbit editing. */
function CameraMotion({ move, time, camera, cinematic }: { move: CameraMove; time: number | null; camera: Shot['camera']; cinematic?: boolean }) {
  const { camera: active, invalidate, size } = useThree();
  const base = useRef<{ key: string; position: THREE.Vector3 } | null>(null);
  // CameraPosition resets the view whenever this key changes; only an unchanged view is restored.
  const key = `${camera}|${cinematic}|${size.width}x${size.height}`;
  useLayoutEffect(() => {
    const target = targetFor(cinematic);
    if (time === null || move === 'static') {
      if (base.current?.key === key) { active.position.copy(base.current.position); active.lookAt(target); invalidate(); }
      base.current = null;
      return;
    }
    if (base.current?.key !== key) base.current = { key, position: active.position.clone() };
    const from = base.current.position;
    active.position.set(...moveCamera([from.x, from.y, from.z], [target.x, target.y, target.z], move, time));
    active.lookAt(target); active.updateMatrixWorld(); invalidate();
  }, [active, move, time, key, cinematic, invalidate]);
  return null;
}
function Scene(props: Props & { bridge: CaptureBridge }) {
  const { shot, frameIndex, selectedId, onSelect, onMove, time, showGrid, camera, showPath, bridge, cinematic, captureKey } = props;
  const { gl, scene, camera: sceneCamera, size, invalidate } = useThree();
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointerId: number; target: { releasePointerCapture?: (id: number) => void }; x: number; z: number } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => {
    let disposed = false;
    const cancellations = new Set<(error: Error) => void>();
    const ready: ReadyCapture = {
      key: captureKey,
      capture: async (width, height) => {
        if (disposed || gl.getContext().isContextLost()) throw new Error('The stage graphics context is unavailable. Reload the studio and try again.');
        const exportCamera = sceneCamera.clone();
        if (!(exportCamera instanceof THREE.PerspectiveCamera)) throw new Error('This stage camera cannot export a frame.');
        const target = targetFor(cinematic);
        // Remove the narrow-screen fit while preserving the user's orbit and zoom.
        exportCamera.position.sub(target).multiplyScalar(aspectFit(width / height) / aspectFit(size.width / Math.max(size.height, 1))).add(target);
        exportCamera.aspect = width / height;
        exportCamera.updateProjectionMatrix(); exportCamera.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);
        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout>;
          const cleanup = () => { clearTimeout(timer); cancellations.delete(cancel); gl.domElement.removeEventListener('webglcontextlost', contextLost); };
          const cancel = (error: Error) => { cleanup(); reject(error); };
          const contextLost = () => cancel(new Error('The stage graphics context was lost. Reload the studio and try again.'));
          cancellations.add(cancel); gl.domElement.addEventListener('webglcontextlost', contextLost);
          timer = setTimeout(() => cancel(new Error('The stage shaders could not finish preparing. Please try again.')), 15000);
          gl.compileAsync(scene, exportCamera).then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
        });
        if (disposed || bridge.current !== ready || gl.getContext().isContextLost()) throw new Error('The scene changed before its frame was captured. Please try again.');
        const previousSize = gl.getSize(new THREE.Vector2());
        const previousRatio = gl.getPixelRatio();
        const previousTarget = gl.getRenderTarget();
        const previousViewport = gl.getViewport(new THREE.Vector4());
        const previousScissor = gl.getScissor(new THREE.Vector4());
        const previousScissorTest = gl.getScissorTest();
        try {
          // Rendering to the canvas retains Three's output color conversion and tone mapping.
          gl.setRenderTarget(null); gl.setPixelRatio(1); gl.setSize(width, height, false);
          gl.setViewport(0, 0, width, height); gl.setScissorTest(false);
          gl.render(scene, exportCamera);
          return gl.domElement.toDataURL('image/png');
        } finally {
          gl.setPixelRatio(previousRatio); gl.setSize(previousSize.x, previousSize.y, false);
          gl.setRenderTarget(previousTarget); gl.setViewport(previousViewport);
          gl.setScissor(previousScissor); gl.setScissorTest(previousScissorTest);
          // Restore the visible canvas immediately; its dimensions and orbit never change in React.
          if (!gl.getContext().isContextLost()) gl.render(scene, sceneCamera);
          invalidate();
        }
      },
    };
    bridge.current = ready;
    bridge.listeners.forEach(listener => listener());
    return () => {
      disposed = true;
      cancellations.forEach(cancel => cancel(new Error('The scene changed before its frame was captured. Please try again.')));
      if (bridge.current === ready) bridge.current = null;
    };
  }, [gl, scene, sceneCamera, size.width, size.height, cinematic, captureKey, shot, frameIndex, selectedId, time, showGrid, showPath, camera, bridge, invalidate]);
  const endDrag = useCallback(() => {
    const previous = drag.current;
    drag.current = null;
    setDragging(null);
    if (previous) {
      try { previous.target.releasePointerCapture?.(previous.pointerId); } catch { /* Browser already released a cancelled pointer. */ }
    }
    gl.domElement.style.cursor = 'default';
  }, [gl]);
  useEffect(() => {
    const canvas = gl.domElement;
    window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag); window.addEventListener('blur', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
    return () => {
      window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag); window.removeEventListener('blur', endDrag);
      canvas.removeEventListener('lostpointercapture', endDrag);
      const previous = drag.current; drag.current = null;
      if (previous) { try { previous.target.releasePointerCapture?.(previous.pointerId); } catch { /* Already released. */ } }
      canvas.style.cursor = 'default';
    };
  }, [gl, endDrag]);
  useEffect(() => { endDrag(); }, [shot.id, frameIndex, time !== null, cinematic, endDrag]);
  const move = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current || time !== null || event.pointerId !== current.pointerId) return;
    event.stopPropagation();
    if (!event.ray.intersectPlane(plane, hit)) return;
    const previous = shot.frames[frameIndex].poses[current.id];
    if (!previous) { endDrag(); return; }
    onMove(current.id, { ...previous, x: Math.max(-5.5, Math.min(5.5, hit.x - current.x)), z: Math.max(-3.6, Math.min(3.6, hit.z - current.z)) });
  };
  const release = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation(); endDrag();
  };
  return <>
    {cinematic ? <WorldEnvironment world={shot.world} /> : <>
    <color attach="background" args={['#e4e0d6']} />
    <ambientLight intensity={1.25} />
    <hemisphereLight args={['#fff9e8', '#b7c1c5', 1.8]} />
    <directionalLight position={[-5, 12, 7]} intensity={3.1} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-.0005} />
    <directionalLight position={[8, 4, -4]} intensity={1} color="#ffe9c7" />
    </>}
    <CameraPosition camera={camera} cinematic={cinematic} />
    <CameraMotion move={shot.cameraMove} time={time} camera={camera} cinematic={cinematic} />
    <OrbitControls makeDefault enabled={!dragging && time === null} minPolarAngle={.1} maxPolarAngle={Math.PI / 2.15} enablePan={false} minDistance={7} maxDistance={40} target={[0, cinematic ? 1 : .25, 0]} />
    {!cinematic && <>
    <RoundedBox args={[13, .22, 9]} radius={.12} position={[0, -.14, 0]} receiveShadow><meshStandardMaterial color="#efebe1" roughness={.9} /></RoundedBox>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.26, 0]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#ddd9cf" /></mesh>
    {showGrid && <Grid position={[0, -.015, 0]} args={[12.5, 8.5]} cellSize={.5} cellThickness={.45} cellColor="#c6c0b2" sectionSize={2} sectionThickness={.7} sectionColor="#c2bbaa" fadeDistance={35} fadeStrength={1} />}
    <ContactShadows opacity={.3} scale={16} blur={2.5} far={4} resolution={256} color="#6f624b" position={[0, -.008, 0]} />
    </>}
    {showPath && shot.props[0] && <Line points={shot.frames.map(frame => { const p = frame.poses[shot.props[0].id]; return [p.x, .022, p.z] as [number, number, number]; })} color="#d66948" lineWidth={1.8} dashed dashSize={.15} gapSize={.13} />}
    {shot.props.map(prop => {
      const pose = time !== null ? interpolatePose(shot, prop.id, time) : shot.frames[frameIndex].poses[prop.id];
      return <group key={prop.id} position={[pose.x, 0, pose.z]} rotation={[0, pose.rotation, 0]} scale={prop.scale}
        onPointerDown={(event) => {
          if (time !== null || event.button !== 0 || !event.ray.intersectPlane(plane, hit)) return;
          event.stopPropagation(); onSelect(prop.id);
          const target = event.target as unknown as { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void };
          drag.current = { id: prop.id, pointerId: event.pointerId, target, x: hit.x - pose.x, z: hit.z - pose.z };
          setDragging(prop.id); target.setPointerCapture(event.pointerId); gl.domElement.style.cursor = 'grabbing';
        }}
        onPointerMove={move} onPointerUp={release}
        onPointerOver={() => { if (!dragging) gl.domElement.style.cursor = 'grab'; }} onPointerOut={() => { if (!dragging) gl.domElement.style.cursor = 'default'; }}>
        {cinematic && prop.kind !== 'car' ? <WorldProp prop={prop} world={shot.world} /> : <PropMesh prop={prop} />}
        {selectedId === prop.id && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .025, 0]}><ringGeometry args={[1.05, 1.07, 64]} /><meshBasicMaterial color="#d76343" transparent opacity={.9} /></mesh>}
      </group>;
    })}
  </>;
}
class StageBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="stage-fallback"><h3>The stage needs WebGL</h3><p>Enable hardware acceleration in your browser, or upload photos for your keyframes.</p></div> : this.props.children; }
}
export const Stage = forwardRef<StageHandle, Props>(function Stage(props, ref) {
  const bridge = useRef<CaptureBridge>({ current: null, disposed: false, listeners: new Set() });
  const captureQueue = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => {
    const state = bridge.current; state.disposed = false;
    return () => { state.disposed = true; state.current = null; state.listeners.forEach(listener => listener()); };
  }, []);
  useImperativeHandle(ref, () => ({ capture: (options = {}) => {
    const width = options.width ?? 1024, height = options.height ?? 640;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 4096 || height > 4096) return Promise.reject(new Error('Frame dimensions must be whole numbers from 64 to 4096 pixels.'));
    const result = captureQueue.current.catch(() => undefined).then(async () => {
      const ready = await waitForCapture(bridge.current, options.readyKey);
      return ready.capture(width, height);
    });
    captureQueue.current = result;
    return result;
  } }), []);
  return <StageBoundary><Canvas frameloop="demand" shadows dpr={[1, 1.5]} camera={{ position: [9, 9, 12], fov: 37 }} gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} onPointerMissed={() => props.onSelect(null)} aria-label="Interactive miniature stage. Select a prop, then drag it. Use the inspector for keyboard-accessible positioning."><Scene {...props} bridge={bridge.current} /></Canvas></StageBoundary>;
});
