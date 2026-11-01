/**
 * Fixed v2 default emissive / point-light tint.
 *
 * Single source of truth consumed by BOTH `flowerStore.generateFromWord`'s v2
 * branch and `shareParams.mapBackendJsonToFlowerParams`'s v2 arm, so the studio
 * render and the logged-out /share render agree exactly. v2 flowers do not
 * derive colorA/colorB from a hue (that is the v1 path); they use these frozen
 * constants. Any render task needing the v2 default color imports from here.
 */
export const V2_COLOR_A = '#10b981';
export const V2_COLOR_B = '#2563eb';
