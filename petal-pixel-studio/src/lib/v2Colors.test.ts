import { describe, it, expect } from 'vitest';
import { V2_COLOR_A, V2_COLOR_B } from './v2Colors';

describe('v2 default colors', () => {
  it('are the frozen studio/share defaults', () => {
    // Guards against silent studio/share drift: both the flowerStore v2 branch
    // and shareParams' v2 arm read these, so a change here must be intentional.
    expect(V2_COLOR_A).toBe('#10b981');
    expect(V2_COLOR_B).toBe('#2563eb');
  });
});
