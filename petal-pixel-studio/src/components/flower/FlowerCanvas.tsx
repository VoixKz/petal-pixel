import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import {
  Color,
  Mesh,
  MeshPhysicalMaterial,
  MOUSE,
  PerspectiveCamera,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Group,
  type Object3D,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Flower3D } from './Flower3D';
import { useFlowerStore, type FlowerParams } from '@/stores/flowerStore';
import { type FlowerBounds } from '@/math/flowerBounds';
import { registerRenderer, frameCameraForBounds, type RenderOpts } from './snapshot';

// Studio background: near-black but LIFTED so petals read bright. This is now
// ALSO the live on-screen clear color + fog (D2 "one bright config"): the studio
// looks as good as the export instead of being a dim preview. Kept as a plain
// hex the capture pass turns into a Color.
const STUDIO_BG = '#14141c';
// Darker backdrop retained only for the capture pass's explicit 'dark' option.
const ONSCREEN_BG = '#08080f';
const DEFAULT_CAPTURE_SIZE = 1024;

function AutoFrameCamera({ bounds, controlsRef }: { bounds: FlowerBounds | null; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  // invalidate() is needed under frameloop="demand": this imperative camera move
  // happens in an effect the R3F reconciler does not auto-schedule a paint for,
  // so we must explicitly request one repaint after recentering.
  const { camera, invalidate } = useThree();

  useEffect(() => {
    if (!bounds) {
      return;
    }

    const fovRadians = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const safeRadius = Math.max(bounds.radius, 0.4);
    const distance = (safeRadius / Math.tan(fovRadians / 2)) * 1.35;

    const newPosition = new Vector3(
      bounds.center.x + distance * 0.75,
      bounds.center.y + distance * 0.55,
      bounds.center.z + distance,
    );

    camera.position.copy(newPosition);
    camera.near = 0.01;
    camera.far = Math.max(distance * 12, 40);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(bounds.center);
      controlsRef.current.update();
    }
    invalidate();
  }, [bounds, camera, controlsRef, invalidate]);

  return null;
}

/** Find the flower mesh (first MeshPhysicalMaterial mesh) and its parent group. */
function findFlowerMeshAndGroup(scene: Object3D): { mesh: Mesh | null; group: Group | null } {
  let mesh: Mesh | null = null;
  scene.traverse((obj) => {
    if (mesh) return;
    if (obj instanceof Mesh && obj.material instanceof MeshPhysicalMaterial) {
      mesh = obj;
    }
  });
  const group = mesh && mesh.parent ? (mesh.parent as Group) : null;
  return { mesh, group };
}

/**
 * Blit the (bottom-left-origin) GL pixel buffer into a 2D canvas (top-left
 * origin) with a vertical flip, then encode as a PNG blob.
 */
function pixelsToPngBlob(pixels: Uint8Array, size: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const image = ctx.createImageData(size, size);
  const rowBytes = size * 4;
  // Flip Y: GL row 0 is the bottom; ImageData row 0 is the top.
  for (let y = 0; y < size; y++) {
    const srcStart = (size - 1 - y) * rowBytes;
    const dstStart = y * rowBytes;
    image.data.set(pixels.subarray(srcStart, srcStart + rowBytes), dstStart);
  }
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function SnapshotBridge({ bounds }: { bounds: FlowerBounds | null }) {
  const { gl, scene, camera, invalidate } = useThree();
  // Keep the latest bounds available to the registered renderer without
  // re-registering on every bounds change.
  const boundsRef = useRef<FlowerBounds | null>(bounds);
  boundsRef.current = bounds;

  useEffect(
    () =>
      registerRenderer(async (opts?: RenderOpts): Promise<Blob | null> => {
        const b = boundsRef.current;
        if (!b) return null;

        const size = Math.max(1, Math.floor(opts?.size ?? DEFAULT_CAPTURE_SIZE));
        // DPR-aware: honor the device pixel ratio but cap so we never allocate
        // an unreasonable render target on hi-DPR displays.
        const dpr = Math.min(gl.getPixelRatio() || 1, 2);
        const rtSize = Math.max(1, Math.round(size * dpr));

        // Only the group is needed now (for frameYaw); the material envMap bump
        // that used to diverge the export from the live view has been removed so
        // live brightness == export brightness (D2 "one bright config").
        const { group } = findFlowerMeshAndGroup(scene);

        // ── Save on-screen state we are about to mutate ──────────────────────
        const prevSize = gl.getSize(new Vector2());
        const prevBg = scene.background;
        const prevFog = scene.fog;
        const prevClearColor = new Color();
        gl.getClearColor(prevClearColor);
        const prevClearAlpha = gl.getClearAlpha();
        const prevYaw = group ? group.rotation.y : 0;

        const rt = new WebGLRenderTarget(rtSize, rtSize);

        try {
          // ── Mutate for the bright pass ─────────────────────────────────────
          scene.fog = null;
          const bg = opts?.background ?? 'studio';
          if (bg === 'transparent') {
            scene.background = null;
          } else if (bg === 'dark') {
            scene.background = new Color(ONSCREEN_BG);
          } else if (bg === 'studio') {
            scene.background = new Color(STUDIO_BG);
          } else {
            scene.background = new Color(bg);
          }
          // Exposure + envMapIntensity are NO LONGER bumped here: the renderer's
          // toneMappingExposure (1.3, set on <Canvas>) is used for both the live
          // view and this capture, so the export matches what is on screen.
          if (group && opts?.frameYaw != null) group.rotation.y = opts.frameYaw;

          // ── Clone the camera so the live OrbitControls camera is untouched ──
          const cam = (camera as PerspectiveCamera).clone();
          cam.aspect = 1;
          const framing = frameCameraForBounds(b.center, b.radius, cam.fov, 1, 1.35);
          cam.position.set(framing.position.x, framing.position.y, framing.position.z);
          cam.lookAt(framing.target.x, framing.target.y, framing.target.z);
          cam.near = 0.01;
          cam.far = Math.max(framing.distance * 12, 40);
          cam.updateProjectionMatrix();

          // ── Render HD off-screen, read back, encode ───────────────────────
          gl.setRenderTarget(rt);
          gl.setClearColor(0x000000, bg === 'transparent' ? 0 : 1);
          gl.clear();
          gl.render(scene, cam);

          const buffer = new Uint8Array(rtSize * rtSize * 4);
          gl.readRenderTargetPixels(rt, 0, 0, rtSize, rtSize, buffer);

          return await pixelsToPngBlob(buffer, rtSize);
        } catch {
          return null;
        } finally {
          // ── Restore EVERYTHING and repaint the on-screen frame ─────────────
          gl.setRenderTarget(null);
          scene.background = prevBg;
          scene.fog = prevFog;
          if (group && opts?.frameYaw != null) group.rotation.y = prevYaw;
          gl.setSize(prevSize.x, prevSize.y);
          rt.dispose();
          // Under frameloop="demand" a raw gl.render() would paint an UN-composed
          // (bloom-less, vignette-less) frame that then stays stale on screen.
          // invalidate() instead asks the EffectComposer to repaint one correct
          // composed frame using the already-restored scene state.
          invalidate();
        }
      }),
    [gl, scene, camera, invalidate],
  );

  return null;
}

export function FlowerCanvas({ params: paramsProp }: { params?: FlowerParams } = {}) {
  // Call the hook unconditionally, then prefer the explicit prop. This lets the
  // logged-out share landing render a fetched flower without mutating the store.
  const storeParams = useFlowerStore((s) => s.params);
  const params = paramsProp ?? storeParams;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [bounds, setBounds] = useState<FlowerBounds | null>(null);

  return (
    <div className="w-full h-full relative bg-canvas grid-bg rounded-lg overflow-hidden">
      <Canvas
        // frameloop="demand" → the canvas only repaints when something asks it to
        // (invalidate()). CONTRACT for ren-material (Flower3D.tsx): its idle
        // useFrame spin FREEZES under demand unless that useFrame calls
        // state.invalidate() every frame while params.idleMotion is true. drei's
        // OrbitControls already calls invalidate() on its change event, and the
        // AutoFrameCamera / SnapshotBridge effects here invalidate() explicitly.
        frameloop="demand"
        camera={{ position: [0, 2, 4], fov: 45 }}
        // One bright config (D2): 1.3 exposure applies to BOTH the live view and
        // the capture pass (which uses the same renderer), so studio == export.
        gl={{ antialias: true, alpha: false, toneMappingExposure: 1.3 }}
      >
        <color attach="background" args={[STUDIO_BG]} />
        <fog attach="fog" args={[STUDIO_BG, 6, 14]} />

        {/* Bright rig: warm/cool hemisphere fill + strong key, the two
            palette-tied point lights, and a cool rim/back light so overlapping
            petal layers separate. */}
        <hemisphereLight args={['#fff4e6', '#1a1a24', 0.6]} />
        <directionalLight position={[5, 6, 5]} intensity={1.2} />
        <pointLight
          position={[0, 2, 0]}
          intensity={params.glowIntensity * 2}
          color={params.colorA}
        />
        <pointLight
          position={[-2, -1, 2]}
          intensity={0.5}
          color={params.colorB}
        />
        <directionalLight position={[-4, 4, -6]} intensity={0.7} color="#bcd4ff" />

        <Flower3D params={params} onBoundsChange={setBounds} />
        <AutoFrameCamera bounds={bounds} controlsRef={controlsRef} />
        <SnapshotBridge bounds={bounds} />

        {/*
          The shadow plane must sit AT OR BELOW the flower's lowest point: the
          ContactShadows depth camera looks up from the plane, so any geometry
          below it is invisible and the flower gets sliced into a weird
          cross-section blob. groundY/topY/maxXZRadius come from
          computeFlowerBounds and are conservative for any idle-rotation yaw.
        */}
        <ContactShadows
          position={[0, bounds?.groundY ?? -0.8, 0]}
          opacity={0.4}
          scale={bounds ? Math.min(14, Math.max(5, bounds.maxXZRadius * 2 * 1.4)) : 5}
          blur={2}
          far={bounds ? Math.max(4, bounds.topY - bounds.groundY + 0.6) : 4}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan
          minDistance={0.6}
          maxDistance={18}
          autoRotate={false}
          mouseButtons={{
            LEFT: MOUSE.ROTATE,
            MIDDLE: MOUSE.DOLLY,
            RIGHT: MOUSE.PAN,
          }}
        />
        {/*
          In-memory IBL: replaces drei's preset="night" which fetched a remote
          HDR from the pmndrs CDN at runtime (first-paint latency + CSP/offline
          risk). frames={1} bakes this Lightformer rig into an env map ONCE; it
          is lighting/reflection only (background stays STUDIO_BG), giving
          metallic/glass petals soft warm+cool specular streaks instead of a
          black blob.
        */}
        <Environment resolution={256} frames={1} environmentIntensity={0.9}>
          <Lightformer form="rect" intensity={2.2} color="#fff2e0" position={[0, 4, -4]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={1.1} color="#bcd4ff" position={[-5, 1, 2]} scale={[4, 4, 1]} />
          <Lightformer form="ring" intensity={1.4} color="#ffd9b0" position={[4, 3, 3]} scale={3} />
        </Environment>

        {/*
          Post-processing (LIVE VIEW ONLY): the capture pass renders straight
          through gl.render into its own render target, bypassing this composer,
          so the exported PNG/GIF is unchanged and stays deterministic. Bloom
          intensity is bound to params.glowIntensity (0→1 maps 0.3→1.3) so the
          Glow Intensity slider finally has visible meaning.
        */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.6}
            luminanceSmoothing={0.3}
            mipmapBlur
            intensity={0.3 + params.glowIntensity}
          />
          <Vignette eskil={false} offset={0.35} darkness={0.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
