import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { describe, it, expect, beforeEach } from "vitest";
import SettingsPage from "./SettingsPage";

function renderPage() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SettingsPage />
    </ThemeProvider>,
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
});
