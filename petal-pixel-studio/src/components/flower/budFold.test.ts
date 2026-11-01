import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { bakeFlower, foldedMaterial, foldShader } from "./budFold";

/** A flat disc of points around the origin, with a tall strand at the centre. */
function disc(): THREE.BufferGeometry {
  const points: number[] = [];
  for (let ring = 1; ring <= 10; ring += 1) {
    for (let i = 0; i < 40; i += 1) {
      const angle = (i / 40) * Math.PI * 2;
      points.push(Math.cos(angle) * ring * 10, 0, Math.sin(angle) * ring * 10);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.computeVertexNormals();
  return g;
}

describe("bakeFlower", () => {
  it("leaves the source geometry alone", () => {
    const source = disc();
    const before = Array.from(source.attributes.position.array);
    bakeFlower(source, "rose");
    expect(Array.from(source.attributes.position.array)).toEqual(before);
  });

  it("puts the farthest point at distance 1", () => {
    const { geometry } = bakeFlower(disc(), "rose");
    const pos = geometry.attributes.position;
    let far = 0;
    for (let i = 0; i < pos.count; i += 1) far = Math.max(far, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
    expect(far).toBeCloseTo(1, 5);
  });

  it("finds where the petals start, as a share of the flower's reach", () => {
    const { floor } = bakeFlower(disc(), "rose");
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(0.5);
  });

  it("measures how far the petals lean from upright", () => {
    const { alphaMax } = bakeFlower(disc(), "rose");
    expect(alphaMax).toBeGreaterThan(1.4);
    expect(alphaMax).toBeLessThanOrEqual(Math.PI);
  });
});

describe("foldShader", () => {
  it("guards the point where atan is undefined", () => {
    expect(foldShader).toContain("rhoBud > 1e-5");
  });
});

describe("foldedMaterial", () => {
  it("shares one growth value with every flower given it", () => {
    const growth = { value: 0.5 };
    const a = foldedMaterial("#ffffff", 1, 0.1, growth);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>" };
    a.onBeforeCompile(shader as never, undefined as never);
    expect((shader.uniforms as Record<string, unknown>).uGrow).toBe(growth);
    expect(shader.vertexShader).toContain("petalFold");
    expect(shader.vertexShader).not.toContain("#include <begin_vertex>");
  });
});
