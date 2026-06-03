<script setup lang="ts">
import { ref, watch } from "vue";
import DefaultPolicySection from "./DefaultPolicySection.vue";
import {
  getRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  createSlot,
  deleteSlot,
  createAttestation,
  type Requirement,
  type SignoffSlot,
} from "@/api/requirements.api";

const props = defineProps<{ taskId: string }>();

const requirements = ref<Requirement[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

// Add-requirement form
const showAddForm = ref(false);
const newStatement = ref("");
const newRationale = ref("");

// Edit requirement inline
const editingId = ref<string | null>(null);
const editStatement = ref("");
const editRationale = ref("");

// Add-slot form: keyed by requirement id
const showSlotFormFor = ref<string | null>(null);
const newSlotLabel = ref("");
const newSlotActorType = ref<"" | "human" | "agent">("");

async function load() {
  error.value = null;
  try {
    requirements.value = await getRequirements(props.taskId);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load requirements";
  }
}

watch(() => props.taskId, load, { immediate: true });

async function handleAddRequirement() {
  if (!newStatement.value.trim()) return;
  busy.value = true;
  try {
    await createRequirement(props.taskId, {
      statement: newStatement.value.trim(),
      rationale: newRationale.value.trim() || undefined,
    });
    newStatement.value = "";
    newRationale.value = "";
    showAddForm.value = false;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to create requirement";
  } finally {
    busy.value = false;
  }
}

function startEdit(req: Requirement) {
  editingId.value = req.id;
  editStatement.value = req.statement;
  editRationale.value = req.rationale ?? "";
}

async function handleUpdateRequirement(reqId: string) {
  busy.value = true;
  try {
    await updateRequirement(props.taskId, reqId, {
      statement: editStatement.value.trim(),
      rationale: editRationale.value.trim() || null,
    });
    editingId.value = null;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to update requirement";
  } finally {
    busy.value = false;
  }
}

async function handleDeleteRequirement(reqId: string) {
  busy.value = true;
  try {
    await deleteRequirement(props.taskId, reqId);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to delete requirement";
  } finally {
    busy.value = false;
  }
}

function openSlotForm(reqId: string) {
  showSlotFormFor.value = reqId;
  newSlotLabel.value = "";
  newSlotActorType.value = "";
}

async function handleAddSlot(reqId: string) {
  if (!newSlotLabel.value.trim()) return;
  busy.value = true;
  try {
    await createSlot(props.taskId, reqId, {
      label: newSlotLabel.value.trim(),
      requiredActorType: newSlotActorType.value || null,
    });
    showSlotFormFor.value = null;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to add slot";
  } finally {
    busy.value = false;
  }
}

async function handleDeleteSlot(reqId: string, slot: SignoffSlot) {
  busy.value = true;
  try {
    await deleteSlot(props.taskId, reqId, slot.id);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to delete slot";
  } finally {
    busy.value = false;
  }
}

async function handleSignOff(reqId: string, slotId: string) {
  busy.value = true;
  try {
    await createAttestation(props.taskId, reqId, slotId, { verdict: "met" });
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to record sign-off";
  } finally {
    busy.value = false;
  }
}

async function handleCancelSignOff(reqId: string, slotId: string) {
  busy.value = true;
  try {
    await createAttestation(props.taskId, reqId, slotId, { verdict: "not_met" });
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to cancel sign-off";
  } finally {
    busy.value = false;
  }
}

function isAgentOnly(slot: SignoffSlot): boolean {
  return slot.requiredActorType === "agent";
}

function isSignedOff(slot: SignoffSlot): boolean {
  const latest = slot.attestations.at(-1);
  return latest?.verdict === "met";
}
</script>

<template>
  <section class="req-panel">
    <div class="req-panel__header">
      <h3>Requirements</h3>
      <button
        type="button"
        class="req-panel__add-btn"
        data-testid="add-req-btn"
        :disabled="busy"
        @click="showAddForm = !showAddForm"
      >
        + Add requirement
      </button>
    </div>

    <DefaultPolicySection :task-id="taskId" @changed="load" />

    <p v-if="error" class="req-panel__error" role="alert">{{ error }}</p>

    <div v-if="showAddForm" class="req-panel__add-form">
      <input
        v-model="newStatement"
        type="text"
        placeholder="Requirement statement"
        data-testid="new-req-statement"
        class="req-panel__input"
        :disabled="busy"
      />
      <input
        v-model="newRationale"
        type="text"
        placeholder="Rationale (optional)"
        data-testid="new-req-rationale"
        class="req-panel__input"
        :disabled="busy"
      />
      <div class="req-panel__form-actions">
        <button
          type="button"
          class="req-panel__btn"
          data-testid="new-req-submit"
          :disabled="busy || !newStatement.trim()"
          @click="handleAddRequirement"
        >
          Add
        </button>
        <button
          type="button"
          class="req-panel__btn req-panel__btn--ghost"
          @click="showAddForm = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <p v-if="requirements.length === 0 && !showAddForm" class="req-panel__empty">
      No requirements yet.
    </p>

    <ul class="req-panel__list">
      <li
        v-for="req in requirements"
        :key="req.id"
        class="req-panel__item"
        :data-testid="`req-row-${req.id}`"
      >
        <!-- Editing inline -->
        <div v-if="editingId === req.id" class="req-panel__edit-form">
          <input
            v-model="editStatement"
            type="text"
            class="req-panel__input"
            :disabled="busy"
            :data-testid="`edit-statement-${req.id}`"
          />
          <input
            v-model="editRationale"
            type="text"
            placeholder="Rationale (optional)"
            class="req-panel__input"
            :disabled="busy"
            :data-testid="`edit-rationale-${req.id}`"
          />
          <div class="req-panel__form-actions">
            <button
              type="button"
              class="req-panel__btn"
              :disabled="busy || !editStatement.trim()"
              @click="handleUpdateRequirement(req.id)"
            >
              Save
            </button>
            <button
              type="button"
              class="req-panel__btn req-panel__btn--ghost"
              @click="editingId = null"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Normal view -->
        <template v-else>
          <div class="req-panel__row">
            <span class="req-panel__ordinal">#{{ req.ordinal }}</span>
            <span class="req-panel__statement">{{ req.statement }}</span>
            <span
              class="req-panel__quorum"
              :class="req.quorum.verified ? 'quorum--verified' : 'quorum--pending'"
              :data-testid="`quorum-chip-${req.id}`"
            >
              {{ req.quorum.signed }}/{{ req.quorum.total }}
            </span>
            <span
              v-if="req.quorum.notDistinct"
              class="req-panel__not-distinct"
              :data-testid="`not-distinct-${req.id}`"
              title="Self-review detected: same actor signed multiple slots"
            >
              ⚠ not-distinct
            </span>
            <div class="req-panel__actions">
              <button
                type="button"
                class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                :data-testid="`edit-req-${req.id}`"
                :disabled="busy"
                @click="startEdit(req)"
              >
                Edit
              </button>
              <button
                type="button"
                class="req-panel__btn req-panel__btn--danger req-panel__btn--sm"
                :data-testid="`delete-req-${req.id}`"
                :disabled="busy"
                @click="handleDeleteRequirement(req.id)"
              >
                Delete
              </button>
            </div>
          </div>

          <p v-if="req.rationale" class="req-panel__rationale">{{ req.rationale }}</p>

          <!-- Slots -->
          <ul v-if="req.slots.length" class="req-panel__slots">
            <li
              v-for="slot in req.slots"
              :key="slot.id"
              class="req-panel__slot"
              :data-testid="`slot-row-${slot.id}`"
            >
              <span class="req-panel__slot-label">{{ slot.label }}</span>

              <span
                v-if="isAgentOnly(slot)"
                class="req-panel__slot-badge req-panel__slot-badge--agent"
                :data-testid="`agent-only-${slot.id}`"
              >
                agent only
              </span>
              <span
                v-else-if="slot.requiredActorType === 'human'"
                class="req-panel__slot-badge req-panel__slot-badge--human"
              >
                human
              </span>

              <span class="req-panel__slot-attestations">
                <span
                  v-if="slot.attestations.length > 0"
                  class="req-panel__attestation"
                  :class="isSignedOff(slot) ? 'att--met' : 'att--not-met'"
                >
                  {{ isSignedOff(slot) ? "✓" : "✗" }}
                </span>
              </span>

              <button
                v-if="!isAgentOnly(slot) && !isSignedOff(slot)"
                type="button"
                class="req-panel__btn req-panel__btn--sm req-panel__btn--signoff"
                :data-testid="`signoff-btn-${slot.id}`"
                :disabled="busy"
                @click="handleSignOff(req.id, slot.id)"
              >
                Sign off
              </button>
              <button
                v-if="!isAgentOnly(slot) && isSignedOff(slot)"
                type="button"
                class="req-panel__btn req-panel__btn--sm req-panel__btn--cancel-signoff"
                :data-testid="`cancel-signoff-btn-${slot.id}`"
                :disabled="busy"
                @click="handleCancelSignOff(req.id, slot.id)"
              >
                Cancel sign off
              </button>

              <button
                type="button"
                class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                :data-testid="`delete-slot-${slot.id}`"
                :disabled="busy"
                @click="handleDeleteSlot(req.id, slot)"
              >
                ×
              </button>
            </li>
          </ul>

          <!-- Add-slot form -->
          <div v-if="showSlotFormFor === req.id" class="req-panel__slot-form">
            <input
              v-model="newSlotLabel"
              type="text"
              placeholder="Slot label"
              class="req-panel__input req-panel__input--sm"
              :data-testid="`new-slot-label-${req.id}`"
              :disabled="busy"
            />
            <select
              v-model="newSlotActorType"
              class="req-panel__select"
              :data-testid="`new-slot-actor-type-${req.id}`"
              :disabled="busy"
            >
              <option value="">Any actor</option>
              <option value="human">Human only</option>
              <option value="agent">Agent only</option>
            </select>
            <button
              type="button"
              class="req-panel__btn req-panel__btn--sm"
              :data-testid="`add-slot-submit-${req.id}`"
              :disabled="busy || !newSlotLabel.trim()"
              @click="handleAddSlot(req.id)"
            >
              Add
            </button>
            <button
              type="button"
              class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
              @click="showSlotFormFor = null"
            >
              Cancel
            </button>
          </div>

          <button
            v-else
            type="button"
            class="req-panel__add-slot-btn"
            :data-testid="`open-slot-form-${req.id}`"
            :disabled="busy"
            @click="openSlotForm(req.id)"
          >
            + Add slot
          </button>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.req-panel {
  margin-top: 1.5rem;
}

.req-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.req-panel__header h3 {
  margin: 0;
  font-size: 1rem;
}

.req-panel__error {
  color: var(--color-danger, #c0392b);
  font-size: 0.85rem;
}

.req-panel__empty {
  font-size: 0.85rem;
  color: var(--color-text-muted, #888);
}

.req-panel__add-form,
.req-panel__edit-form,
.req-panel__slot-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--color-bg-muted, #f8f8f8);
  border-radius: 4px;
}

.req-panel__slot-form {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.req-panel__form-actions {
  display: flex;
  gap: 0.35rem;
}

.req-panel__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.req-panel__item {
  border-bottom: 1px solid var(--color-border, #eee);
  padding: 0.6rem 0;
}

.req-panel__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.req-panel__ordinal {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--color-text-muted, #888);
  flex-shrink: 0;
}

.req-panel__statement {
  flex: 1;
  font-size: 0.9rem;
}

.req-panel__quorum {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.quorum--verified {
  background: #d4edda;
  color: #155724;
}

.quorum--pending {
  background: #fff3cd;
  color: #856404;
}

.req-panel__not-distinct {
  font-size: 0.7rem;
  background: #f8d7da;
  color: #721c24;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.req-panel__actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.req-panel__rationale {
  font-size: 0.8rem;
  color: var(--color-text-muted, #666);
  margin: 0.25rem 0 0.5rem 1.5rem;
}

.req-panel__slots {
  list-style: none;
  padding: 0 0 0 1.5rem;
  margin: 0.4rem 0 0;
}

.req-panel__slot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0;
  flex-wrap: wrap;
}

.req-panel__slot-label {
  font-size: 0.82rem;
}

.req-panel__slot-badge {
  font-size: 0.68rem;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
}

.req-panel__slot-badge--agent {
  background: #cce5ff;
  color: #004085;
}

.req-panel__slot-badge--human {
  background: #d4edda;
  color: #155724;
}

.req-panel__slot-attestations {
  display: flex;
  gap: 0.15rem;
}

.req-panel__attestation {
  font-size: 0.8rem;
  font-weight: 600;
}

.att--met {
  color: #28a745;
}

.att--not-met {
  color: #dc3545;
}

.req-panel__add-slot-btn {
  background: none;
  border: none;
  color: var(--accent, #004de6);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0 0.2rem 1.5rem;
  margin-top: 0.25rem;
}

.req-panel__add-btn {
  background: none;
  border: 1px solid var(--accent, #004de6);
  color: var(--accent, #004de6);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.req-panel__btn {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--accent, #004de6);
  background: var(--accent, #004de6);
  color: white;
  cursor: pointer;
  font-size: 0.8rem;
}

.req-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.req-panel__btn--ghost {
  background: none;
  color: var(--color-text-muted, #666);
  border-color: var(--color-border, #ccc);
}

.req-panel__btn--danger {
  background: none;
  color: #c0392b;
  border-color: #c0392b;
}

.req-panel__btn--signoff {
  background: #27ae60;
  border-color: #27ae60;
  color: white;
}

.req-panel__btn--signoff:hover:not(:disabled) {
  background: #219150;
  border-color: #219150;
}

.req-panel__btn--cancel-signoff {
  background: #c0392b;
  border-color: #c0392b;
  color: white;
}

.req-panel__btn--cancel-signoff:hover:not(:disabled) {
  background: #a93226;
  border-color: #a93226;
}

.req-panel__btn--sm {
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
}

.req-panel__input {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.85rem;
}

.req-panel__input--sm {
  font-size: 0.8rem;
}

.req-panel__select {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>
