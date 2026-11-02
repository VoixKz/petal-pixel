import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useFlowerStore, type SavedFlower } from '@/stores/flowerStore';
import MyFlowers from './MyFlowers';

// MyFlowers imports flowerStore, which imports the garden API + the gRPC client at
// module load — stub both so this test file doesn't need network/auth.
vi.mock("@/integrations/garden/api", () => ({
  getSignedInUserId: vi.fn(async () => null),
  listGarden: vi.fn(async () => []),
  upsertGardenFlower: vi.fn(async () => undefined),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: vi.fn(async () => undefined),
}));
vi.mock('@/integrations/flowerBackend/client', () => ({
  createFlowerViaGrpc: vi.fn(),
}));

const baseParams = { ...useFlowerStore.getState().params };

function seedFlower(overrides: Partial<SavedFlower> = {}, id: string): SavedFlower {
  return {
    id,
    title: 'Celestial Bloom',
    generationWord: 'rose',
    params: { ...baseParams },
    createdAt: '2026-07-01',
    isMinted: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyFlowers />
    </MemoryRouter>,
  );
}

describe('MyFlowers page (smoke — real DOM interactions)', () => {
  beforeEach(() => {
    useFlowerStore.setState({ savedFlowers: [] });
  });

  it('shows the empty state and no toolbar when there are no flowers', () => {
    renderPage();
    expect(screen.getByText('No flowers yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search flowers')).not.toBeInTheDocument();
  });

  it('search narrows the grid by title and generation word (case-insensitive)', () => {
    useFlowerStore.setState({
      savedFlowers: [
        seedFlower({ title: 'Aurora Sunflower', generationWord: 'dawn' }, 'a'),
        seedFlower({ title: 'Phantom Dahlia', generationWord: 'chaos' }, 'b'),
      ],
    });
    renderPage();
    expect(screen.getByText('Aurora Sunflower')).toBeInTheDocument();
    expect(screen.getByText('Phantom Dahlia')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search flowers'), { target: { value: 'AURORA' } });
    expect(screen.getByText('Aurora Sunflower')).toBeInTheDocument();
    expect(screen.queryByText('Phantom Dahlia')).not.toBeInTheDocument();
  });

  it('shows a no-match empty state with a working Clear filters button', () => {
    useFlowerStore.setState({ savedFlowers: [seedFlower({}, 'a')] });
    renderPage();
    fireEvent.change(screen.getByLabelText('Search flowers'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No flowers match your filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByText('Celestial Bloom')).toBeInTheDocument();
  });

  it('mint filter chips narrow to minted / drafts', () => {
    useFlowerStore.setState({
      savedFlowers: [
        seedFlower({ title: 'Minted One', isMinted: true }, 'a'),
        seedFlower({ title: 'Draft One', isMinted: false }, 'b'),
      ],
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^minted$/i }));
    expect(screen.getByText('Minted One')).toBeInTheDocument();
    expect(screen.queryByText('Draft One')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^not minted$/i }));
    expect(screen.queryByText('Minted One')).not.toBeInTheDocument();
    expect(screen.getByText('Draft One')).toBeInTheDocument();
  });

  it('the kind filter lists what the saved names grow, and filters by it', () => {
    useFlowerStore.setState({
      savedFlowers: [
        seedFlower({ title: 'Tulip Card', generationWord: 'Zara' }, 'a'),
        seedFlower({ title: 'Camellia Card', generationWord: 'Anna' }, 'b'),
      ],
    });
    renderPage();
    const select = screen.getByLabelText('Filter by kind') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['all', 'hibiscus', 'tiger lily']);

    fireEvent.change(select, { target: { value: 'hibiscus' } });
    expect(screen.getByText('Camellia Card')).toBeInTheDocument();
    expect(screen.queryByText('Tulip Card')).not.toBeInTheDocument();
  });

  it('sort select reorders the grid (name A-Z)', () => {
    useFlowerStore.setState({
      savedFlowers: [
        seedFlower({ title: 'Zeta' }, 'a'),
        seedFlower({ title: 'Alpha' }, 'b'),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('Sort flowers'), { target: { value: 'name' } });
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Alpha', 'Zeta']);
  });

  it('inline rename: pencil reveals an input; Enter commits via updateFlowerTitle', async () => {
    useFlowerStore.setState({ savedFlowers: [seedFlower({ title: 'Old Name' }, 'a')] });
    renderPage();

    fireEvent.click(screen.getByTitle('Rename flower'));
    const input = screen.getByLabelText('Rename flower');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await vi.waitFor(() => {
      expect(useFlowerStore.getState().savedFlowers[0].title).toBe('New Name');
    });
    expect(screen.getByText('New Name')).toBeInTheDocument();
  });

  it('inline rename: Escape cancels without committing', () => {
    useFlowerStore.setState({ savedFlowers: [seedFlower({ title: 'Old Name' }, 'a')] });
    renderPage();

    fireEvent.click(screen.getByTitle('Rename flower'));
    const input = screen.getByLabelText('Rename flower');
    fireEvent.change(input, { target: { value: 'Should Not Save' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useFlowerStore.getState().savedFlowers[0].title).toBe('Old Name');
    expect(screen.getByText('Old Name')).toBeInTheDocument();
  });

  it('each card names the kind of flower its name grows, whatever an old record says', () => {
    useFlowerStore.setState({
      savedFlowers: [
        seedFlower({ title: 'First', generationWord: 'Zara', params: { ...baseParams, family: 'sunflower' } }, 'a'),
        seedFlower({ title: 'Second', generationWord: 'Anna', params: { ...baseParams, flowerType: 'rose' } }, 'b'),
      ],
    });
    renderPage();
    // Kinds also appear as <option>s in the filter; scope to the card chip (a <div>).
    const cardChip = (label: string) => screen.getAllByText(label).filter((el) => el.tagName === 'DIV');
    expect(cardChip('tiger lily')).toHaveLength(1);
    expect(cardChip('hibiscus')).toHaveLength(1);
  });
});
