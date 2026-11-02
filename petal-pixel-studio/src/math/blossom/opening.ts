// How a real flower closes into a bud and opens again. A scan is one fixed shape, so the whole
// of space around it is squeezed toward the flower's axis. The squeeze keeps every point's order
// by distance and by lean, so two petals that were apart in the scan can never meet: nothing has
// to know where one petal ends and the next begins. opening.test.ts holds it to that.
export const OPENING_GLSL = /* glsl */ `
uniform vec4 uShape;
uniform float uKept;

const float OPEN_STAGGER = 0.9;
const float OPEN_TUCK = 0.372;
const float OPEN_CUP = 2.06;
const float OPEN_STALK = 2.88;

float openEase(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// The furthest-leaning parts open first, the way outer petals do.
float openAge(float lean, float t, float top) {
  return openEase(t * (1.0 + OPEN_STAGGER) - OPEN_STAGGER * (1.0 - min(lean / top, 1.0)));
}

// Far points tuck in more, so the tips of a bud meet over its heart.
float openNarrow(float reach, float age, float closed) {
  float far = min(reach, 1.2);
  return (closed + (1.0 - closed) * age) * (1.0 - OPEN_TUCK * (1.0 - age) * far * far);
}

// Long parts draw in too, so stamens wait inside the bud and come out last.
float openReach(float reach, float lean, float t, float top, float kept) {
  return reach * (kept + (1.0 - kept) * openAge(lean, t, top));
}

float openLean(float reach, float lean, float t, float top, float closed) {
  if (lean >= OPEN_STALK) return lean;
  if (lean <= OPEN_CUP) return lean * openNarrow(reach, openAge(lean, t, top), closed);
  float edge = OPEN_CUP * openNarrow(reach, openEase(t * (1.0 + OPEN_STAGGER)), closed);
  return edge + (lean - OPEN_CUP) * (OPEN_STALK - edge) / (OPEN_STALK - OPEN_CUP);
}

vec3 openPoint(vec3 p, float t) {
  float reach = length(p);
  float lean = acos(clamp(p.y / max(reach, 0.0001), -1.0, 1.0));
  float turn = atan(p.z, p.x) + uShape.z * (1.0 - openAge(lean, t, uShape.x)) * min(reach, 1.0);
  float size = uShape.w + (1.0 - uShape.w) * openEase(t / 0.7);
  float below = clamp((lean - OPEN_CUP) / (OPEN_STALK - OPEN_CUP), 0.0, 1.0);
  float r = openReach(reach, lean, t, uShape.x, uKept) * (size + (1.0 - size) * below);
  float l = openLean(reach, lean, t, uShape.x, uShape.y);
  return vec3(r * sin(l) * cos(turn), r * cos(l), r * sin(l) * sin(turn));
}
`;
