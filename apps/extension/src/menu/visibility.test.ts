import { describe, expect, it, vi } from "vitest";
import {
  ARM_AFTER_MS,
  createVisibilityGuard,
  reportShowsMenu,
  tracksVisibility,
  watchVisibility,
} from "./visibility.ts";

// K-403: the menu takes a click only after the browser reported it visible, uncovered and fully in
// the viewport, without a break for ARM_AFTER_MS (clickjacking, Tóth, DEF CON 33)
describe("reportShowsMenu", () => {
  it("needs the browser's verdict and the whole menu in the viewport", () => {
    expect(reportShowsMenu({ isVisible: true, intersectionRatio: 1, time: 0 })).toBe(true);
    expect(reportShowsMenu({ isVisible: false, intersectionRatio: 1, time: 0 })).toBe(false);
    expect(reportShowsMenu({ isVisible: true, intersectionRatio: 0.6, time: 0 })).toBe(false);
    // A browser without v2 reports no verdict at all
    expect(reportShowsMenu({ intersectionRatio: 1, time: 0 })).toBe(false);
  });
});

describe("the visibility guard", () => {
  it("arms only after the menu has been visible without a break", () => {
    const guard = createVisibilityGuard();
    expect(guard.armed(10_000)).toBe(false);
    guard.seen(true, 1_000);
    expect(guard.armed(1_000 + ARM_AFTER_MS - 1)).toBe(false);
    expect(guard.armed(1_000 + ARM_AFTER_MS)).toBe(true);
    guard.seen(true, 1_200);
    expect(guard.armed(1_000 + ARM_AFTER_MS)).toBe(true);
  });

  it("disarms the moment the menu is covered, and starts counting again after", () => {
    const guard = createVisibilityGuard();
    guard.seen(true, 0);
    guard.seen(false, 2_000);
    expect(guard.armed(2_001)).toBe(false);
    guard.seen(true, 3_000);
    expect(guard.armed(3_100)).toBe(false);
    expect(guard.armed(3_000 + ARM_AFTER_MS)).toBe(true);
  });
});

describe("watchVisibility", () => {
  it("asks for v2 reports and feeds them to the guard", () => {
    let report: (
      reports: { isVisible?: boolean; intersectionRatio: number; time: number }[],
    ) => void = () => {};
    const observe = vi.fn();
    const options = vi.fn();
    class Observer {
      constructor(callback: typeof report, given: object) {
        report = callback;
        options(given);
      }
      observe = observe;
      disconnect = vi.fn();
    }
    const guard = createVisibilityGuard();
    const changes: boolean[] = [];
    const target = document.createElement("main");
    watchVisibility(target, guard, (visible) => changes.push(visible), Observer);
    expect(observe).toHaveBeenCalledWith(target);
    expect(options).toHaveBeenCalledWith({ threshold: [1], trackVisibility: true, delay: 100 });
    report([{ isVisible: true, intersectionRatio: 1, time: 50 }]);
    report([{ isVisible: false, intersectionRatio: 1, time: 900 }]);
    expect(changes).toEqual([true, false]);
    expect(guard.armed(5_000)).toBe(false);
  });

  it("never arms without an observer", () => {
    const guard = createVisibilityGuard();
    watchVisibility(document.createElement("main"), guard, () => {}, undefined);
    expect(guard.armed(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("knows whether the browser reports visibility", () => {
    class WithV2 {
      isVisible = false;
    }
    Object.defineProperty(WithV2.prototype, "isVisible", { value: false });
    expect(
      tracksVisibility({ IntersectionObserverEntry: WithV2 } as unknown as typeof globalThis),
    ).toBe(true);
    expect(tracksVisibility({} as typeof globalThis)).toBe(false);
  });
});
