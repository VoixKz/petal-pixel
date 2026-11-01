// Draws small pictures of flowers in the visitor's own browser, one at a time, on a
// single hidden canvas. A garden needs no picture store this way, and every card shows
// the flower exactly as the engine grows it today.
import { useEffect, useMemo } from 'react';
import { advance, createRoot, extend, useStore, useThree, type ReconcilerRoot } from '@react-three/fiber';
import * as THREE from 'three';
import { buildBlossom } from '@/math/blossom/build';
import { emptyPath, placeAt, traceStem } from '@/math/blossom/stem';
import { Plant } from './Plant';
import { Stage } from './Stage';
import { rememberThumbnail, thumbnailFor } from './thumbnailCache';

const SIZE = 360;
/** A flower that never finishes must not hold up the ones behind it. */
const PATIENCE_MS = 8000;
const GROWN = { value: 1 };
const DAYLIGHT = { value: 0 };

function Picture({ seed, onDone }: { seed: string; onDone: (picture: string) => void }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const store = useStore();
  const heart = useMemo(() => {
    const path = emptyPath();
    traceStem(buildBlossom(seed).stem, 1, 0, path);
    const tip = placeAt(path, path.length);
    return new THREE.Vector3(tip.x, tip.y, tip.z).addScaledVector(new THREE.Vector3(tip.tx, tip.ty, tip.tz), 0.28);
  }, [seed]);

  useEffect(() => {
    camera.position.set(heart.x, heart.y + 1.2, heart.z + 5.1);
    camera.lookAt(heart.x, heart.y - 0.08, heart.z);
    const state = store.getState();
    // The first pass builds the plant and bakes the light, the second draws it lit.
    advance(0, false, state);
    advance(0, false, state);
    onDone(gl.domElement.toDataURL('image/webp', 0.82));
  }, [camera, gl, heart, onDone, store]);

  return (
    <Stage glow={DAYLIGHT} ground={false}>
      <Plant seed={seed} life={GROWN} glow={DAYLIGHT} />
    </Stage>
  );
}

let root: ReconcilerRoot<HTMLCanvasElement> | null = null;

function drawingRoot(): ReconcilerRoot<HTMLCanvasElement> {
  if (root) return root;
  // <Canvas> does this by itself; a root made by hand has to teach it the three.js objects.
  extend(THREE as unknown as Parameters<typeof extend>[0]);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  root = createRoot(canvas);
  root.configure({
    frameloop: 'never',
    shadows: 'percentage',
    dpr: 1,
    size: { width: SIZE, height: SIZE, top: 0, left: 0 },
    camera: { fov: 30, position: [0, 3, 6] },
    gl: { antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping },
  });
  return root;
}

/** Pictures wait in line, because one canvas can only hold one flower at a time. */
let line: Promise<unknown> = Promise.resolve();
const waiting = new Map<string, Promise<string | null>>();

export function drawThumbnail(seed: string): Promise<string | null> {
  const known = thumbnailFor(seed);
  if (known) return Promise.resolve(known);
  const queued = waiting.get(seed);
  if (queued) return queued;

  const turn = line.then(
    () =>
      new Promise<string | null>((resolve) => {
        const giveUp = window.setTimeout(() => resolve(null), PATIENCE_MS);
        const done = (picture: string) => {
          window.clearTimeout(giveUp);
          rememberThumbnail(seed, picture);
          resolve(picture);
        };
        try {
          drawingRoot().render(<Picture key={seed} seed={seed} onDone={done} />);
        } catch {
          resolve(null);
        }
      }),
  );
  waiting.set(seed, turn);
  // A breath between pictures, so a long garden never freezes the page.
  line = turn.then(() => new Promise((resolve) => setTimeout(resolve, 16)));
  void turn.finally(() => waiting.delete(seed));
  return turn;
}
