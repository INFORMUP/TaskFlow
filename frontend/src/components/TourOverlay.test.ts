import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import TourOverlay from "./TourOverlay.vue";
import {
  provideOnboardingTour,
  type OnboardingTourStore,
  type TourStep,
} from "@/composables/useOnboardingTour";

const steps: TourStep[] = [
  {
    id: "one",
    targetSelector: "#t1",
    title: "First",
    body: "First body",
    placement: "bottom",
  },
  {
    id: "two",
    targetSelector: "#t2",
    title: "Second",
    body: "Second body",
    placement: "top",
  },
];

function mountHarness() {
  let store!: OnboardingTourStore;
  const Harness = defineComponent({
    setup() {
      store = provideOnboardingTour();
      return () =>
        h("div", [
          h("div", { id: "t1", style: "width:100px;height:20px" }, "t1"),
          h("div", { id: "t2", style: "width:100px;height:20px" }, "t2"),
          h(TourOverlay),
        ]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return { wrapper, getStore: () => store };
}

describe("TourOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("does not render when tour is inactive", () => {
    const { wrapper } = mountHarness();
    expect(document.querySelector(".tour-overlay")).toBe(null);
    wrapper.unmount();
  });

  it("renders current step content when active", async () => {
    const { wrapper, getStore } = mountHarness();
    getStore().startTour(steps);
    await nextTick();
    await nextTick();
    const overlay = document.querySelector(".tour-overlay");
    expect(overlay).not.toBe(null);
    expect(overlay?.textContent).toContain("First");
    expect(overlay?.textContent).toContain("First body");
    expect(overlay?.textContent).toContain("1 of 2");
    wrapper.unmount();
  });

  it("hides the Back button on the first step", async () => {
    const { wrapper, getStore } = mountHarness();
    getStore().startTour(steps);
    await nextTick();
    await nextTick();
    const buttons = Array.from(
      document.querySelectorAll(".tour-overlay__btn"),
    ).map((b) => b.textContent?.trim());
    expect(buttons).not.toContain("Back");
    wrapper.unmount();
  });

  it("shows the Done label on the last step and Back reappears", async () => {
    const { wrapper, getStore } = mountHarness();
    const store = getStore();
    store.startTour(steps);
    await nextTick();
    store.next();
    await nextTick();
    await nextTick();
    const buttons = Array.from(
      document.querySelectorAll(".tour-overlay__btn"),
    ).map((b) => b.textContent?.trim());
    expect(buttons).toContain("Back");
    expect(buttons).toContain("Done");
    expect(buttons).not.toContain("Next");
    wrapper.unmount();
  });
});
