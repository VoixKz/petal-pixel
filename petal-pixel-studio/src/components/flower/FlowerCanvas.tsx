import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { MOUSE, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Flower3D } from './Flower3D';
import { useFlowerStore } from '@/stores/flowerStore';
import type { FlowerBounds } from '@/math/flowerBounds';

function AutoFrameCamera({ bounds, controlsRef }: { bounds: FlowerBounds | null; controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!bounds) {
      return;
    }

    const fovRadians = (camera.fov * Math.PI) / 180;
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
        <color attach="background" args={['#08080f']} />
        <fog attach="fog" args={['#08080f', 6, 14]} />

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
