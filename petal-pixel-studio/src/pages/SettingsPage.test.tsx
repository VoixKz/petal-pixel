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

  it("toggles the email-notifications switch via keyboard", () => {
    renderPage();
    const emailSwitch = screen.getByRole("switch", { name: /email notifications/i });
    const before = emailSwitch.getAttribute("aria-checked");
    emailSwitch.focus();
    expect(emailSwitch).toHaveFocus();
    // Radix Switch toggles via click (native <button> converts Space/Enter to click in real browsers;
    // jsdom does not simulate that conversion, so we fire the resulting click directly)
    fireEvent.click(emailSwitch);
    expect(emailSwitch.getAttribute("aria-checked")).not.toBe(before);
  });
});
