import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { advance, Canvas, useStore, useThree } from '@react-three/fiber';
import { useTheme } from 'next-themes';
import * as THREE from 'three';
import { identityOf } from '@/math/blossom/identity';
import { buildBlossom } from '@/math/blossom/build';
import { emptyPath, placeAt, traceStem } from '@/math/blossom/stem';
import { Plant } from './blossom/Plant';
import { PlantRig } from './blossom/PlantRig';
import { DAY_GROUND, GROUND, NIGHT_GROUND, Stage } from './blossom/Stage';
import { Turntable, useTurning } from './blossom/Turntable';
import { registerRenderer, type RenderOpts } from './snapshot';
import '@/styles/petal.css';

/** How long a plant takes to grow from bare soil to full bloom. */
const SECONDS_TO_BLOOM = 13;
const CAPTURE_SIZE = 1024;
/** Keeps the plant clear of the slider and buttons along the foot of the view. */
const CONTROLS_HEIGHT = 72;
const STAGES = [
  { label: 'Soil', at: 0 },
  { label: 'Stem', at: 0.2 },
  { label: 'Bud', at: 0.44 },
  { label: 'Bloom', at: 0.78 },
];

const wantsLessMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Signs a picture, so it still says whose flower it is once it is passed around. */
function signPicture(context: CanvasRenderingContext2D, size: number, words: string, night: boolean) {
  const margin = size * 0.05;
  const family = '"Hanken Grotesk Variable", system-ui, sans-serif';
  context.fillStyle = night ? '#ffffff' : '#141412';
  context.textBaseline = 'alphabetic';
  context.font = `500 ${size * 0.024}px ${family}`;
  const mark = 'Petal Pixel';
  const markWidth = context.measureText(mark).width;
  context.textAlign = 'right';
  context.fillText(mark, size - margin, size - margin);

  // A long name shrinks to fit rather than running into the mark.
  context.textAlign = 'left';
  context.font = `500 ${size * 0.048}px ${family}`;
  const room = size - margin * 3 - markWidth;
  const scale = Math.min(1, room / context.measureText(words).width);
  context.font = `500 ${size * 0.048 * scale}px ${family}`;
  context.fillText(words, margin, size - margin);
}

interface Pose {
  title: string;
  seed: string;
  life: { value: number };
  glow: { value: number };
  hold: { value: boolean };
  angle: { current: number };
  group: MutableRefObject<THREE.Group | null>;
}

/**
 * Lets the page ask for a picture of the flower. The plant is posed fully open and
 * facing front for one frame and put back in the same task, so nothing shows on screen.
 * It draws to the canvas itself rather than a texture, which keeps the colour and the
 * smooth edges exactly as they look live.
 */
function CaptureBridge({ title, seed, life, glow, hold, angle, group }: Pose) {
  const { gl, scene } = useThree();
  const store = useStore();

  useEffect(() => {
    const path = emptyPath();
    traceStem(buildBlossom(seed).stem, 1, 0, path);
    const tip = placeAt(path, path.length);
    const heartHeight = tip.y + tip.ty * 0.28;

    return registerRenderer(async (opts?: RenderOpts) => {
      const size = Math.max(1, Math.floor(opts?.size ?? CAPTURE_SIZE));
      const night = opts?.background === 'dark';
      const state = store.getState();
      const repose = () => advance(state.clock.elapsedTime, false, state);
      const was = {
        life: life.value,
        glow: glow.value,
        angle: angle.current,
        yaw: group.current?.rotation.y ?? 0,
        background: scene.background,
        ratio: gl.getPixelRatio(),
        size: gl.getSize(new THREE.Vector2()),
      };
      const picture = document.createElement('canvas');
      picture.width = picture.height = size;
      const ground = scene.getObjectByName(GROUND);

      try {
        life.value = 1;
        glow.value = night ? 1 : 0;
        hold.value = true;
        angle.current = opts?.frameYaw ?? 0;
        if (group.current) group.current.rotation.y = angle.current;
        repose();

        const shot = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
        shot.position.set(0, heartHeight + 1.15, 6.6);
        shot.lookAt(0, heartHeight - 0.1, 0);
        gl.setPixelRatio(1);
        gl.setSize(size, size, false);
        scene.background = new THREE.Color(night ? NIGHT_GROUND : DAY_GROUND);
        if (ground) ground.visible = false;
        gl.render(scene, shot);
        // A WebGL canvas can only be read in the task that drew it.
        const context = picture.getContext('2d');
        context?.drawImage(gl.domElement, 0, 0, size, size);
        if (context && opts?.caption) signPicture(context, size, title, night);
      } catch {
        return null;
      } finally {
        gl.setPixelRatio(was.ratio);
        gl.setSize(was.size.x, was.size.y, false);
        scene.background = was.background;
        if (ground) ground.visible = true;
        life.value = was.life;
        glow.value = was.glow;
        hold.value = false;
        angle.current = was.angle;
        if (group.current) group.current.rotation.y = was.yaw;
        repose();
        // Resizing clears the canvas, and a stage drawing sparingly may not redraw it for a while.
        gl.render(scene, state.camera);
      }
      return new Promise<Blob | null>((resolve) => picture.toBlob(resolve, 'image/png'));
    });
  }, [title, seed, gl, scene, store, life, glow, hold, angle, group]);

  return null;
}

export interface BloomViewProps {
  /** The name to grow. Blank shows bare soil. */
  name: string;
  /** Keeps the plant right of centre on a wide view, for words beside it. */
  shift?: boolean;
  /** Says what the name grew, in the corner of the view. */
  caption?: boolean;
  /** Starts with the lights off when the app is in its dark theme. */
  followTheme?: boolean;
}

/** A plant growing from a name, with its own age slider and lights. */
export function BloomView({ name, shift = false, caption = true, followTheme = false }: BloomViewProps) {
  const { resolvedTheme } = useTheme();
  const life = useRef({ value: 0 }).current;
  const glow = useRef({ value: followTheme && resolvedTheme === 'dark' ? 1 : 0 }).current;
  const hold = useRef({ value: false }).current;
  const group = useRef<THREE.Group | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  const playing = useRef(false);
  const first = useRef(true);
  const { angle, handlers } = useTurning();

  const [night, setNight] = useState(glow.value > 0);
  const clean = name.trim();
  const flower = useMemo(() => (clean ? identityOf(clean) : null), [clean]);

  useEffect(() => {
    // Opening a flower that exists shows it open; a new name grows from the soil.
    const jump = first.current || wantsLessMotion();
    first.current = false;
    life.value = jump ? 1 : 0;
    playing.current = !jump;
  }, [clean, life]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A slow device gets fewer frames, not a slower plant; only a long pause is cut short.
      const seconds = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (playing.current) {
        life.value = Math.min(1, life.value + seconds / SECONDS_TO_BLOOM);
        if (life.value >= 1) playing.current = false;
      }
      if (slider.current) slider.current.value = String(Math.round(life.value * 100));
      glow.value += ((night ? 1 : 0) - glow.value) * (1 - Math.exp(-seconds * 3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [life, glow, night]);

  const growAgain = () => {
    life.value = wantsLessMotion() ? 1 : 0;
    playing.current = !wantsLessMotion();
  };

  return (
    <div className="pp bloom" data-night={night}>
      <div className="bloom__canvas" {...handlers}>
        <Canvas
          shadows="percentage"
          dpr={[1, 2]}
          camera={{ position: [0, 2.3, 8.4], fov: 30 }}
          gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        >
          <Stage glow={glow} bloom={night}>
            <PlantRig life={life} shift={shift} lift={CONTROLS_HEIGHT} />
            {flower && (
              <>
                <Turntable angle={angle} group={group}>
                  <Plant key={flower.seed} seed={flower.seed} life={life} glow={glow} sway={!wantsLessMotion()} hold={hold} />
                </Turntable>
                <CaptureBridge title={`${clean}'s ${flower.kind}`} seed={flower.seed} life={life} glow={glow} hold={hold} angle={angle} group={group} />
              </>
            )}
          </Stage>
        </Canvas>
      </div>

      {caption && flower && (
        <p className="bloom__says">
          {clean} grows {article(flower.kind)} {flower.kind}.
        </p>
      )}
      {!flower && <p className="bloom__says">Type a name and its flower grows here.</p>}

      {flower && (
        <div className="bloom__controls">
          <label className="grow__age">
            <span className="bloom__label">Age of the plant</span>
            <input
              ref={slider}
              type="range"
              min={0}
              max={100}
              step={1}
              defaultValue={100}
              aria-label="Age of the plant"
              onChange={(event) => {
                playing.current = false;
                life.value = Number(event.target.value) / 100;
                event.target.setAttribute(
                  'aria-valuetext',
                  STAGES.filter((stage) => life.value >= stage.at).pop()?.label ?? 'Soil',
                );
              }}
            />
          </label>
          <button type="button" className="pp-button pp-button--quiet" onClick={growAgain}>Grow again</button>
          <button type="button" className="pp-button pp-button--quiet" onClick={() => setNight(!night)}>
            {night ? 'Turn the lights on' : 'Turn the lights off'}
          </button>
        </div>
      )}
    </div>
  );
}
