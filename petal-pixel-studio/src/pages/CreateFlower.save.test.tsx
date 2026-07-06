import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

// ── Mock heavy dependencies BEFORE importing CreateFlower ─────────────────────
// The page imports flowerStore which imports the Supabase client and the gRPC
// client at module load time. Stub both so the test environment doesn't throw.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-123' } } })) },
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
    })),
  },
}));

vi.mock('@/integrations/flowerBackend/client', () => ({
  createFlowerViaGrpc: vi.fn(),
  checkFlowerBackendHealth: vi.fn(async () => true),
  prepareMintViaGrpc: vi.fn(),
  confirmMintViaGrpc: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Additional stubs for things the page imports
vi.mock('@/components/flower/FlowerCanvas', () => ({ FlowerCanvas: () => null }));
vi.mock('@/components/flower/FlowerControls', () => ({ FlowerControls: () => null }));
vi.mock('@/components/flower/FlowerInfo', () => ({ FlowerInfo: () => null }));

import { runSaveFlow } from './CreateFlower';

const messages = {
  createdMessage: 'Flower saved to your collection!',
  updatedMessage: 'Flower updated!',
};

describe('runSaveFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true and toasts the 'created' message when saveFlower resolves 'created'", async () => {
    const saveFlower = vi.fn().mockResolvedValue('created' as const);
    const result = await runSaveFlow(saveFlower, messages);
    expect(result).toBe(true);
    expect(saveFlower).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Flower saved to your collection!');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns true and toasts the 'updated' message when saveFlower resolves 'updated' (Cluster A collision-as-update)", async () => {
    const saveFlower = vi.fn().mockResolvedValue('updated' as const);
    const result = await runSaveFlow(saveFlower, messages);
    expect(result).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Flower updated!');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("returns false and toasts an error (not success) when saveFlower resolves 'aborted' (Cluster D deleted-flower guard)", async () => {
    const saveFlower = vi.fn().mockResolvedValue('aborted' as const);
    const result = await runSaveFlow(saveFlower, messages);
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('This flower was deleted — nothing to update.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('returns false and toasts the error when saveFlower rejects', async () => {
    const saveFlower = vi.fn().mockRejectedValue(new Error('new row violates row-level security policy'));
    const result = await runSaveFlow(saveFlower, messages);
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('new row violates row-level security policy');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('toasts a generic message when the rejection is not an Error', async () => {
    const saveFlower = vi.fn().mockRejectedValue('boom');
    const result = await runSaveFlow(saveFlower, messages);
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Failed to save flower');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
