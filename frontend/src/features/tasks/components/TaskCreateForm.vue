<script setup lang="ts">
import { ref } from "vue";
import { createTask } from "@/api/tasks.api";

const props = defineProps<{
  flow: string;
}>();

const emit = defineEmits<{
  created: [];
  cancel: [];
}>();

const title = ref("");
const description = ref("");
const priority = ref("medium");
const submitting = ref(false);
const error = ref("");

async function handleSubmit() {
  if (!title.value.trim()) {
    error.value = "Title is required";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    await createTask({
      flow: props.flow,
      title: title.value,
      description: description.value || undefined,
      priority: priority.value,
    });
    emit("created");
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to create task";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="create-form">
    <h3>New {{ flow.charAt(0).toUpperCase() + flow.slice(1) }} Task</h3>
    <div v-if="error" class="create-form__error">{{ error }}</div>
    <input
      v-model="title"
      placeholder="Title"
      class="create-form__input"
    />
    <textarea
      v-model="description"
      placeholder="Description (optional)"
      class="create-form__textarea"
      rows="3"
    />
    <select v-model="priority" class="create-form__select">
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    <div class="create-form__actions">
      <button class="create-form__cancel" @click="emit('cancel')">Cancel</button>
      <button class="create-form__submit" :disabled="submitting" @click="handleSubmit">
        {{ submitting ? "Creating..." : "Create" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.create-form {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1rem;
}

.create-form h3 {
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.create-form__error {
  color: var(--priority-critical);
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.create-form__input,
.create-form__textarea,
.create-form__select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.create-form__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.create-form__cancel {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.create-form__submit {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.create-form__submit:disabled {
  opacity: 0.6;
}
</style>
