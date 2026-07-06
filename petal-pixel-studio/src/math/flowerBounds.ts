import * as THREE from "three";

/**
 * The Flower3D group transform (single source of truth for scene + bounds math):
 * <group rotation={[GROUP_TILT_X, idleYaw, 0]} scale={GROUP_SCALE} position={[0, GROUP_POSITION_Y, 0]}>
 */
export const GROUP_TILT_X = 0.3;
export const GROUP_SCALE = 0.0045;
export const GROUP_POSITION_Y = -0.75;

/** Margin between the flower's lowest possible point and the shadow plane. */
const GROUND_MARGIN = 0.02;

export interface FlowerBounds {
  /** Camera-framing fields — identical math to the original inline version (no tilt). */
  center: THREE.Vector3;
  size: THREE.Vector3;
  radius: number;
  /**
   * Conservative world-space Y of the shadow plane: at or below the flower's
   * lowest point for ANY idle yaw, including the fixed X tilt. The ContactShadows
   * plane sits here so it never slices the geometry (a sliced flower produces a
   * cross-section blob instead of a silhouette).
   */
  groundY: number;
  /** Conservative world-space top of the flower (ContactShadows `far` must reach it). */
  topY: number;
  /** Conservative horizontal footprint radius (for sizing the shadow plane). */
  maxXZRadius: number;
}

/**
 * Compute world-space bounds of a flower geometry as rendered by Flower3D.
 *
 * The idle animation spins the group around Y while the X tilt stays fixed
 * (Euler "XYZ": tilt applied outermost), so the exact world bbox changes with
 * yaw. Instead of tracking yaw per-frame we bound the geometry by the cylinder
 * it sweeps: any point (x, y, z) stays within horizontal radius
 * R = max hypot(x, z), and under the tilt its world Y stays within
 * [y·cosθ − R·sinθ, y·cosθ + R·sinθ]. That yields a yaw-independent ground.
 */
export function computeFlowerBounds(
  geometry: THREE.BufferGeometry,
  blossomRotation: [number, number, number],
): FlowerBounds | null {
  geometry.computeBoundingBox();
  const source = geometry.boundingBox;
  if (!source) {
    return null;
  }

  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...blossomRotation));
  const local = source.clone().applyMatrix4(rotationMatrix);

  // ── Legacy camera-framing fields (blossom rotation only, no tilt) ──────────
  const framing = local.clone();
  framing.min.multiplyScalar(GROUP_SCALE).add(new THREE.Vector3(0, GROUP_POSITION_Y, 0));
  framing.max.multiplyScalar(GROUP_SCALE).add(new THREE.Vector3(0, GROUP_POSITION_Y, 0));
  const size = framing.getSize(new THREE.Vector3());
  const center = framing.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.35);

  // ── Yaw-independent ground/top via the swept cylinder + tilt ──────────────
  const minY = local.min.y * GROUP_SCALE;
  const maxY = local.max.y * GROUP_SCALE;
  // Max horizontal radius of the scaled bbox corners (bounds every point).
  const maxAbsX = Math.max(Math.abs(local.min.x), Math.abs(local.max.x)) * GROUP_SCALE;
  const maxAbsZ = Math.max(Math.abs(local.min.z), Math.abs(local.max.z)) * GROUP_SCALE;
  const cylinderR = Math.hypot(maxAbsX, maxAbsZ);

  const cos = Math.cos(GROUP_TILT_X);
  const sin = Math.abs(Math.sin(GROUP_TILT_X));
  const groundY = minY * cos - cylinderR * sin + GROUP_POSITION_Y - GROUND_MARGIN;
  const topY = maxY * cos + cylinderR * sin + GROUP_POSITION_Y;

  // Under yaw the footprint stays within the swept-cylinder radius; the tilt
  // can only shrink the horizontal projection of Y-extents' contribution, but
  // tilted height adds z-reach: account for it conservatively.
  const heightReach = Math.max(Math.abs(minY), Math.abs(maxY)) * sin;
  const maxXZRadius = cylinderR + heightReach;

  return { center, size, radius, groundY, topY, maxXZRadius };
}
