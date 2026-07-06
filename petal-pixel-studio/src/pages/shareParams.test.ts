import { describe, it, expect } from 'vitest';
import { buildShareUrl } from '@/integrations/flowerBackend/client';
import type { FlowerParamsJson } from '@/integrations/flowerBackend/client';
import { mapBackendJsonToFlowerParams } from './shareParams';
import { isV2 } from '@/math/flowerVersion';
import { DEFAULT_CLASSIC_PARAMS } from '@/math/flowerTypes';

// ── buildShareUrl (pure, backend /share/ route) ───────────────────────────────
describe('buildShareUrl', () => {
  it('joins the backend base URL with /share/<id>', () => {
    expect(buildShareUrl('https://petal.app', 'abc123')).toBe('https://petal.app/share/abc123');
  });

  it('collapses a trailing slash on the base URL (no double slash)', () => {
    expect(buildShareUrl('https://petal.app/', 'abc')).toBe('https://petal.app/share/abc');
  });

  it('collapses multiple trailing slashes', () => {
    expect(buildShareUrl('https://petal.app///', 'abc')).toBe('https://petal.app/share/abc');
  });

  it('encodeURIComponent-encodes ids with special characters', () => {
    expect(buildShareUrl('https://petal.app', 'a/b?c')).toBe('https://petal.app/share/a%2Fb%3Fc');
  });

  it('works with the default localhost backend base', () => {
    expect(buildShareUrl('http://localhost:50051', 'flw_0011223344556677')).toBe(
      'http://localhost:50051/share/flw_0011223344556677',
    );
  });
});

// A minimal v1 record as it lands over HTTP.
function v1Json(overrides: Partial<FlowerParamsJson> = {}): FlowerParamsJson {
  return {
    algo_version: 'v1',
    schema_version: 'v1',
    seed: 42,
    petal_count: 7,
    petal_length: 1.5,
    petal_width: 0.6,
    curvature: 0.2,
    stem_height: 1.0,
    hue: 120,
    ...overrides,
  };
}

// ── v1 mapper ─────────────────────────────────────────────────────────────────
describe('mapBackendJsonToFlowerParams — v1', () => {
  it('maps the flat v1 fields and routes to the v1 render path', () => {
    const p = mapBackendJsonToFlowerParams('id1', v1Json());
    expect(p.flowerId).toBe('id1');
    expect(p.algoVersion).toBe('v1');
    expect(p.seed).toBe('42'); // seed is a string in FlowerParams
    expect(p.petalCount).toBe(7);
    expect(p.family).toBeUndefined();
    expect(p.palette).toBeUndefined();
    expect(p.stemEnabled).toBe(true); // stem_height (1.0) > 0.95
    // colors derive from hue via hsl(...)
    expect(p.colorA).toMatch(/^hsl\(/);
    expect(p.colorB).toMatch(/^hsl\(/);
    expect(isV2(p)).toBe(false);
  });

  it('treats a low stem_height as stemEnabled:false', () => {
    const p = mapBackendJsonToFlowerParams('id2', v1Json({ stem_height: 0.5 }));
    expect(p.stemEnabled).toBe(false);
  });

  it('never throws on a mostly-empty record and falls back to sane defaults', () => {
    const p = mapBackendJsonToFlowerParams('id3', { algo_version: 'v1' } as FlowerParamsJson);
    expect(p.flowerId).toBe('id3');
    expect(p.petalCount).toBeGreaterThanOrEqual(3);
    expect(isV2(p)).toBe(false);
  });
});

// ── v2 mapper ─────────────────────────────────────────────────────────────────
describe('mapBackendJsonToFlowerParams — v2', () => {
  const palette = {
    id: 'pal-1',
    stops: [
      { position: 0, hex: '#ff0000' },
      { position: 1, hex: '#0000ff' },
    ],
  };

  it('maps rhodonea shape (snake→camel) and palette (position→pos)', () => {
    const p = mapBackendJsonToFlowerParams('r1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'rhodonea',
      palette,
      rhodonea: {
        radius: 1,
        k: 5,
        petal_span: 2,
        width_profile: 0.5,
        height_profile: 0.3,
        thickness: 0.1,
        curl: 0.2,
        length_seg: 40,
        width_seg: 16,
        sat_shift: 0,
        bri_shift: 0,
      },
    });
    expect(p.family).toBe('rhodonea');
    expect(p.palette?.id).toBe('pal-1');
    expect(p.palette?.stops[0]).toEqual({ pos: 0, hex: '#ff0000' });
    expect(p.rhodoneaParams?.widthProfile).toBe(0.5);
    expect(p.rhodoneaParams?.lengthSeg).toBe(40);
    expect(p.rhodoneaParams?.widthSeg).toBe(16);
    expect(p.rhodoneaParams?.petalSpan).toBe(2);
    expect(isV2(p)).toBe(true);
  });

  it('maps classic shape (p_num/f_d/p_len/p_sharp/f_height/b_num)', () => {
    const p = mapBackendJsonToFlowerParams('c1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'classic',
      palette,
      classic: {
        rows: 80,
        cols: 140,
        p_num: 5,
        f_d: 190,
        p_len: 54,
        p_sharp: 0.32,
        f_height: 320,
        curve1: 1.05,
        curve2: 0.24,
        b: 1.15,
        b_num: 7,
      },
    });
    expect(p.family).toBe('classic');
    expect(p.classicParams.pNum).toBe(5);
    expect(p.classicParams.fD).toBe(190);
    expect(p.classicParams.pLen).toBe(54);
    expect(p.classicParams.pSharp).toBe(0.32);
    expect(p.classicParams.fHeight).toBe(320);
    expect(p.classicParams.bNum).toBe(7);
    expect(isV2(p)).toBe(true);
  });

  it('maps rose shape', () => {
    const p = mapBackendJsonToFlowerParams('ro1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'rose',
      palette,
      rose: { opening: 2.6, v_density: 9.2, p_align: 3.15, curve1: 1.7, curve2: 1.12 },
    });
    expect(p.family).toBe('rose');
    expect(p.roseParams.opening).toBe(2.6);
    expect(p.roseParams.vDensity).toBe(9.2);
    expect(p.roseParams.pAlign).toBe(3.15);
    expect(isV2(p)).toBe(true);
  });

  it('maps bloom shape (petal_freq/theta_step/r_step) for a bloom family', () => {
    const p = mapBackendJsonToFlowerParams('b1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'zinnia',
      palette,
      bloom: {
        scale: 300,
        opening: 1,
        density: 1,
        petal_freq: 3,
        petal_amp: 1,
        hang_down: 1,
        fade: 1,
        theta_step: 0.5,
        r_step: 0.25,
        sat_shift: 0,
        bri_shift: 0,
      },
    });
    expect(p.family).toBe('zinnia');
    expect(p.bloomParams.petalFreq).toBe(3);
    expect(p.bloomParams.thetaStep).toBe(0.5);
    expect(p.bloomParams.rStep).toBe(0.25);
    expect(isV2(p)).toBe(true);
  });

  it('maps sunflower shape (floret_rings/ray_petals/ray_width)', () => {
    const p = mapBackendJsonToFlowerParams('s1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'sunflower',
      palette,
      sunflower: {
        scale: 1,
        floret_rings: 12,
        floret_spokes: 34,
        dome_height: 0.2,
        disc_ratio: 0.6,
        ray_petals: 21,
        ray_length: 1,
        ray_width: 0.3,
        seed_packing: 1,
        sat_shift: 0,
        bri_shift: 0,
      },
    });
    expect(p.family).toBe('sunflower');
    expect(p.sunflowerParams?.floretRings).toBe(12);
    expect(p.sunflowerParams?.rayPetals).toBe(21);
    expect(p.sunflowerParams?.rayWidth).toBe(0.3);
    expect(isV2(p)).toBe(true);
  });

  it('maps superformula shape (u_seg/v_seg/n1a)', () => {
    const p = mapBackendJsonToFlowerParams('sf1', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'superformula',
      palette,
      superformula: {
        scale: 1,
        m1: 6,
        n1a: 1,
        n2a: 1,
        n3a: 1,
        a1: 1,
        b1: 1,
        m2: 6,
        n1b: 1,
        n2b: 1,
        n3b: 1,
        a2: 1,
        b2: 1,
        u_seg: 120,
        v_seg: 60,
        sat_shift: 0,
        bri_shift: 0,
      },
    });
    expect(p.family).toBe('superformula');
    expect(p.superformulaParams?.uSeg).toBe(120);
    expect(p.superformulaParams?.vSeg).toBe(60);
    expect(p.superformulaParams?.n1a).toBe(1);
    expect(isV2(p)).toBe(true);
  });

  it('falls back to DEFAULT_CLASSIC_PARAMS when family=classic but the classic object is missing (no throw)', () => {
    const p = mapBackendJsonToFlowerParams('c-degenerate', {
      ...v1Json(),
      algo_version: 'v2',
      family: 'classic',
      palette,
    });
    expect(p.family).toBe('classic');
    expect(p.classicParams).toEqual(DEFAULT_CLASSIC_PARAMS);
    expect(isV2(p)).toBe(true);
  });

  it('does not route to v2 when family is missing even if algo_version==="v2"', () => {
    const p = mapBackendJsonToFlowerParams('x', { ...v1Json(), algo_version: 'v2' });
    expect(isV2(p)).toBe(false);
  });
});
