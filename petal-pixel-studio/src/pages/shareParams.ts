// Pure, dependency-light mappers for the logged-out share landing.
//
// The share page fetches a flower over plain HTTP (no gRPC transport, no
// Supabase session) and must turn the persisted Go `flower.Params` JSON
// (snake_case) into the frontend `FlowerParams` shape that FlowerCanvas /
// Flower3D render. This mirrors flowerStore.generateFromWord's v1/v2 split but
// reads snake_case HTTP JSON directly (NOT the proto camelCase path, which needs
// a bigint seed + Connect transport). It NEVER throws on missing/partial input —
// every field falls back to a default so isV2()/buildV2Geometry() route it.

import { buildShareUrl, flowerBackendBaseUrl } from '@/integrations/flowerBackend/client';
import type { FlowerParamsJson } from '@/integrations/flowerBackend/client';
import type { FlowerParams } from '@/stores/flowerStore';
import type { Palette, PaletteStop } from '@/math/palette';
import {
  DEFAULT_BLOOM_PARAMS,
  DEFAULT_CLASSIC_PARAMS,
  DEFAULT_ROSE_PARAMS,
  FLOWER_TYPES,
  V2_FAMILIES,
  type BloomParams,
  type ClassicParams,
  type FlowerFamily,
  type FlowerType,
  type RhodoneaParams,
  type RoseParams,
  type SunflowerParams,
  type SuperformulaParams,
} from '@/math/flowerTypes';

/**
 * Share a flower link from a gallery card. Builds the backend /share/:id URL and
 * uses the Web Share sheet when available, else copies to the clipboard. Best
 * effort — swallows a dismissed share sheet. `notify`/`fail` let the caller
 * surface a toast without this module importing `sonner`.
 */
export async function shareFlowerLink(
  flowerId: string,
  title: string,
  notify?: (msg: string) => void,
  fail?: (msg: string) => void,
): Promise<void> {
  const url = buildShareUrl(flowerBackendBaseUrl, flowerId);
  const shareTitle = title || 'My Petal Pixel flower';
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: shareTitle, url });
    } catch {
      /* user dismissed the share sheet — not an error */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    notify?.('Share link copied');
  } catch {
    fail?.('Could not copy the share link.');
  }
}

function hueToHex(hue: number, saturation = 70, lightness = 52): string {
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Read a numeric field with a default; tolerates undefined/NaN. */
function num(obj: Record<string, number> | undefined, key: string, fallback: number): number {
  const v = obj?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** ColorStop.position → PaletteStop.pos; drop the optional r/g/b bytes. */
function toPalette(
  json: FlowerParamsJson['palette'] | undefined,
): Palette | undefined {
  if (!json) return undefined;
  const stops: PaletteStop[] = (json.stops ?? []).map((s) => ({ pos: s.position, hex: s.hex }));
  return { id: json.id ?? '', stops };
}

// ── snake_case → camelCase shape mappers (explicit per field) ─────────────────

function toClassic(o: Record<string, number> | undefined): ClassicParams {
  if (!o) return { ...DEFAULT_CLASSIC_PARAMS };
  const d = DEFAULT_CLASSIC_PARAMS;
  return {
    rows: num(o, 'rows', d.rows),
    cols: num(o, 'cols', d.cols),
    pNum: num(o, 'p_num', d.pNum),
    fD: num(o, 'f_d', d.fD),
    pLen: num(o, 'p_len', d.pLen),
    pSharp: num(o, 'p_sharp', d.pSharp),
    fHeight: num(o, 'f_height', d.fHeight),
    curve1: num(o, 'curve1', d.curve1),
    curve2: num(o, 'curve2', d.curve2),
    b: num(o, 'b', d.b),
    bNum: num(o, 'b_num', d.bNum),
  };
}

function toRose(o: Record<string, number> | undefined): RoseParams {
  if (!o) return { ...DEFAULT_ROSE_PARAMS };
  const d = DEFAULT_ROSE_PARAMS;
  return {
    opening: num(o, 'opening', d.opening),
    vDensity: num(o, 'v_density', d.vDensity),
    pAlign: num(o, 'p_align', d.pAlign),
    curve1: num(o, 'curve1', d.curve1),
    curve2: num(o, 'curve2', d.curve2),
  };
}

function toBloom(o: Record<string, number> | undefined): BloomParams {
  if (!o) return { ...DEFAULT_BLOOM_PARAMS };
  const d = DEFAULT_BLOOM_PARAMS;
  return {
    scale: num(o, 'scale', d.scale),
    opening: num(o, 'opening', d.opening),
    density: num(o, 'density', d.density),
    petalFreq: num(o, 'petal_freq', d.petalFreq),
    petalAmp: num(o, 'petal_amp', d.petalAmp),
    hangDown: num(o, 'hang_down', d.hangDown),
    fade: num(o, 'fade', d.fade),
    thetaStep: num(o, 'theta_step', d.thetaStep),
    rStep: num(o, 'r_step', d.rStep),
    satShift: num(o, 'sat_shift', d.satShift),
    briShift: num(o, 'bri_shift', d.briShift),
  };
}

function toSunflower(o: Record<string, number> | undefined): SunflowerParams {
  return {
    scale: num(o, 'scale', 1),
    floretRings: num(o, 'floret_rings', 12),
    floretSpokes: num(o, 'floret_spokes', 34),
    domeHeight: num(o, 'dome_height', 0.2),
    discRatio: num(o, 'disc_ratio', 0.6),
    rayPetals: num(o, 'ray_petals', 21),
    rayLength: num(o, 'ray_length', 1),
    rayWidth: num(o, 'ray_width', 0.3),
    seedPacking: num(o, 'seed_packing', 1),
    satShift: num(o, 'sat_shift', 0),
    briShift: num(o, 'bri_shift', 0),
  };
}

function toRhodonea(o: Record<string, number> | undefined): RhodoneaParams {
  return {
    radius: num(o, 'radius', 1),
    k: num(o, 'k', 5),
    petalSpan: num(o, 'petal_span', 2),
    widthProfile: num(o, 'width_profile', 0.5),
    heightProfile: num(o, 'height_profile', 0.3),
    thickness: num(o, 'thickness', 0.1),
    curl: num(o, 'curl', 0.2),
    lengthSeg: num(o, 'length_seg', 40),
    widthSeg: num(o, 'width_seg', 16),
    satShift: num(o, 'sat_shift', 0),
    briShift: num(o, 'bri_shift', 0),
  };
}

function toSuperformula(o: Record<string, number> | undefined): SuperformulaParams {
  return {
    scale: num(o, 'scale', 1),
    m1: num(o, 'm1', 6),
    n1a: num(o, 'n1a', 1),
    n2a: num(o, 'n2a', 1),
    n3a: num(o, 'n3a', 1),
    a1: num(o, 'a1', 1),
    b1: num(o, 'b1', 1),
    m2: num(o, 'm2', 6),
    n1b: num(o, 'n1b', 1),
    n2b: num(o, 'n2b', 1),
    n3b: num(o, 'n3b', 1),
    a2: num(o, 'a2', 1),
    b2: num(o, 'b2', 1),
    uSeg: num(o, 'u_seg', 120),
    vSeg: num(o, 'v_seg', 60),
    satShift: num(o, 'sat_shift', 0),
    briShift: num(o, 'bri_shift', 0),
  };
}

const BLOOM_FAMILIES: readonly FlowerFamily[] = ['zinnia', 'camellia', 'lotus', 'dahlia'];

/**
 * Pure: persisted backend JSON (snake_case) → frontend `FlowerParams`. A v2
 * record (algo_version==='v2' && family present) fills family/palette + exactly
 * one nested shape param object; a v1 record fills only the flat fields. Never
 * throws — missing fields fall back to defaults so the render path always has a
 * complete bundle.
 */
export function mapBackendJsonToFlowerParams(
  flowerId: string,
  json: FlowerParamsJson,
): FlowerParams {
  const seedNum = num(json as unknown as Record<string, number>, 'seed', 0);
  const hue = num(json as unknown as Record<string, number>, 'hue', 200);
  const baseCount = Math.max(3, num(json as unknown as Record<string, number>, 'petal_count', 6));

  // Fields shared by both v1 and v2 records.
  const common: FlowerParams = {
    flowerId,
    algoVersion: json.algo_version ?? 'v1',
    schemaVersion: json.schema_version ?? 'v1',
    seed: String(seedNum),

    flowerType: 'classic',
    classicParams: { ...DEFAULT_CLASSIC_PARAMS },
    roseParams: { ...DEFAULT_ROSE_PARAMS },
    bloomParams: { ...DEFAULT_BLOOM_PARAMS },

    petalCount: baseCount,
    petalLength: clamp(num(json as unknown as Record<string, number>, 'petal_length', 1.2), 0.25, 3),
    petalSharpness: clamp(num(json as unknown as Record<string, number>, 'petal_width', 0.5), 0.05, 1.4),
    noiseIntensity: clamp(Math.abs(num(json as unknown as Record<string, number>, 'curvature', 0.2)), 0, 1),
    frequency: 1 + (((seedNum % 6) + 6) % 6),
    rotation: ((seedNum % 360) + 360) % 360,
    symmetry: clamp(baseCount, 3, 18),
    colorA: hueToHex(hue, 72, 52),
    colorB: hueToHex((hue + 48) % 360, 66, 45),
    glowIntensity: 0.5,
    material: 'metallic',
    idleMotion: true,
    rotationSpeed: 0.5,
    stemEnabled: num(json as unknown as Record<string, number>, 'stem_height', 0) > 0.95,
  };

  const family = json.family;
  const isKnownFamily = !!family && (V2_FAMILIES as readonly string[]).includes(family);

  // ── v1 (or family-less) path ────────────────────────────────────────────────
  if (json.algo_version !== 'v2' || !isKnownFamily) {
    return common;
  }

  // ── v2 path ─────────────────────────────────────────────────────────────────
  const fam = family as FlowerFamily;
  const palette = toPalette(json.palette);
  const out: FlowerParams = {
    ...common,
    family: fam,
    palette,
    // Reuse the shared slots for the 6 existing families; leave others default.
    flowerType: (FLOWER_TYPES as readonly string[]).includes(fam)
      ? (fam as FlowerType)
      : common.flowerType,
    stemEnabled: false, // v2 flowers never inherit a v1 stem
  };

  if (fam === 'rose') {
    out.roseParams = toRose(json.rose);
  } else if (BLOOM_FAMILIES.includes(fam)) {
    out.bloomParams = toBloom(json.bloom);
  } else if (fam === 'sunflower') {
    out.sunflowerParams = toSunflower(json.sunflower);
  } else if (fam === 'rhodonea') {
    out.rhodoneaParams = toRhodonea(json.rhodonea);
  } else if (fam === 'superformula') {
    out.superformulaParams = toSuperformula(json.superformula);
  } else {
    // classic (and any fallthrough): tolerate a missing shape object.
    out.classicParams = toClassic(json.classic);
  }

  return out;
}
