import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
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
import { useFlowerStore } from '@/stores/flowerStore';
import { type FlowerBounds } from '@/math/flowerBounds';
import { registerRenderer, frameCameraForBounds, type RenderOpts } from './snapshot';

// Studio background: near-black but LIFTED so petals read bright (vs. the murky
// on-screen #08080f). Kept as a plain hex the capture pass turns into a Color.
const STUDIO_BG = '#14141c';
const ONSCREEN_BG = '#08080f';
// Bright-pass tuning: lift exposure and reflected environment so the export is
// not pale/dim like the live framebuffer.
const CAPTURE_EXPOSURE_MULT = 1.5;
const CAPTURE_ENV_MAP_INTENSITY = 1.6;
const DEFAULT_CAPTURE_SIZE = 1024;

function AutoFrameCamera({ bounds, controlsRef }: { bounds: FlowerBounds | null; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();

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
  }, [bounds, camera, controlsRef]);

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
  const { gl, scene, camera } = useThree();
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

        const { mesh, group } = findFlowerMeshAndGroup(scene);
        const material =
          mesh && mesh.material instanceof MeshPhysicalMaterial ? mesh.material : null;

        // ── Save on-screen state we are about to mutate ──────────────────────
        const prevSize = gl.getSize(new Vector2());
        const prevBg = scene.background;
        const prevFog = scene.fog;
        const prevToneExp = gl.toneMappingExposure;
        const prevClearColor = new Color();
        gl.getClearColor(prevClearColor);
        const prevClearAlpha = gl.getClearAlpha();
        const prevEnvMapIntensity = material ? material.envMapIntensity : 0;
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
          gl.toneMappingExposure = prevToneExp * CAPTURE_EXPOSURE_MULT;
          if (material) material.envMapIntensity = CAPTURE_ENV_MAP_INTENSITY;
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
          gl.toneMappingExposure = prevToneExp;
          if (material) material.envMapIntensity = prevEnvMapIntensity;
          if (group && opts?.frameYaw != null) group.rotation.y = prevYaw;
          gl.setSize(prevSize.x, prevSize.y);
          rt.dispose();
          // Repaint the live view with the ORIGINAL camera so the on-screen
          // frame is visually unchanged after a capture.
          gl.render(scene, camera);
        }
      }),
    [gl, scene, camera],
  );

  return null;
}

export function FlowerCanvas() {
  const params = useFlowerStore((s) => s.params);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [bounds, setBounds] = useState<FlowerBounds | null>(null);

  return (
    <div className="w-full h-full relative bg-canvas grid-bg rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [0, 2, 4], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[ONSCREEN_BG]} />
        <fog attach="fog" args={[ONSCREEN_BG, 6, 14]} />

        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
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
        <Environment preset="night" />
      </Canvas>
    </div>
  );
}
