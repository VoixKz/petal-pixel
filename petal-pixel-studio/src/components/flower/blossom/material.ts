// Every part of a plant is one small grid drawn many times. The vertex stage bends
// that grid into a petal for the moment of the plant's life being shown: wrapped
// around the closed bud, then swinging out into its open pose. Doing this on the GPU
// lets a whole plant grow at 60 fps from a single number.
import * as THREE from "three";
import { LIFE, PART_KIND, type Part } from "@/math/blossom/build";

const SPAN = 0.2;
/** How much later the tip of a petal unfurls than its base. */
const LAG = 0.06;
const KIND = { sepal: PART_KIND.sepal.toFixed(1), stamen: PART_KIND.stamen.toFixed(1) };
const TIP_BAND = 0.62;

export const POSE_GLSL = /* glsl */ `
attribute vec4 aShape;   // azimuth, depth, birth, length
attribute vec4 aBend;    // wrap, lean, curl, tipCurl
attribute vec3 aEdge;    // cup, phase, notch
attribute vec4 aForm;    // waist, blunt, rim, tilt
attribute float aKind;
attribute vec2 aShell;   // place in the closed bud, how much of it tilts
attribute vec4 aRoom;    // room toward the heart at base and tip, away from it at base and tip
attribute vec3 aBase;
attribute vec3 aMid;
attribute vec3 aTip;
uniform float uLife;
uniform vec4 uBud;       // radius, height, twist, ruffle
varying vec2 vGrid;
varying vec3 vBase;
varying vec3 vMid;
varying vec3 vTip;
varying float vDepth;
varying float vKind;
varying float vCore;
varying float vTone;
varying float vOpen;
varying float vRipe;
varying vec3 vToLamp;

float settle(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float softMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float outlineAt(float v) {
  return pow(max(sin(PI * pow(clamp(v, 0.0, 1.0), aForm.x)), 0.0), aForm.y);
}

// Every point of a petal is a reach from the heart, a lean from the upright axis and a
// turn around it. The closed bud is one shell scaled about the heart, and the open flower
// is a stack in which each petal knows its room, so they stay apart at every moment.
vec3 petalPoint(vec2 g) {
  float u = g.x;
  float v = clamp(g.y, 0.0, 1.0);
  bool sepal = aKind == ${KIND.sepal};
  bool stamen = aKind == ${KIND.stamen};
  float age = settle((uLife - aShape.z - ${LAG.toFixed(3)} * v) / ${SPAN.toFixed(3)});
  float ramp = smoothstep(0.0, 0.42, v);
  float across = u * u;
  float width = outlineAt(v);
  float side = aBend.x * mix(0.5, width, smoothstep(0.0, 0.34, v));

  // Closed: a scaled copy of the bud's surface, so a layer can only ever sit inside the last.
  float height = v * (sepal ? 0.62 : 1.0);
  float belly = sin(PI * pow(clamp(height, 0.0, 1.0), 0.74));
  float wrapped = u * side * 1.12;
  float shell = aShell.x + aShell.y * wrapped;
  float closedRadius = uBud.x * belly * shell;
  float closedHeight = uBud.y * height * shell;
  // A young bud is green: the petals are still short, hidden inside the sepals.
  float young = sepal ? 1.0 : mix(0.36, 1.0, smoothstep(${LIFE.swell[0].toFixed(3)}, ${LIFE.swell[1].toFixed(3)}, uLife));
  float closedReach = length(vec2(closedRadius, closedHeight)) * young;
  float closedLean = atan(closedRadius, closedHeight + 0.0001);

  // Open: the lean walks along the spine of the petal. Everything across it is a shift
  // of that lean, which moves a point straight off the surface, and stops short of the
  // neighbours above and below.
  float notch = 1.0 - aEdge.z * exp(-across * 9.0) * smoothstep(0.55, 1.0, v);
  float openReach = aShape.w * v * notch;
  // Tips roll back last of all, once a petal has room behind it.
  float rollBack = aBend.w > 0.0 ? aBend.w * smoothstep(0.45, 1.0, age) : aBend.w;
  float spine = aBend.y + aBend.z * v + rollBack * v * v * v + aForm.z * v * v * v * v;
  float rimRoll = 1.0 - (1.0 - v * v) * (1.0 - across * abs(u) * v);
  float shift = aForm.z * (rimRoll * rimRoll - v * v * v * v) + spine * (exp(-aEdge.x * across * ramp * width) - 1.0);
  float tip = smoothstep(${TIP_BAND.toFixed(3)}, 0.8, v);
  float room = shift > 0.0 ? mix(aRoom.z, aRoom.w, tip) : mix(aRoom.x, aRoom.y, tip);
  float openLean = spine + room * tanh(shift / room) + aForm.w * u * side * ramp;

  // A petal only ever opens. Since the outer ones go first, none can pass through another.
  closedLean = softMin(closedLean, openLean, 0.06);
  float reach = mix(closedReach, openReach, age);
  float lean = mix(closedLean, openLean, age);
  // A stamen stays a thin thread however close to the axis it stands.
  if (stamen) side = aBend.x * (v > 0.82 ? 3.2 : 1.0) / max(reach * sin(lean), 0.02);
  float closedTurn = wrapped + uBud.z * height;
  float turn = aShape.x + mix(closedTurn, u * side, age);
  // Waves belong to the place and not the petal, so all the layers ride them together.
  lean += uBud.w * age * smoothstep(0.2, 0.8, reach) * (sin(turn * 9.0 + reach * 6.0) + 0.5 * sin(turn * 19.0 - reach * 9.0));

  return vec3(reach * sin(lean) * cos(turn), reach * cos(lean), reach * sin(lean) * sin(turn));
}
`;

const SKIN = /* glsl */ `
uniform float uGlow;
uniform vec3 uLamp;
uniform vec3 uSun;
varying vec2 vGrid;
varying vec3 vBase;
varying vec3 vMid;
varying vec3 vTip;
varying float vDepth;
varying float vKind;
varying float vCore;
varying float vTone;
varying float vOpen;
varying float vRipe;
varying vec3 vToLamp;
`;

function spliceVertex(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: BlossomUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${POSE_GLSL}`)
    .replace("#include <begin_vertex>", "vec3 transformed = petalPoint(position.xy);");
}

export interface BlossomUniforms {
  uLife: { value: number };
  uBud: { value: THREE.Vector4 };
  uGlow: { value: number };
  uLamp: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
}

export function petalMaterial(uniforms: BlossomUniforms): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0,
    specularIntensity: 0.32,
    sheen: 0.4,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffffff"),
  });
  material.onBeforeCompile = (shader) => {
    spliceVertex(shader, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      /* glsl */ `
      float stepV = position.y > 0.5 ? -0.03 : 0.03;
      const vec3 LAMP = vec3(0.0, 0.26, 0.0);
      vec3 p0 = petalPoint(position.xy);
      vec3 pu = petalPoint(position.xy + vec2(position.x > 0.0 ? -0.03 : 0.03, 0.0));
      vec3 pv = petalPoint(position.xy + vec2(0.0, stepV));
      vec3 foldNormal = cross(pu - p0, pv - p0) * sign(stepV) * (position.x > 0.0 ? -1.0 : 1.0);
      vec3 objectNormal = dot(foldNormal, foldNormal) > 1e-16 ? normalize(foldNormal) : vec3(0.0, 1.0, 0.0);
      vGrid = position.xy;
      vBase = aBase;
      vMid = aMid;
      vTip = aTip;
      vDepth = aShape.y;
      vKind = aKind;
      vCore = length(p0 - LAMP);
      vToLamp = normalMatrix * (LAMP - p0);
      vTone = fract(aEdge.y * 7.3);
      vOpen = settle((uLife - aShape.z) / ${SPAN.toFixed(3)});
      vRipe = smoothstep(0.3, 0.5, uLife + position.y * 0.07 + aShape.y * 0.06);
      `,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKIN}`)
      .replace(
        "#include <lights_physical_fragment>",
        // Velvet takes the colour of the petal; on dark ones white sheen turns grey. Deep in
        // the flower nothing reflects the sky, or the shade there would wash out to mauve.
        "#include <lights_physical_fragment>\nmaterial.sheenColor *= diffuseColor.rgb * tucked;\nmaterial.specularColor *= tucked;\nmaterial.specularF90 *= tucked;",
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        float v = clamp(vGrid.y, 0.0, 1.0);
        vec3 petal = v < 0.5 ? mix(vBase, vMid, v * 2.0) : mix(vMid, vTip, (v - 0.5) * 2.0);
        // The heart of a flower is its deepest colour; a bud starts green and fills with it.
        if (vKind == 0.0) {
          petal = mix(petal, mix(vBase, vMid, 0.62), vDepth * 0.66);
          petal = mix(vec3(0.3, 0.42, 0.14), petal, vRipe);
        }
        // Fine veins fan out from the base, and they follow the width of the petal.
        float vein = 0.5 + 0.5 * sin(vGrid.x * (14.0 + 40.0 * v) + 2.0 * sin(vGrid.x * 7.0));
        petal *= 0.97 + 0.03 * vein;
        // No two petals are quite alike, and their thin edges catch more light.
        petal *= 0.93 + 0.14 * vTone;
        petal *= 1.0 + 0.14 * smoothstep(0.7, 1.0, abs(vGrid.x)) * smoothstep(0.1, 0.5, v);
        // No light reaches the base of a petal or the deep of the flower. Shade there
        // sinks into the petal's own colour, so pale flowers stay clean instead of grey.
        float tucked = vKind == ${KIND.sepal} ? 1.0 : mix(1.0, smoothstep(0.0, 0.66, v) * mix(1.0, 0.45, vDepth * (1.0 - v * 0.6)), vOpen);
        vec3 deep = max(vBase * vBase * 0.8, vec3(0.04)) + vBase * 0.1;
        diffuseColor.rgb = petal * mix(deep, vec3(1.0), tucked);
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        // Light bounced between petals takes their colour, so shadows stay rich, not grey.
        vec3 bounced = diffuseColor.rgb * diffuseColor.rgb;
        totalEmissiveRadiance += (1.0 - uGlow) * bounced * (0.16 + exp(-vCore * 2.2) * 0.34);
        // Thin petals let the sun through from behind.
        vec3 sun = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
        float behind = pow(clamp(0.5 - 0.5 * dot(normal, sun), 0.0, 1.0), 1.6);
        totalEmissiveRadiance += (1.0 - uGlow) * bounced * behind * (0.75 + 0.25 * v) * 0.22;
        // Night light: a lamp sits in the heart of the flower. Petals square-on to it take
        // the most light, which keeps the shape readable. What reaches the eye has passed
        // through the petal, so it comes out as the petal's own colour at full strength.
        float near = exp(-vCore * 1.5);
        float skin = vKind == ${KIND.sepal} ? 0.4 : 0.78 + 0.22 * (1.0 - abs(vGrid.x)) + 0.06 * vein;
        float square = 0.5 + 0.5 * abs(dot(normal, normalize(vToLamp)));
        float lit = near * 1.55 * square;
        vec3 through = pow(petal, vec3(2.0));
        through /= max(max(through.r, max(through.g, through.b)), 0.001);
        float hot = vKind == ${KIND.stamen} ? 0.12 : 0.7;
        totalEmissiveRadiance += uGlow * uLamp * skin * (through * (lit + 0.05) + near * near * near * near * hot);
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-petal";
  return material;
}

/** Without this the shadow would keep the shape of the flat grid. */
export function petalDepthMaterial(uniforms: BlossomUniforms): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => spliceVertex(shader, uniforms);
  material.customProgramCacheKey = () => "blossom-depth";
  return material;
}

/** One grid, drawn once for each part. */
export function partsGeometry(parts: Part[]): THREE.InstancedBufferGeometry {
  const grid = new THREE.PlaneGeometry(2, 1, 16, 28);
  grid.translate(0, 0.5, 0);
  const rows = grid.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rows.count; i += 1) rows.setY(i, 1 - (1 - rows.getY(i)) ** 1.5);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = grid.index;
  geometry.setAttribute("position", grid.attributes.position);
  geometry.setAttribute("normal", grid.attributes.normal);
  geometry.setAttribute("uv", grid.attributes.uv);
  geometry.instanceCount = parts.length;

  const array = (size: number, fill: (p: Part) => number[]) =>
    new THREE.InstancedBufferAttribute(new Float32Array(parts.flatMap(fill)), size);
  const rgb = (hex: string) => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  geometry.setAttribute("aShape", array(4, (p) => [p.azimuth, p.depth, p.birth, p.length]));
  geometry.setAttribute("aBend", array(4, (p) => [p.wrap, p.lean, p.curl, p.tipCurl]));
  geometry.setAttribute("aEdge", array(3, (p) => [p.cup, p.phase, p.notch]));
  geometry.setAttribute("aForm", array(4, (p) => [p.waist, p.blunt, p.rim, p.tilt]));
  geometry.setAttribute("aKind", array(1, (p) => [p.kind]));
  geometry.setAttribute("aShell", array(2, (p) => [p.shell, p.shellTilt]));
  geometry.setAttribute("aRoom", array(4, (p) => [p.room.inBase, p.room.inTip, p.room.outBase, p.room.outTip]));
  geometry.setAttribute("aBase", array(3, (p) => rgb(p.colour[0])));
  geometry.setAttribute("aMid", array(3, (p) => rgb(p.colour[1])));
  geometry.setAttribute("aTip", array(3, (p) => rgb(p.colour[2])));
  return geometry;
}

