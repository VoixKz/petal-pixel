import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const oauthSpy = vi.fn().mockResolvedValue({ error: { message: "provider blocked" } });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...a: unknown[]) => oauthSpy(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/stores/flowerStore", () => ({
  useFlowerStore: { getState: () => ({ resetFlowerStore: vi.fn() }) },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  // @ts-expect-error MemoryRouter wrapping in test
  <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>
);

describe("signInWithOAuth", () => {
  it("returns the Supabase error instead of swallowing it", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let ret: { error: Error | null } | undefined;
    await act(async () => {
      ret = await result.current.signInWithOAuth("google");
    });
    expect(ret?.error).toBeInstanceOf(Error);
    expect(ret?.error?.message).toBe("provider blocked");
  });
});
