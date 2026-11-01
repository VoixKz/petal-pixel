import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildShareUrl,
  fetchFlowerById,
  postFlowerPreview,
  flowerBackendBaseUrl,
  type FlowerListItem,
} from './client';

const sampleItem: FlowerListItem = {
  flower_id: 'flw_0011223344556677',
  person_name: 'Ada',
  params: {
    algo_version: 'v1',
    schema_version: 'v1',
    seed: 42,
    petal_count: 7,
    petal_length: 1.5,
    petal_width: 0.6,
    curvature: 0.2,
    stem_height: 1,
    hue: 120,
  },
  mint_status: '',
  tx_hash: '',
  token_uri: '',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildShareUrl', () => {
  it('targets the backend /share/ route', () => {
    expect(buildShareUrl(flowerBackendBaseUrl, 'abc')).toBe(`${flowerBackendBaseUrl}/share/abc`);
  });
});

describe('fetchFlowerById', () => {
  it('returns the parsed item for a bare flower object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(sampleItem), { status: 200 })),
    );
    const item = await fetchFlowerById('flw_0011223344556677');
    expect(item.flower_id).toBe('flw_0011223344556677');
    expect(item.person_name).toBe('Ada');
  });

  it('unwraps a { flower: … } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ flower: sampleItem }), { status: 200 })),
    );
    const item = await fetchFlowerById('flw_0011223344556677');
    expect(item.flower_id).toBe('flw_0011223344556677');
  });

  it('rejects with not_found on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"not found"}', { status: 404 })),
    );
    await expect(fetchFlowerById('missing')).rejects.toThrow('not_found');
  });

  it('rejects on a non-ok, non-404 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    await expect(fetchFlowerById('x')).rejects.toThrow(/500/);
  });

  it('preserves a full uint64 seed as an exact decimal string (no double truncation)', async () => {
    // Backend serializes `seed` as an UNQUOTED JSON number. A raw JSON.parse
    // would truncate this to 14198260184116937000 (a double); fetchFlowerById
    // must quote it first so it lands as the exact string.
    const BIG_SEED = '14198260184116936936';
    const raw = `{"flower_id":"flw_big","person_name":"Ada","params":{"algo_version":"v1","schema_version":"v1","seed":${BIG_SEED},"petal_count":7,"petal_length":1.5,"petal_width":0.6,"curvature":0.2,"stem_height":1,"hue":120},"mint_status":"","tx_hash":"","token_uri":""}`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(raw, { status: 200 })));

    const item = await fetchFlowerById('flw_big');
    expect(item.params.seed).toBe(BIG_SEED);
    // Guard: a naive JSON.parse of the same body loses the low digits.
    expect((JSON.parse(raw) as typeof item).params.seed).not.toBe(BIG_SEED);
  });
});

describe('postFlowerPreview', () => {
  it('returns true when the POST is ok', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await expect(postFlowerPreview('flw_x', blob)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('returns false (never throws) when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(postFlowerPreview('flw_x', blob)).resolves.toBe(false);
  });

  it('returns false when the endpoint responds non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(postFlowerPreview('flw_x', blob)).resolves.toBe(false);
  });
});
