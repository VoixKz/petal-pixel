import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowerStore } from '@/stores/flowerStore';
import { FlowerControls } from './FlowerControls';

describe('FlowerControls responsive host', () => {
  beforeEach(() => {
    useFlowerStore.setState((s) => ({ params: { ...s.params, flowerType: 'classic' } }));
  });

  it('renders the same control sections with no props (desktop aside)', () => {
    const { container } = render(<FlowerControls />);
    expect(screen.getByText('Flower Controls')).toBeInTheDocument();
    expect(screen.getByText('Geometry')).toBeInTheDocument();
    // default host is the fixed-width desktop aside
    expect(container.querySelector('aside')?.className).toContain('w-72');
  });

  it('merges a className override onto the root (drawer host) while keeping all sections', () => {
    const { container } = render(<FlowerControls className="w-full h-full border-l-0" />);
    const root = container.querySelector('aside');
    expect(root?.className).toContain('w-full');
    expect(root?.className).toContain('border-l-0');
    // content is identical — sections still render
    expect(screen.getByText('Flower Controls')).toBeInTheDocument();
    expect(screen.getByText('Colors')).toBeInTheDocument();
  });
});
