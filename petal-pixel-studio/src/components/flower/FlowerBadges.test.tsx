import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowerStore } from '@/stores/flowerStore';
import { FlowerBadges } from './FlowerBadges';

const basePalette = {
  id: 'sunset-glow',
  stops: [
    { pos: 0, hex: '#ff0000' },
    { pos: 0.5, hex: '#00ff00' },
    { pos: 1, hex: '#0000ff' },
  ],
};

describe('FlowerBadges', () => {
  beforeEach(() => {
    // Reset to a clean baseline before each test so params from a prior test
    // (e.g. a v2 palette) don't leak across cases.
    useFlowerStore.setState((s) => ({
      params: { ...s.params, family: undefined, palette: undefined, flowerType: 'classic' },
    }));
  });

  it('v1 fallback: shows the flowerType chip and renders no palette chip when palette/family are absent', () => {
    useFlowerStore.setState((s) => ({
      params: { ...s.params, family: undefined, palette: undefined, flowerType: 'rose' },
    }));
    render(<FlowerBadges />);
    expect(screen.getByText('rose')).toBeInTheDocument();
    expect(screen.queryByText(basePalette.id)).not.toBeInTheDocument();
  });

  it('v2: shows the family chip and a palette chip with the palette id when a palette is present', () => {
    useFlowerStore.setState((s) => ({
      params: { ...s.params, family: 'sunflower', palette: basePalette, flowerType: 'classic' },
    }));
    render(<FlowerBadges />);
    expect(screen.getByText('sunflower')).toBeInTheDocument();
    expect(screen.getByText(basePalette.id)).toBeInTheDocument();
  });

  it('v2: the palette swatch strip background uses the position-aware gradient (never evenly-spaced)', () => {
    useFlowerStore.setState((s) => ({
      params: { ...s.params, family: 'sunflower', palette: basePalette, flowerType: 'classic' },
    }));
    render(<FlowerBadges />);
    const swatch = screen.getByText(basePalette.id).parentElement?.querySelector('[aria-hidden]');
    expect(swatch).not.toBeNull();
    // jsdom's CSSOM re-serializes hex colors as rgb(); assert position-aware
    // ordering and stop percentages survive rather than matching hex literals.
    const bg = (swatch as HTMLElement).style.background;
    expect(bg).toBe('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 255, 0) 50%, rgb(0, 0, 255) 100%)');
  });

  it('omits the palette chip when palette has zero stops (degenerate/malformed persisted palette)', () => {
    useFlowerStore.setState((s) => ({
      params: { ...s.params, family: 'sunflower', palette: { id: 'empty', stops: [] }, flowerType: 'classic' },
    }));
    render(<FlowerBadges />);
    expect(screen.getByText('sunflower')).toBeInTheDocument();
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
  });
});
