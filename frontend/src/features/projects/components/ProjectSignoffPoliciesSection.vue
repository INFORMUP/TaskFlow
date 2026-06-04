<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { getProject } from "@/api/projects.api";
import {
  listPolicies,
  createPolicy,
  deletePolicy,
  addPolicySlot,
  deletePolicySlot,
  setProjectDefaultPolicy,
  type SignoffPolicy,
} from "@/api/signoff-policies.api";

const props = defineProps<{ projectId: string }>();

const policies = ref<SignoffPolicy[]>([]);
const defaultPolicyId = ref<string | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

// Create form
const showCreateForm = ref(false);
const newPolicyName = ref("");

// Slot management: tracks which policy is expanded for slot editing
const expandedPolicyId = ref<string | null>(null);
const newSlotLabel = ref("");
const newSlotActorType = ref("");

const defaultPolicy = computed(
  () => policies.value.find((p) => p.id === defaultPolicyId.value) ?? null
);

async function load() {
  error.value = null;
  try {
    const [pols, project] = await Promise.all([
      listPolicies(),
      getProject(props.projectId),
    ]);
    policies.value = pols;
    defaultPolicyId.value = project.defaultSignoffPolicyId ?? null;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load policies";
  }
}

watch(() => props.projectId, load, { immediate: true });

async function setDefault(policyId: string) {
  busy.value = true;
  error.value = null;
  try {
    await setProjectDefaultPolicy(props.projectId, policyId);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to set default";
  } finally {
    busy.value = false;
  }
}

async function clearDefault() {
  busy.value = true;
  error.value = null;
  try {
    await setProjectDefaultPolicy(props.projectId, null);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to clear default";
  } finally {
    busy.value = false;
  }
}

async function handleDelete(policyId: string) {
  busy.value = true;
  error.value = null;
  try {
    await deletePolicy(policyId);
    if (expandedPolicyId.value === policyId) expandedPolicyId.value = null;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to delete policy";
  } finally {
    busy.value = false;
  }
}

function toggleSlots(policyId: string) {
  if (expandedPolicyId.value === policyId) {
    expandedPolicyId.value = null;
  } else {
    expandedPolicyId.value = policyId;
    newSlotLabel.value = "";
    newSlotActorType.value = "";
  }
}

async function handleAddSlot(policyId: string) {
  if (!newSlotLabel.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    await addPolicySlot(policyId, {
      label: newSlotLabel.value.trim(),
      requiredActorType: newSlotActorType.value || null,
    });
    newSlotLabel.value = "";
    newSlotActorType.value = "";
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to add slot";
  } finally {
    busy.value = false;
  }
}

async function handleRemoveSlot(policyId: string, slotId: string) {
  busy.value = true;
  error.value = null;
  try {
    await deletePolicySlot(policyId, slotId);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to remove slot";
  } finally {
    busy.value = false;
  }
}

async function submitCreate() {
  if (!newPolicyName.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const slug = newPolicyName.value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    await createPolicy({
      slug: `${slug}-${Date.now()}`,
      name: newPolicyName.value.trim(),
      projectId: props.projectId,
    });
    newPolicyName.value = "";
    showCreateForm.value = false;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to create policy";
  } finally {
    busy.value = false;
  }
}

function actorLabel(type: string | null) {
  if (type === "human") return "human";
  if (type === "agent") return "agent";
  return "any";
}
</script>

<template>
  <section class="ps-policies">
    <h2>Signoff policies</h2>
    <p class="ps-policies__hint">
      Policies define the default sign-off slots added to new requirements. The project default
      applies to every new requirement created under this project, unless overridden at the task level.
    </p>

    <p v-if="error" class="ps-policies__error" role="alert">{{ error }}</p>

    <!-- Project default row -->
    <div class="ps-policies__default-row">
      <span class="ps-policies__default-label">Project default:</span>
      <template v-if="defaultPolicy">
        <span class="ps-policies__default-name" data-testid="project-default-name">
          {{ defaultPolicy.name }}
        </span>
        <button
          type="button"
          class="ps-policies__btn ps-policies__btn--danger ps-policies__btn--sm"
          data-testid="clear-default-btn"
          :disabled="busy"
          @click="clearDefault"
        >
          Clear
        </button>
      </template>
      <span v-else class="ps-policies__none">None — new requirements get no default slots</span>
    </div>

    <!-- Policy list -->
    <ul v-if="policies.length" class="ps-policies__list">
      <li
        v-for="policy in policies"
        :key="policy.id"
        class="ps-policies__item"
        :data-testid="`policy-row-${policy.id}`"
      >
        <div class="ps-policies__item-header">
          <span class="ps-policies__item-name">{{ policy.name }}</span>
          <span
            v-if="policy.id === defaultPolicyId"
            class="ps-policies__default-badge"
            :data-testid="`default-badge-${policy.id}`"
          >default</span>

          <div class="ps-policies__item-actions">
            <button
              v-if="policy.id !== defaultPolicyId"
              type="button"
              class="ps-policies__btn ps-policies__btn--sm"
              :data-testid="`set-default-btn-${policy.id}`"
              :disabled="busy"
              @click="setDefault(policy.id)"
            >
              Set default
            </button>
            <button
              type="button"
              class="ps-policies__btn ps-policies__btn--ghost ps-policies__btn--sm"
              :data-testid="`manage-slots-btn-${policy.id}`"
              :disabled="busy"
              @click="toggleSlots(policy.id)"
            >
              {{ expandedPolicyId === policy.id ? "Done" : "Slots" }}
            </button>
            <button
              type="button"
              class="ps-policies__btn ps-policies__btn--danger ps-policies__btn--sm"
              :data-testid="`delete-policy-btn-${policy.id}`"
              :disabled="busy"
              @click="handleDelete(policy.id)"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Slots -->
        <div class="ps-policies__slots">
          <span
            v-for="slot in policy.slots"
            :key="slot.id"
            class="ps-policies__slot-chip"
            :class="`ps-policies__slot-chip--${actorLabel(slot.requiredActorType)}`"
            :data-testid="`slot-chip-${slot.id}`"
          >
            {{ slot.label }}
            <em class="ps-policies__slot-type">{{ actorLabel(slot.requiredActorType) }}</em>
            <button
              v-if="expandedPolicyId === policy.id"
              type="button"
              class="ps-policies__slot-remove"
              :data-testid="`remove-slot-btn-${slot.id}`"
              :disabled="busy"
              @click="handleRemoveSlot(policy.id, slot.id)"
            >×</button>
          </span>

          <!-- Add slot inline form (shown when expanded) -->
          <template v-if="expandedPolicyId === policy.id">
            <div class="ps-policies__add-slot-row">
              <input
                v-model="newSlotLabel"
                type="text"
                class="ps-policies__input ps-policies__input--sm"
                placeholder="Slot label"
                :data-testid="`add-slot-label-${policy.id}`"
                :disabled="busy"
              />
              <select
                v-model="newSlotActorType"
                class="ps-policies__select ps-policies__select--sm"
                :data-testid="`add-slot-actor-${policy.id}`"
                :disabled="busy"
              >
                <option value="">Any actor</option>
                <option value="human">Human only</option>
                <option value="agent">Agent only</option>
              </select>
              <button
                type="button"
                class="ps-policies__btn ps-policies__btn--sm"
                :data-testid="`add-slot-submit-${policy.id}`"
                :disabled="busy || !newSlotLabel.trim()"
                @click="handleAddSlot(policy.id)"
              >
                Add slot
              </button>
            </div>
          </template>
        </div>
      </li>
    </ul>
    <p v-else class="ps-policies__empty" data-testid="no-policies">No policies yet.</p>

    <!-- Create new policy -->
    <div v-if="!showCreateForm" class="ps-policies__create-trigger">
      <button
        type="button"
        class="ps-policies__btn ps-policies__btn--ghost ps-policies__btn--sm"
        data-testid="create-policy-btn"
        :disabled="busy"
        @click="showCreateForm = true"
      >
        + New policy
      </button>
    </div>
    <div v-else class="ps-policies__create-form" data-testid="create-form">
      <input
        v-model="newPolicyName"
        type="text"
        class="ps-policies__input"
        placeholder="Policy name (e.g. 3-eyes)"
        data-testid="new-policy-name"
        :disabled="busy"
        @keydown.enter="submitCreate"
      />
      <div class="ps-policies__create-actions">
        <button
          type="button"
          class="ps-policies__btn ps-policies__btn--sm"
          data-testid="create-submit-btn"
          :disabled="busy || !newPolicyName.trim()"
          @click="submitCreate"
        >
          Create
        </button>
        <button
          type="button"
          class="ps-policies__btn ps-policies__btn--ghost ps-policies__btn--sm"
          :disabled="busy"
          @click="showCreateForm = false; newPolicyName = ''"
        >
          Cancel
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ps-policies {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}

.ps-policies h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.ps-policies__hint {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0;
}

.ps-policies__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
  margin: 0;
}

.ps-policies__default-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  font-size: 0.875rem;
}

.ps-policies__default-label {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.ps-policies__default-name {
  font-weight: 600;
}

.ps-policies__none {
  color: var(--text-secondary);
  font-style: italic;
  font-size: 0.8125rem;
}

.ps-policies__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ps-policies__item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}

.ps-policies__item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ps-policies__item-name {
  font-weight: 500;
  flex: 1;
}

.ps-policies__default-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  background: #d4edda;
  color: #155724;
  border-radius: 3px;
  font-size: 0.72rem;
  font-weight: 600;
}

.ps-policies__item-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  margin-left: auto;
}

.ps-policies__slots {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.ps-policies__slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  background: #e8e8e8;
  font-size: 0.75rem;
}

.ps-policies__slot-chip--human { background: #d4edda; }
.ps-policies__slot-chip--agent { background: #cce5ff; }
.ps-policies__slot-chip--any   { background: #e8e8e8; }

.ps-policies__slot-type {
  font-style: normal;
  opacity: 0.6;
  font-size: 0.68rem;
}

.ps-policies__slot-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0 0.1rem;
  color: var(--text-secondary);
}

.ps-policies__slot-remove:hover { color: #c0392b; }

.ps-policies__add-slot-row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

.ps-policies__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
  margin: 0;
}

.ps-policies__create-trigger { }

.ps-policies__create-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ps-policies__create-actions {
  display: flex;
  gap: 0.35rem;
}

.ps-policies__input {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.ps-policies__input--sm { font-size: 0.8rem; padding: 0.25rem 0.4rem; }

.ps-policies__select {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.ps-policies__select--sm { font-size: 0.8rem; padding: 0.25rem 0.35rem; }

.ps-policies__btn {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--accent, #004de6);
  background: var(--accent, #004de6);
  color: white;
  cursor: pointer;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.ps-policies__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ps-policies__btn--sm { font-size: 0.75rem; padding: 0.2rem 0.45rem; }

.ps-policies__btn--ghost {
  background: none;
  color: var(--text-secondary);
  border-color: var(--border-primary);
}

.ps-policies__btn--danger {
  background: none;
  color: #c0392b;
  border-color: #c0392b;
}
</style>
