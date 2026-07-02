import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const verifyOtpSpy = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: (...a: unknown[]) => verifyOtpSpy(...a),
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

describe("verifyOtp", () => {
  beforeEach(() => verifyOtpSpy.mockClear());

  it("verifies the emailed signup code with type 'email'", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.verifyOtp("a@b.com", "12345678");
    });
    expect(verifyOtpSpy).toHaveBeenCalledWith({
      email: "a@b.com",
      token: "12345678",
      type: "email",
    });
  });
});
