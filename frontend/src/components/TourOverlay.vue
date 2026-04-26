<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { useOnboardingTour } from "@/composables/useOnboardingTour";

const tour = useOnboardingTour();

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 12;

const targetRect = ref<Rect | null>(null);
const viewport = ref({ width: 0, height: 0 });

function measureTarget() {
  const step = tour.currentStep.value;
  if (!step) {
    targetRect.value = null;
    return;
  }
  const el = document.querySelector(step.targetSelector) as HTMLElement | null;
  if (!el) {
    targetRect.value = null;
    // Auto-advance if target is missing. Defer to avoid re-entrant updates.
    nextTick(() => {
      if (tour.currentStep.value?.id === step.id) tour.next();
    });
    return;
  }
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  targetRect.value = {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
}

function onResize() {
  measureTarget();
}

function onKeydown(e: KeyboardEvent) {
  if (!tour.isActive.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    tour.skip();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    tour.next();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    tour.prev();
  }
}

onMounted(() => {
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onResize, true);
  window.addEventListener("keydown", onKeydown);
  measureTarget();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", onResize, true);
  window.removeEventListener("keydown", onKeydown);
});

watch(
  () => [tour.isActive.value, tour.currentStepIndex.value],
  async () => {
    await nextTick();
    measureTarget();
  },
);

const spotlightClipPath = computed(() => {
  const r = targetRect.value;
  const vw = viewport.value.width;
  const vh = viewport.value.height;
  if (!r || !vw || !vh) {
    // No hole — full backdrop
    return `polygon(0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px)`;
  }
  const top = Math.max(0, r.top - SPOTLIGHT_PADDING);
  const left = Math.max(0, r.left - SPOTLIGHT_PADDING);
  const right = Math.min(vw, r.left + r.width + SPOTLIGHT_PADDING);
  const bottom = Math.min(vh, r.top + r.height + SPOTLIGHT_PADDING);
  // Outer rect -> cut inner rect via even-odd polygon
  return (
    `polygon(` +
    `0 0, 0 ${vh}px, ${vw}px ${vh}px, ${vw}px 0, 0 0, ` +
    `${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px` +
    `)`
  );
});

const tooltipStyle = computed(() => {
  const r = targetRect.value;
  const step = tour.currentStep.value;
  if (!r || !step) return { display: "none" };
  const placement = step.placement;
  let top = 0;
  let left = 0;
  if (placement === "bottom") {
    top = r.top + r.height + TOOLTIP_OFFSET;
    left = r.left + r.width / 2;
  } else if (placement === "top") {
    top = r.top - TOOLTIP_OFFSET;
    left = r.left + r.width / 2;
  } else if (placement === "right") {
    top = r.top + r.height / 2;
    left = r.left + r.width + TOOLTIP_OFFSET;
  } else {
    top = r.top + r.height / 2;
    left = r.left - TOOLTIP_OFFSET;
  }
  const transforms: Record<string, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };
  return {
    top: `${top}px`,
    left: `${left}px`,
    transform: transforms[placement],
  };
});

const isLast = computed(
  () => tour.currentStepIndex.value >= tour.steps.value.length - 1,
);
const isFirst = computed(() => tour.currentStepIndex.value === 0);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tour.isActive.value && tour.currentStep.value"
      class="tour-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="tour.currentStep.value.title"
    >
      <div
        class="tour-overlay__backdrop"
        :style="{ clipPath: spotlightClipPath, WebkitClipPath: spotlightClipPath }"
      />
      <div
        class="tour-overlay__tooltip"
        :class="`tour-overlay__tooltip--${tour.currentStep.value.placement}`"
        :style="tooltipStyle"
      >
        <div class="tour-overlay__title">{{ tour.currentStep.value.title }}</div>
        <div class="tour-overlay__body">{{ tour.currentStep.value.body }}</div>
        <div class="tour-overlay__footer">
          <span class="tour-overlay__counter">
            {{ tour.currentStepIndex.value + 1 }} of {{ tour.steps.value.length }}
          </span>
          <div class="tour-overlay__actions">
            <button
              type="button"
              class="tour-overlay__btn tour-overlay__btn--ghost"
              @click="tour.skip()"
            >
              Skip
            </button>
            <button
              v-if="!isFirst"
              type="button"
              class="tour-overlay__btn tour-overlay__btn--ghost"
              @click="tour.prev()"
            >
              Back
            </button>
            <button
              type="button"
              class="tour-overlay__btn tour-overlay__btn--primary"
              @click="tour.next()"
            >
              {{ isLast ? "Done" : "Next" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}

.tour-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: var(--tour-backdrop);
  pointer-events: auto;
}

.tour-overlay__tooltip {
  position: absolute;
  max-width: 320px;
  min-width: 240px;
  background: var(--tour-tooltip-bg);
  color: var(--text-primary);
  border-radius: var(--radius);
  box-shadow: var(--tour-tooltip-shadow);
  padding: 0.875rem 1rem;
  pointer-events: auto;
  z-index: 1;
}

.tour-overlay__title {
  font-weight: 600;
  font-size: 0.9375rem;
  margin-bottom: 0.25rem;
}

.tour-overlay__body {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.tour-overlay__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tour-overlay__counter {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.tour-overlay__actions {
  display: flex;
  gap: 0.375rem;
}

.tour-overlay__btn {
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-primary);
  background: transparent;
  color: var(--text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
}

.tour-overlay__btn--primary {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.tour-overlay__btn--primary:hover {
  background: var(--accent-hover);
}

.tour-overlay__btn--ghost:hover {
  background: var(--bg-secondary);
}

.tour-overlay__tooltip::after {
  content: "";
  position: absolute;
  width: 0;
  height: 0;
  border: 6px solid transparent;
}

.tour-overlay__tooltip--top::after {
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: var(--tour-tooltip-bg);
}

.tour-overlay__tooltip--bottom::after {
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: var(--tour-tooltip-bg);
}

.tour-overlay__tooltip--left::after {
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
  border-left-color: var(--tour-tooltip-bg);
}

.tour-overlay__tooltip--right::after {
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  border-right-color: var(--tour-tooltip-bg);
}
</style>
