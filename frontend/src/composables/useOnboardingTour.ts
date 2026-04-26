import {
  ref,
  computed,
  provide,
  inject,
  type InjectionKey,
  type Ref,
  type ComputedRef,
} from "vue";

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
}

export const TOUR_STORAGE_KEY = "taskflow_tour_completed";

export interface OnboardingTourStore {
  isActive: Ref<boolean>;
  currentStepIndex: Ref<number>;
  steps: Ref<TourStep[]>;
  currentStep: ComputedRef<TourStep | null>;
  hasCompletedTour: Ref<boolean>;
  startTour: (steps: TourStep[]) => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
}

const TOUR_KEY: InjectionKey<OnboardingTourStore> = Symbol("onboardingTour");

function readCompletedFlag(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCompletedFlag() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  } catch {
    // swallow — localStorage may be unavailable in some test environments
  }
}

export function provideOnboardingTour(): OnboardingTourStore {
  const isActive = ref(false);
  const currentStepIndex = ref(0);
  const steps = ref<TourStep[]>([]);
  const hasCompletedTour = ref(readCompletedFlag());

  const currentStep = computed<TourStep | null>(() =>
    isActive.value ? steps.value[currentStepIndex.value] ?? null : null,
  );

  function startTour(nextSteps: TourStep[]) {
    if (hasCompletedTour.value || nextSteps.length === 0) return;
    steps.value = nextSteps;
    currentStepIndex.value = 0;
    isActive.value = true;
  }

  function next() {
    if (!isActive.value) return;
    if (currentStepIndex.value >= steps.value.length - 1) {
      finish();
    } else {
      currentStepIndex.value += 1;
    }
  }

  function prev() {
    if (!isActive.value) return;
    if (currentStepIndex.value > 0) {
      currentStepIndex.value -= 1;
    }
  }

  function complete() {
    writeCompletedFlag();
    hasCompletedTour.value = true;
    isActive.value = false;
    currentStepIndex.value = 0;
  }

  function skip() {
    complete();
  }

  function finish() {
    complete();
  }

  const store: OnboardingTourStore = {
    isActive,
    currentStepIndex,
    steps,
    currentStep,
    hasCompletedTour,
    startTour,
    next,
    prev,
    skip,
    finish,
  };
  provide(TOUR_KEY, store);
  return store;
}

export function useOnboardingTour(): OnboardingTourStore {
  const store = inject(TOUR_KEY);
  if (!store)
    throw new Error(
      "useOnboardingTour() called without provideOnboardingTour()",
    );
  return store;
}
