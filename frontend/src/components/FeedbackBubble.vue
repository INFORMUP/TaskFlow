<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { submitFeedback, type FeedbackType } from "@/api/feedback.api";

const expanded = ref(false);
const type = ref<FeedbackType>("BUG");
const message = ref("");
const submitting = ref(false);
const success = ref(false);
const errorMessage = ref<string | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
let successTimer: ReturnType<typeof window.setTimeout> | null = null;

function clearSuccessTimer() {
  if (successTimer !== null) {
    window.clearTimeout(successTimer);
    successTimer = null;
  }
}

function open() {
  expanded.value = true;
  nextTick(() => textareaRef.value?.focus());
}

function close() {
  clearSuccessTimer();
  expanded.value = false;
  errorMessage.value = null;
}

function setType(t: FeedbackType) {
  type.value = t;
}

function resetForm() {
  message.value = "";
  type.value = "BUG";
  errorMessage.value = null;
}

async function submit() {
  const trimmed = message.value.trim();
  if (!trimmed || submitting.value) return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    await submitFeedback({
      type: type.value,
      message: trimmed,
      page: window.location.href,
    });
    success.value = true;
    clearSuccessTimer();
    successTimer = window.setTimeout(() => {
      successTimer = null;
      success.value = false;
      resetForm();
      expanded.value = false;
    }, 1500);
  } catch (err: unknown) {
    const e = err as { error?: { message?: string }; message?: string };
    errorMessage.value =
      e?.error?.message ?? e?.message ?? "Failed to send feedback. Please try again.";
  } finally {
    submitting.value = false;
  }
}

onBeforeUnmount(() => {
  clearSuccessTimer();
});

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    submit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
}

watch(expanded, (v) => {
  if (!v) {
    // keep success flag as-is; it's cleared by its own timer
    errorMessage.value = null;
  }
});
</script>

<template>
  <div class="feedback-bubble">
    <button
      v-if="!expanded"
      type="button"
      class="feedback-bubble__button"
      aria-label="Send feedback"
      data-testid="feedback-bubble-button"
      @click="open"
    >
      <svg
        class="feedback-bubble__icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
    </button>

    <div
      v-else
      class="feedback-bubble__panel"
      role="dialog"
      aria-label="Send feedback"
      data-testid="feedback-bubble-panel"
      @keydown="onKeydown"
    >
      <div class="feedback-bubble__header">
        <span class="feedback-bubble__title">Send Feedback</span>
        <button
          type="button"
          class="feedback-bubble__close"
          aria-label="Close feedback"
          data-testid="feedback-bubble-close"
          @click="close"
        >
          ×
        </button>
      </div>

      <div v-if="success" class="feedback-bubble__success" data-testid="feedback-success">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>Thanks!</span>
      </div>

      <template v-else>
        <div class="feedback-bubble__types" role="group" aria-label="Feedback type">
          <button
            type="button"
            class="feedback-bubble__type feedback-bubble__type--bug"
            :class="{ 'feedback-bubble__type--active': type === 'BUG' }"
            :aria-pressed="type === 'BUG'"
            data-testid="feedback-type-bug"
            @click="setType('BUG')"
          >
            Bug Report
          </button>
          <button
            type="button"
            class="feedback-bubble__type feedback-bubble__type--enh"
            :class="{ 'feedback-bubble__type--active': type === 'ENHANCEMENT' }"
            :aria-pressed="type === 'ENHANCEMENT'"
            data-testid="feedback-type-enhancement"
            @click="setType('ENHANCEMENT')"
          >
            Enhancement
          </button>
        </div>

        <textarea
          ref="textareaRef"
          v-model="message"
          class="feedback-bubble__textarea"
          rows="4"
          :placeholder="
            type === 'BUG' ? 'Describe the bug...' : 'Describe your idea...'
          "
          data-testid="feedback-message"
        />

        <div
          v-if="errorMessage"
          class="feedback-bubble__error"
          role="alert"
          data-testid="feedback-error"
        >
          {{ errorMessage }}
        </div>

        <div class="feedback-bubble__footer">
          <span class="feedback-bubble__hint">⌘/Ctrl+Enter to send</span>
          <button
            type="button"
            class="feedback-bubble__submit"
            :disabled="!message.trim() || submitting"
            data-testid="feedback-submit"
            @click="submit"
          >
            {{ submitting ? "Sending..." : "Send" }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.feedback-bubble {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 500;
}

.feedback-bubble__button {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: white;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, transform 120ms ease;
}

.feedback-bubble__button:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.feedback-bubble__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.feedback-bubble__icon {
  display: block;
}

.feedback-bubble__panel {
  width: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), var(--shadow-card);
  padding: 0.875rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.feedback-bubble__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.feedback-bubble__title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.feedback-bubble__close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1.25rem;
  line-height: 1;
  width: 24px;
  height: 24px;
  border-radius: var(--radius);
  cursor: pointer;
}

.feedback-bubble__close:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.feedback-bubble__types {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.feedback-bubble__type {
  padding: 0.4375rem 0.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.feedback-bubble__type:hover {
  background: var(--bg-secondary);
}

.feedback-bubble__type--bug.feedback-bubble__type--active {
  background: rgba(220, 38, 38, 0.1);
  border-color: var(--priority-critical);
  color: var(--priority-critical);
}

.feedback-bubble__type--enh.feedback-bubble__type--active {
  background: rgba(101, 163, 13, 0.12);
  border-color: var(--priority-low);
  color: var(--priority-low);
}

.feedback-bubble__textarea {
  width: 100%;
  resize: vertical;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.875rem;
  line-height: 1.4;
  outline: none;
}

.feedback-bubble__textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.feedback-bubble__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.feedback-bubble__hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.feedback-bubble__submit {
  padding: 0.4375rem 0.875rem;
  border-radius: var(--radius);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

.feedback-bubble__submit:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.feedback-bubble__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.feedback-bubble__error {
  font-size: 0.8125rem;
  color: var(--priority-critical);
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: var(--radius);
  padding: 0.375rem 0.5rem;
}

.feedback-bubble__success {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--priority-low);
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.75rem 0.25rem;
}
</style>
