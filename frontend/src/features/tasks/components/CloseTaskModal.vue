<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{
  flowSlug: string;
}>();

const emit = defineEmits<{
  (e: "confirm", resolution: string, note: string): void;
  (e: "cancel"): void;
}>();

const RESOLUTIONS: Record<string, string[]> = {
  bug: ["fixed", "invalid", "duplicate", "wont_fix", "cannot_reproduce"],
  feature: ["completed", "rejected", "duplicate", "deferred"],
  improvement: ["completed", "wont_fix", "deferred"],
};

const resolutionOptions = computed(() => RESOLUTIONS[props.flowSlug] ?? ["completed"]);

const defaultResolution = computed(() =>
  resolutionOptions.value.includes("completed")
    ? "completed"
    : resolutionOptions.value[0] ?? "completed"
);

const resolution = ref(defaultResolution.value);
const note = ref("");

const previouslyFocused = ref<HTMLElement | null>(null);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("cancel");
  }
}

onMounted(() => {
  previouslyFocused.value = (document.activeElement as HTMLElement) ?? null;
  document.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  previouslyFocused.value?.focus?.();
});

function handleConfirm() {
  emit("confirm", resolution.value, note.value);
}
</script>

<template>
  <div
    class="close-modal__backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="close-modal-title"
    @click.self="emit('cancel')"
  >
    <div class="close-modal">
      <h2 id="close-modal-title" class="close-modal__title">Close Task</h2>

      <div class="close-modal__field">
        <label for="close-modal-resolution" class="close-modal__label">Resolution</label>
        <select
          id="close-modal-resolution"
          v-model="resolution"
          class="close-modal__select"
        >
          <option v-for="r in resolutionOptions" :key="r" :value="r">
            {{ r.replace(/_/g, " ") }}
          </option>
        </select>
      </div>

      <div class="close-modal__field">
        <label for="close-modal-note" class="close-modal__label">
          Reason <span class="close-modal__optional">(optional)</span>
        </label>
        <textarea
          id="close-modal-note"
          v-model="note"
          class="close-modal__textarea"
          rows="3"
          placeholder="Add a closing note..."
        />
      </div>

      <div class="close-modal__actions">
        <button
          type="button"
          class="close-modal__cancel"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="close-modal__confirm"
          data-testid="close-modal-confirm"
          @click="handleConfirm"
        >
          Close Task
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.close-modal__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.close-modal {
  background: var(--bg-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 28rem;
  width: 100%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.close-modal__title {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 1.25rem;
}

.close-modal__field {
  margin-bottom: 1rem;
}

.close-modal__label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
}

.close-modal__optional {
  font-weight: 400;
  color: var(--text-secondary);
}

.close-modal__select,
.close-modal__textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.close-modal__textarea {
  resize: vertical;
}

.close-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.close-modal__cancel {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

.close-modal__confirm {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font: inherit;
}

.close-modal__confirm:hover {
  background: var(--accent-hover);
}
</style>
