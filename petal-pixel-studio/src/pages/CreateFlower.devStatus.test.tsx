import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { toast } from 'sonner';

vi.mock('@/integrations/garden/api', () => ({
  getSignedInUserId: vi.fn(async () => 'user-123'),
  listGarden: vi.fn(async () => []),
  upsertGardenFlower: vi.fn(async () => undefined),
  updateGardenFlower: vi.fn(async () => undefined),
  deleteGardenFlower: vi.fn(async () => undefined),
}));

vi.mock('@/integrations/flowerBackend/client', () => ({
  createFlowerViaGrpc: vi.fn(),
  prepareMintViaGrpc: vi.fn(),
  confirmMintViaGrpc: vi.fn(),
  postFlowerPreview: vi.fn(),
  buildShareUrl: vi.fn(),
  flowerBackendBaseUrl: 'http://backend.test',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: null, user: null }),
}));

vi.mock('@/components/flower/BloomView', () => ({ BloomView: () => null }));

import CreateFlower from './CreateFlower';

describe('CreateFlower', () => {
  it('keeps backend status out of the interface', async () => {
    const router = createMemoryRouter([{ path: '/', element: <CreateFlower /> }]);
    render(<RouterProvider router={router} />);

    await screen.findByRole('button', { name: /generate/i });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: /backend/i })).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
