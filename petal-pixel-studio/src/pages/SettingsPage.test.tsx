import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { describe, it, expect, beforeEach, vi } from "vitest";
import SettingsPage from "./SettingsPage";
import { getPref } from "@/lib/userPrefs";

// The rebuilt page reads useAuth().
// AuthProvider needs a full auth stack, so mock it to render the page in isolation.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "a@b.co", emailVerified: false },
    signOut: vi.fn(),
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <SettingsPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("SettingsPage a11y", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes switches with accessible names", () => {
    renderPage();
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(2);
    // Every switch must have an accessible name (label or aria-label)
    switches.forEach((el) => {
      expect(el).toHaveAccessibleName();
    });
  });

  it("switch is focusable and toggles on activation (keyboard-accessible via native <button>)", () => {
    renderPage();
    const emailSwitch = screen.getByRole("switch", { name: /email notifications/i });
    const before = emailSwitch.getAttribute("aria-checked");
    // Guard against a focusability regression: a real keyboard user must be able to
    // Tab to the control. Radix Switch renders a native <button>, so it must not be
    // removed from the tab order.
    expect(emailSwitch).not.toHaveAttribute("tabindex", "-1");
    emailSwitch.focus();
    expect(emailSwitch).toHaveFocus();
    // Keyboard accessibility is guaranteed by the native <button>: browsers convert
    // Space/Enter to a click. jsdom does not simulate that conversion, so we fire the
    // resulting click directly to assert the toggle wiring.
    fireEvent.click(emailSwitch);
    expect(emailSwitch.getAttribute("aria-checked")).not.toBe(before);
  });

  it("toggling Email notifications persists to userPrefs storage", () => {
    renderPage();
    // Starts off (honest default: no backend delivery wired up).
    expect(getPref("emailNotifications")).toBe(false);
    const emailSwitch = screen.getByRole("switch", { name: /email notifications/i });
    fireEvent.click(emailSwitch);
    expect(getPref("emailNotifications")).toBe(true);
  });
});
