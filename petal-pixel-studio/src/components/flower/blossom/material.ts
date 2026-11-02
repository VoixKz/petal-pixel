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
/** Half the distance between a petal's two faces, at its base and at its tip. */
const THICK = [0.015, 0.0055];
/** How much of a petal's room its thickness may take; the rest is left for it to cup. */
const SKIN_ROOM = 0.34;

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
vec3 petalPoint(vec3 g) {
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
  float roomIn = mix(aRoom.x, aRoom.y, tip);
  float roomOut = mix(aRoom.z, aRoom.w, tip);
  float room = (shift > 0.0 ? roomOut : roomIn) * ${(1 - SKIN_ROOM).toFixed(3)};
  // A petal has two faces, g.z tells them apart: +1 looks at the heart and -1 away from it.
  // They stand furthest apart at the base and meet in a rounded rim, inside the room above.
  float thick = (stamen ? 0.0 : sepal ? 0.45 : 1.0) * mix(${THICK[0].toFixed(4)}, ${THICK[1].toFixed(4)}, v) * sqrt(max(1.0 - across * across, 0.0)) * sqrt(max(1.0 - v * v * v * v * v * v * v * v, 0.0));
  float skin = min(thick / max(openReach, 0.18), ${SKIN_ROOM.toFixed(3)} * (g.z > 0.0 ? roomIn : roomOut));
  float openLean = spine + room * tanh(shift / room) + aForm.w * u * side * ramp - g.z * skin;

  // A petal only ever opens. Since the outer ones go first, none can pass through another.
  closedLean = softMin(closedLean, openLean, 0.06);
  float reach = mix(closedReach, openReach, age);
  float lean = mix(closedLean, openLean, age);
  // A stamen stays a thin thread however close to the axis it stands.
  if (stamen) side = aBend.x * (v > 0.82 ? 3.2 : 1.0) / max(reach * sin(lean), 0.02);
  float closedTurn = wrapped + uBud.z * height;
  float turn = aShape.x + mix(closedTurn, u * side, age);
  // Waves belong to the place and not the petal, so all the layers ride them together.
  lean += uBud.w * age * smoothstep(0.2, 0.8, reach) * (sin(turn * 9.0 + reach * 6.0) + 0.35 * sin(turn * 13.0 - reach * 8.0));

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
    .replace("#include <begin_vertex>", "vec3 transformed = petalPoint(position);");
}

export interface BlossomUniforms {
  uLife: { value: number };
  uBud: { value: THREE.Vector4 };
  uGlow: { value: number };
  uLamp: { value: THREE.Color };
  uSun: { value: THREE.Vector3 };
}

/** With `solid` a petal is two faces around a thickness, each seen from outside only. */
export function petalMaterial(uniforms: BlossomUniforms, solid: boolean): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    side: solid ? THREE.FrontSide : THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
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
      // The folds of a petal come from its middle: its two faces pinch together at the rim,
      // and that pinch would show as a dimple. The rim gets its own turn from face to face.
      vec3 middle = vec3(position.xy, 0.0);
      vec3 p0 = petalPoint(middle);
      vec3 pu = petalPoint(middle + vec3(position.x > 0.0 ? -0.03 : 0.03, 0.0, 0.0));
      vec3 pv = petalPoint(middle + vec3(0.0, stepV, 0.0));
      vec3 foldNormal = cross(pu - p0, pv - p0) * sign(stepV) * (position.x > 0.0 ? -1.0 : 1.0);
      vec3 objectNormal = dot(foldNormal, foldNormal) > 1e-16 ? normalize(foldNormal) : vec3(0.0, 1.0, 0.0);
      if (position.z < 0.0) objectNormal = -objectNormal;
      if (position.z != 0.0) {
        vec3 sideways = p0 - pu;
        vec3 onward = (pv - p0) * sign(stepV);
        vec3 rim = vec3(0.0);
        if (dot(sideways, sideways) > 1e-8) rim += normalize(sideways) * smoothstep(0.75, 1.0, abs(position.x));
        if (dot(onward, onward) > 1e-8) rim += normalize(onward) * smoothstep(0.86, 1.0, position.y);
        objectNormal = normalize(objectNormal + rim * 0.35);
      }
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
        if (vKind == ${KIND.sepal}) petal *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.14, abs(vGrid.x)));
        float tucked = vKind == ${KIND.sepal} ? 1.0 : mix(1.0, smoothstep(0.0, 0.66, v) * mix(1.0, 0.45, vDepth * (1.0 - v * 0.6)), vOpen);
        vec3 deep = max(vBase * vBase * 0.8, vec3(0.04)) + vBase * 0.1;
        diffuseColor.rgb = petal * mix(deep, vec3(1.0), tucked);
        `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        // Fine ribs and long soft folds, which give the light something to catch. The ribs
        // fade once they get smaller than a pixel, or they would only shimmer.
        float ribWidth = 14.0 + 40.0 * v;
        float ribs = sin(vGrid.x * ribWidth + 2.0 * sin(vGrid.x * 7.0)) * (1.0 - smoothstep(0.35, 1.2, fwidth(vGrid.x) * ribWidth));
        float folds = sin(vGrid.x * 3.6 + vTone * 6.28 + v * 3.0) * smoothstep(0.08, 0.6, v);
        float relief = (ribs * 0.0007 + folds * 0.0065) * (vKind == ${KIND.stamen} ? 0.0 : 1.0);
        vec3 acrossView = dFdx(-vViewPosition);
        vec3 upView = dFdy(-vViewPosition);
        vec3 r1 = cross(upView, normal);
        vec3 r2 = cross(normal, acrossView);
        float area = dot(acrossView, r1) * faceDirection;
        vec3 slope = sign(area) * (dFdx(relief) * r1 + dFdy(relief) * r2);
        // At a glancing angle the sums above break into pixel noise, so the relief lets go.
        vec3 toEye = normalize(vViewPosition);
        float facing = abs(dot(normal, toEye));
        normal = normalize(abs(area) * normal - slope * smoothstep(0.1, 0.45, facing));
        // Seen along its edge, a petal's triangles take turns facing the eye and away from it,
        // and their opposite light would show as a comb. Turned to the eye, they all agree.
        normal = normalize(mix(normal, toEye, 1.0 - smoothstep(0.0, 0.28, facing)));
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        // Light bounced between petals takes their colour, so shadows stay rich, not grey.
        // On a pale petal the base colour carries that, or its shadows would turn grey.
        vec3 bounced = diffuseColor.rgb * mix(diffuseColor.rgb, vBase, 0.6);
        totalEmissiveRadiance += (1.0 - uGlow) * bounced * (0.16 + exp(-vCore * 2.2) * 0.34);
        // Thin petals let the sun through from behind.
        vec3 sun = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
        float behind = pow(clamp(0.5 - 0.5 * dot(normal, sun), 0.0, 1.0), 1.6);
        totalEmissiveRadiance += (1.0 - uGlow) * bounced * behind * (0.75 + 0.25 * v) * 0.22;
        // Night light: a lamp sits in the heart of the flower. The face turned to it is bright
        // and pale; a face we see from outside shows light that came through the petal, deeper
        // in colour. Either way a surface dims as it turns away from the eye, like a paper
        // lantern, and that falloff is what makes a glowing petal look round and not flat.
        float near = exp(-vCore * 1.5);
        float skin = vKind == ${KIND.sepal} ? 0.34 : 0.78 + 0.22 * (1.0 - abs(vGrid.x)) + 0.06 * vein;
        float toward = dot(normal, normalize(vToLamp));
        float lampSide = smoothstep(-0.3, 0.6, toward);
        float rounded = mix(0.42, 1.0, pow(abs(dot(normal, normalize(vViewPosition))), 0.8));
        float lit = near * mix(1.0, 1.5, lampSide) * (0.56 + 0.44 * abs(toward)) * rounded;
        vec3 through = pow(petal, vec3(mix(2.7, 1.7, lampSide)));
        through /= max(max(through.r, max(through.g, through.b)), 0.001);
        // Seen from outside, the sides of a petal lie over its neighbour: two layers pass less
        // light, as they do on a lampshade, and that is what shows the petals of a closed bud.
        lit *= 1.0 - 0.42 * smoothstep(0.5, 1.0, abs(vGrid.x)) * (1.0 - lampSide);
        float hot = vKind == ${KIND.stamen} ? 0.12 : 0.7;
        totalEmissiveRadiance += uGlow * uLamp * skin * (through * (lit + 0.05) + near * near * near * near * hot);
        `,
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
        // Pale petals in full sun would burn out to flat white and lose their form, and at
        // night their rims would turn to metal. Light past this point rolls off, as on film.
        outgoingLight = min(outgoingLight, vec3(0.6)) + 0.4 * (1.0 - exp(-max(outgoingLight - 0.6, 0.0) / 0.4));
        #include <opaque_fragment>
        `,
      );
  };
  material.customProgramCacheKey = () => "blossom-petal";
  return material;
}

/** What shows under the petals: the shade of their base where it sinks out of the light. */
export function heartColour([base, mid]: readonly string[]): THREE.Color {
  const b = new THREE.Color(base);
  const deep = new THREE.Color(Math.max(b.r * b.r * 0.8, 0.04), Math.max(b.g * b.g * 0.8, 0.04), Math.max(b.b * b.b * 0.8, 0.04));
  return b.clone().lerp(new THREE.Color(mid), 0.31).multiply(deep.add(b.clone().multiplyScalar(0.1)));
}

/** Without this the shadow would keep the shape of the flat grid. */
export function petalDepthMaterial(uniforms: BlossomUniforms): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => spliceVertex(shader, uniforms);
  material.customProgramCacheKey = () => "blossom-depth";
  return material;
}

/** The grid again behind itself, facing the other way, for the second face of a petal. */
function bothFaces(grid: THREE.PlaneGeometry): THREE.BufferGeometry {
  const rows = grid.attributes.position.array as Float32Array;
  const count = grid.attributes.position.count;
  const position = new Float32Array(count * 6);
  position.set(rows);
  position.set(rows, count * 3);
  for (let i = 0; i < count; i += 1) {
    position[i * 3 + 2] = 1;
    position[(i + count) * 3 + 2] = -1;
  }
  const front = Array.from((grid.index as THREE.BufferAttribute).array);
  const back = front.map((corner) => corner + count).reverse();
  const both = new THREE.BufferGeometry();
  both.setIndex([...front, ...back]);
  both.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return both;
}

/** One grid, drawn once for each part. */
export function partsGeometry(parts: Part[], solid: boolean): THREE.InstancedBufferGeometry {
  const grid = new THREE.PlaneGeometry(2, 1, 18, 28);
  grid.translate(0, 0.5, 0);
  // Rows gather at the tip and columns at the rim, where the surface turns fastest.
  const rows = grid.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rows.count; i += 1) {
    const x = rows.getX(i);
    rows.setXY(i, Math.sign(x) * (1 - (1 - Math.abs(x)) ** 1.4), 1 - (1 - rows.getY(i)) ** 1.5);
  }
  const shape = solid ? bothFaces(grid) : grid;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = shape.index;
  geometry.setAttribute("position", shape.attributes.position);
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

