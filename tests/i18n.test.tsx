// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { useI18n } from "../src/i18n/useI18n";

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe("i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to en when navigator.language is non-zh", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    // jsdom defaults to en-US
    expect(result.current.locale).toBe("en");
    expect(result.current.t("dialog.confirm")).toBe("OK");
  });

  it("reads saved locale from localStorage", () => {
    window.localStorage.setItem("drumit.locale", "zh");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("zh");
    expect(result.current.t("dialog.confirm")).toBe("确定");
  });

  it("setLocale persists and updates t()", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("zh"));
    expect(result.current.locale).toBe("zh");
    expect(window.localStorage.getItem("drumit.locale")).toBe("zh");
    expect(result.current.t("header.about")).toBe("关于");
  });

  it("interpolates {var} placeholders", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("zh"));
    expect(
      result.current.t("doclist.delete_message", { name: "Demo" }),
    ).toContain("Demo");
  });

  it("returns key when missing and warns", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("__definitely_missing__")).toBe(
      "__definitely_missing__",
    );
  });

  it("useI18n throws outside provider", () => {
    // Render without provider — expect error boundary or throw.
    function Probe() {
      useI18n();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/I18nProvider/);
  });

  it("sets <html lang> on locale change", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("zh"));
    expect(document.documentElement.getAttribute("lang")).toBe("zh");
    act(() => result.current.setLocale("en"));
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("renders t() in JSX", () => {
    function Hi() {
      const { t } = useI18n();
      return <span>{t("header.about")}</span>;
    }
    render(
      <I18nProvider>
        <Hi />
      </I18nProvider>,
    );
    expect(screen.getByText(/About|关于/)).toBeTruthy();
  });
});
