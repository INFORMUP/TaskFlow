import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import {
  provideOnboardingTour,
  useOnboardingTour,
  TOUR_STORAGE_KEY,
  type OnboardingTourStore,
  type TourStep,
} from "./useOnboardingTour";

const steps: TourStep[] = [
  { id: "a", targetSelector: ".a", title: "A", body: "a", placement: "bottom" },
  { id: "b", targetSelector: ".b", title: "B", body: "b", placement: "top" },
  { id: "c", targetSelector: ".c", title: "C", body: "c", placement: "left" },
];

function mountWithTour(): OnboardingTourStore {
  let store!: OnboardingTourStore;
  const Child = defineComponent({
    setup() {
      store = useOnboardingTour();
      return () => h("div");
    },
  });
  const Parent = defineComponent({
    setup() {
      provideOnboardingTour();
      return () => h(Child);
    },
  });
  mount(Parent);
  return store;
}

describe("useOnboardingTour", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts inactive with no steps", () => {
    const tour = mountWithTour();
    expect(tour.isActive.value).toBe(false);
    expect(tour.currentStepIndex.value).toBe(0);
    expect(tour.currentStep.value).toBe(null);
  });

  it("reads hasCompletedTour from localStorage on init", () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    const tour = mountWithTour();
    expect(tour.hasCompletedTour.value).toBe(true);
  });

  it("startTour activates and exposes first step", () => {
    const tour = mountWithTour();
    tour.startTour(steps);
    expect(tour.isActive.value).toBe(true);
    expect(tour.currentStep.value?.id).toBe("a");
  });

  it("startTour is a no-op when already completed", () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    const tour = mountWithTour();
    tour.startTour(steps);
    expect(tour.isActive.value).toBe(false);
  });

  it("next advances through steps and finishes on the last one", () => {
    const tour = mountWithTour();
    tour.startTour(steps);
    tour.next();
    expect(tour.currentStep.value?.id).toBe("b");
    tour.next();
    expect(tour.currentStep.value?.id).toBe("c");
    tour.next();
    expect(tour.isActive.value).toBe(false);
    expect(tour.hasCompletedTour.value).toBe(true);
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe("true");
  });

  it("prev does not move before the first step", () => {
    const tour = mountWithTour();
    tour.startTour(steps);
    tour.prev();
    expect(tour.currentStepIndex.value).toBe(0);
    tour.next();
    tour.prev();
    expect(tour.currentStepIndex.value).toBe(0);
  });

  it("skip sets localStorage and deactivates", () => {
    const tour = mountWithTour();
    tour.startTour(steps);
    tour.skip();
    expect(tour.isActive.value).toBe(false);
    expect(tour.hasCompletedTour.value).toBe(true);
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe("true");
  });

  it("finish sets localStorage and deactivates", () => {
    const tour = mountWithTour();
    tour.startTour(steps);
    tour.finish();
    expect(tour.isActive.value).toBe(false);
    expect(tour.hasCompletedTour.value).toBe(true);
  });
});
