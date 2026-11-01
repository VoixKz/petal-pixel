import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the garden API BEFORE importing the store (matches flowerStore.test.ts) ──
vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => "user-123"),
  listGarden: vi.fn(async () => []),
  upsertGardenFlower: vi.fn(async () => undefined),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: vi.fn(async () => undefined),
}));

// gRPC client is mocked; each test sets its return value.
const createFlowerViaGrpc = vi.fn();
vi.mock("@/integrations/flowerBackend/client", () => ({
  createFlowerViaGrpc: (name: string) => createFlowerViaGrpc(name),
}));

import { useFlowerStore } from "./flowerStore";

const V2_PALETTE = {
  id: "sunset_coral",
  stops: [
    { position: 0, hex: "#ffb07c", r: 1, g: 0.69, b: 0.49 },
    { position: 1, hex: "#c2185b", r: 0.76, g: 0.09, b: 0.36 },
  ],
  hueShift: 4, satShift: 0.1, briShift: -0.05,
};

const SUNFLOWER = {
  scale: 300, floretRings: 90, floretSpokes: 220, domeHeight: 40, discRatio: 0.6,
  rayPetals: 34, rayLength: 0.5, rayWidth: 0.8, seedPacking: 1, satShift: 0.05, briShift: -0.02,
};

const RHODONEA = {
  radius: 260, k: 5, petalSpan: 0.9, widthProfile: 0.5, heightProfile: 40,
  thickness: 6, curl: 0.5, lengthSeg: 40, widthSeg: 24, satShift: 0.03, briShift: -0.01,
};

const SUPERFORMULA = {
  scale: 300, m1: 6, n1a: 0.6, n2a: 1, n3a: 1, a1: 1, b1: 1,
  m2: 3, n1b: 0.8, n2b: 1, n3b: 1, a2: 1, b2: 1, uSeg: 160, vSeg: 100,
  satShift: 0.04, briShift: -0.03,
};

function v2ResponseFor(family: string, shapeCase: string, value: unknown) {
  return {
    flowerId: `flower-${family}`,
    params: {
      algoVersion: "v2", schemaVersion: "v2", seed: 99n,
      petalCount: 8, petalLength: 1.2, petalWidth: 0.5, curvature: 0.2, stemHeight: 1, hue: 40,
      family, palette: V2_PALETTE, shape: { case: shapeCase, value },
    },
  };
}

function v2Response() {
  // Shape mirrors connect-es FlowerParams: scalars 1-9 + family + palette + oneof `shape`.
  return {
    flowerId: "flower-v2",
    params: {
      algoVersion: "v2", schemaVersion: "v2", seed: 42n,
      petalCount: 8, petalLength: 1.2, petalWidth: 0.5, curvature: 0.2, stemHeight: 1, hue: 40,
      family: "sunflower",
      palette: V2_PALETTE,
      shape: { case: "sunflower", value: SUNFLOWER },
    },
  };
}

function v1Response() {
  return {
    flowerId: "flower-v1",
    params: {
      algoVersion: "v1", schemaVersion: "v1", seed: 7n,
      petalCount: 6, petalLength: 1.2, petalWidth: 0.5, curvature: 0.2, stemHeight: 1, hue: 120,
      family: "", palette: undefined, shape: { case: undefined, value: undefined },
    },
  };
}

describe("generateFromWord v2 branch", () => {
  beforeEach(() => {
    createFlowerViaGrpc.mockReset();
    useFlowerStore.setState({
      editingFlowerId: null,
      params: { ...useFlowerStore.getState().params, family: undefined, palette: undefined, sunflowerParams: undefined, rhodoneaParams: undefined, superformulaParams: undefined },
    });
  });

  it("stores family + palette + family params for a v2 backend response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v2Response());

    await useFlowerStore.getState().generateFromWord("golden fields");

    const p = useFlowerStore.getState().params;
    expect(p.algoVersion).toBe("v2");
    expect(p.family).toBe("sunflower");
    expect(p.palette?.id).toBe("sunset_coral");
    // toV2Params maps proto ColorStop.position -> PaletteStop.pos.
    expect(p.palette?.stops[0].pos).toBe(0);
    expect(p.palette?.stops[1].hex).toBe("#c2185b");
    expect(p.sunflowerParams?.rayPetals).toBe(34);
    expect(p.flowerId).toBe("flower-v2");
  });

  it("leaves the v1 path unchanged for a v1 backend response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v1Response());

    await useFlowerStore.getState().generateFromWord("classic");

    const p = useFlowerStore.getState().params;
    expect(p.algoVersion).toBe("v1");
    expect(p.family).toBeUndefined();          // v2 fields NOT populated on v1 path
    expect(p.palette).toBeUndefined();
    expect(p.sunflowerParams).toBeUndefined();
    expect(p.flowerId).toBe("flower-v1");
    // v1 scalar-derived color still set (v1 path untouched).
    expect(p.colorA).toContain("hsl");
  });

  it("stores rhodoneaParams for a rhodonea v2 response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v2ResponseFor("rhodonea", "rhodonea", RHODONEA));
    await useFlowerStore.getState().generateFromWord("rose curve");
    const p = useFlowerStore.getState().params;
    expect(p.family).toBe("rhodonea");
    expect(p.rhodoneaParams?.k).toBe(5);
    expect(p.superformulaParams).toBeUndefined();
  });

  it("stores superformulaParams for a superformula v2 response", async () => {
    createFlowerViaGrpc.mockResolvedValue(v2ResponseFor("superformula", "superformula", SUPERFORMULA));
    await useFlowerStore.getState().generateFromWord("gielis");
    const p = useFlowerStore.getState().params;
    expect(p.family).toBe("superformula");
    expect(p.superformulaParams?.m1).toBe(6);
    expect(p.rhodoneaParams).toBeUndefined();
  });

  it("sets deterministic v2 colors, overriding any leftover v1 hsl (bleed regression)", async () => {
    // v1 first: colorA/colorB become hue-derived hsl(...) and linger in params.
    createFlowerViaGrpc.mockResolvedValue(v1Response());
    await useFlowerStore.getState().generateFromWord("classic");
    expect(useFlowerStore.getState().params.colorA).toContain("hsl");

    // Then v2: the v2 branch must OVERRIDE the leftover hsl with the fixed shared
    // constants so the studio emissive/point-light tint matches the /share render
    // (shareParams' v2 arm uses the same V2_COLOR_A/V2_COLOR_B).
    createFlowerViaGrpc.mockResolvedValue(v2Response());
    await useFlowerStore.getState().generateFromWord("golden fields");
    const p = useFlowerStore.getState().params;
    expect(p.colorA).toBe("#10b981");
    expect(p.colorB).toBe("#2563eb");
  });
});
