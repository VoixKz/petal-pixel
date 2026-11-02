import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const { lerp, smoothstep } = THREE.MathUtils;

/**
 * Stands back far enough to hold the whole plant, then leans in as it opens. With
 * `shift`, a wide view keeps the plant right of centre, for words standing beside it;
 * `lift` raises it by that many pixels, to clear controls along the foot of the view.
 */
export function PlantRig({ life, shift = false, lift = 0 }: { life: { value: number }; shift?: boolean; lift?: number }) {
  useFrame(({ camera, size }) => {
    const t = life.value;
    const up = smoothstep(t, 0.04, 0.5);
    const close = smoothstep(t, 0.5, 0.92);
    const tall = size.height > size.width;
    // Whatever stands beside the plant takes a share of the width, so a narrower view
    // has to stand further back to keep the soil clear of it.
    const fit = tall ? 1 : Math.max(1, 1.6 / (size.width / size.height));
    const lookAt = lerp(lerp(0.7, 1.62, up), tall ? 1.72 : 1.96, close);
    const distance = fit * lerp(lerp(5.4, tall ? 12 : 8.4, up), tall ? 11.4 : 7.8, close);
    camera.position.set(0, lookAt + 0.7, distance);
    camera.lookAt(0, lookAt, 0);
    const perspective = camera as THREE.PerspectiveCamera;
    const across = shift && size.width > 900 && !tall ? -size.width * 0.2 : 0;
    if (across || lift) perspective.setViewOffset(size.width, size.height, across, lift, size.width, size.height);
    else if (perspective.view?.enabled) perspective.clearViewOffset();
  });
  return null;
}
