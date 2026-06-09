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
  uploadRequirementImage,
  uploadAttestationEvidenceImage,
  deleteRequirementImage,
  getImageBlobUrl,
  type Requirement,
  type SignoffSlot,
  type Attestation,
  type ImageMeta,
} from "@/api/requirements.api";
import { listOrgMembers } from "@/api/org-members.api";

const props = defineProps<{ taskId: string }>();

const requirements = ref<Requirement[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

// Top-level add form
const showAddForm = ref(false);
const newStatement = ref("");
const newRationale = ref("");

// Inline edit
const editingId = ref<string | null>(null);
const editStatement = ref("");
const editRationale = ref("");

// Add-slot form
const showSlotFormFor = ref<string | null>(null);
const newSlotLabel = ref("");
const newSlotActorType = ref<"" | "human" | "agent">("");

// Add-child form: keyed by parent requirement id
const addingChildFor = ref<string | null>(null);
const childStatement = ref("");

// Pending attestation inline form
const pendingAttestation = ref<{
  reqId: string;
  slotId: string;
  verdict: "met" | "not_met";
  comment: string;
  evidenceFile: File | null;
} | null>(null);

// Lightbox state
const lightboxUrl = ref<string | null>(null);

// Evidence image blob URL cache (keyed by image ID stored in attestation.evidence)
const evidenceBlobUrls = ref<Record<string, string>>({});

// Actor display names resolved client-side from org members (keyed by actorId)
const actorNames = ref<Record<string, string>>({});

// Slot IDs whose comment-history thread is expanded
const expandedThreads = ref<Set<string>>(new Set());

watch(() => props.taskId, load, { immediate: true });

function depthOf(number: string): number {
  return number.split(".").length;
}

function indentStyle(number: string) {
  const depth = depthOf(number);
  return depth > 1 ? { paddingLeft: `${(depth - 1) * 1.5}rem` } : {};
}

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

function openChildForm(reqId: string) {
  addingChildFor.value = reqId;
  childStatement.value = "";
  // Close other open forms
  showAddForm.value = false;
  showSlotFormFor.value = null;
}

async function handleAddChild(parentId: string) {
  if (!childStatement.value.trim()) return;
  busy.value = true;
  try {
    await createRequirement(props.taskId, {
      statement: childStatement.value.trim(),
      parentId,
    });
    addingChildFor.value = null;
    childStatement.value = "";
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

function handleSignOff(reqId: string, slotId: string) {
  pendingAttestation.value = { reqId, slotId, verdict: "met", comment: "", evidenceFile: null };
}

function handleCancelSignOff(reqId: string, slotId: string) {
  pendingAttestation.value = { reqId, slotId, verdict: "not_met", comment: "", evidenceFile: null };
}

async function submitAttestation() {
  if (!pendingAttestation.value) return;
  const { reqId, slotId, verdict, comment, evidenceFile } = pendingAttestation.value;
  busy.value = true;
  try {
    let evidenceImageId: string | undefined;
    if (evidenceFile) {
      evidenceImageId = await uploadAttestationEvidenceImage(props.taskId, reqId, slotId, evidenceFile);
    }
    await createAttestation(props.taskId, reqId, slotId, {
      verdict,
      comment: comment.trim() || undefined,
      evidence: evidenceImageId,
    });
    pendingAttestation.value = null;
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to record attestation";
  } finally {
    busy.value = false;
  }
}

function handleEvidenceFileChange(event: Event) {
  if (!pendingAttestation.value) return;
  const input = event.target as HTMLInputElement;
  pendingAttestation.value.evidenceFile = input.files?.[0] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isImageId(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

async function loadEvidenceBlobUrl(imageId: string) {
  if (!evidenceBlobUrls.value[imageId]) {
    evidenceBlobUrls.value[imageId] = await getImageBlobUrl(imageId);
  }
}

async function openLightbox(imageId: string) {
  await loadEvidenceBlobUrl(imageId);
  lightboxUrl.value = evidenceBlobUrls.value[imageId];
}

function closeLightbox() {
  lightboxUrl.value = null;
}

function isAgentOnly(slot: SignoffSlot): boolean {
  return slot.requiredActorType === "agent";
}

function isSignedOff(slot: SignoffSlot): boolean {
  const latest = slot.attestations.at(-1);
  return latest?.verdict === "met";
}

// ── At-a-glance state & attester identity ─────────────────────────────────────

// Drives the state-forward left border: met (green) / not_met (red) / pending (grey)
function slotState(slot: SignoffSlot): "met" | "not_met" | "pending" {
  const latest = slot.attestations.at(-1);
  if (!latest) return "pending";
  return latest.verdict === "met" ? "met" : "not_met";
}

function resolveActorName(actorId: string): string {
  return actorNames.value[actorId] ?? "Unknown";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Initials for the actor of the latest attestation, or null if unattested
function latestAttesterInitials(slot: SignoffSlot): string | null {
  const latest = slot.attestations.at(-1);
  return latest ? initials(resolveActorName(latest.actorId)) : null;
}

// ── Comment history thread ────────────────────────────────────────────────────

function commentCount(slot: SignoffSlot): number {
  return slot.attestations.filter((a) => a.comment).length;
}

// Attestations carrying a comment, newest first
function commentedAttestations(slot: SignoffSlot): Attestation[] {
  return slot.attestations.filter((a) => a.comment).slice().reverse();
}

function toggleThread(slotId: string) {
  const next = new Set(expandedThreads.value);
  if (next.has(slotId)) next.delete(slotId);
  else next.add(slotId);
  expandedThreads.value = next;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Images ───────────────────────────────────────────────────────────────────

const imageBlobUrls = ref<Record<string, string>>({});

async function loadImageUrls(images: ImageMeta[]) {
  for (const img of images) {
    if (!imageBlobUrls.value[img.id]) {
      imageBlobUrls.value[img.id] = await getImageBlobUrl(img.id);
    }
  }
}

async function loadActorNames() {
  // Best-effort: attester names are decorative, so a failure here must not
  // break the requirements panel.
  try {
    const members = await listOrgMembers();
    actorNames.value = Object.fromEntries(members.map((m) => [m.id, m.displayName]));
  } catch {
    // leave actorNames as-is; helpers fall back to "Unknown"
  }
}

async function load() {
  error.value = null;
  if (Object.keys(actorNames.value).length === 0) await loadActorNames();
  try {
    requirements.value = await getRequirements(props.taskId);
    for (const req of requirements.value) {
      if (req.images.length) await loadImageUrls(req.images);
      for (const slot of req.slots) {
        const latest = slot.attestations.at(-1);
        if (latest?.evidence) await loadEvidenceBlobUrl(latest.evidence);
      }
    }
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load requirements";
  }
}

async function handleUploadImage(reqId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    await uploadRequirementImage(props.taskId, reqId, file);
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to upload image";
  } finally {
    busy.value = false;
    input.value = "";
  }
}

async function handleDeleteImage(reqId: string, imageId: string) {
  busy.value = true;
  try {
    await deleteRequirementImage(props.taskId, reqId, imageId);
    const url = imageBlobUrls.value[imageId];
    if (url) URL.revokeObjectURL(url);
    delete imageBlobUrls.value[imageId];
    await load();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to delete image";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- Lightbox modal -->
  <teleport to="body">
    <div
      v-if="lightboxUrl"
      class="req-lightbox-backdrop"
      data-testid="lightbox-backdrop"
      @click.self="closeLightbox"
      @keydown.esc="closeLightbox"
    >
      <div class="req-lightbox">
        <button
          type="button"
          class="req-lightbox__close"
          data-testid="lightbox-close"
          @click="closeLightbox"
        >×</button>
        <img :src="lightboxUrl" alt="Attestation evidence" class="req-lightbox__img" />
      </div>
    </div>
  </teleport>

  <section class="req-panel">
    <div class="req-panel__header">
      <h3>Requirements</h3>
      <button
        type="button"
        class="req-panel__add-btn"
        data-testid="add-req-btn"
        :disabled="busy"
        @click="showAddForm = !showAddForm; addingChildFor = null"
      >
        + Add requirement
      </button>
    </div>

    <DefaultPolicySection :task-id="taskId" @changed="load" />

    <p v-if="error" class="req-panel__error" role="alert">{{ error }}</p>

    <!-- Top-level add form -->
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
        :data-depth="depthOf(req.number)"
        :style="indentStyle(req.number)"
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
            <!-- Hierarchical number badge -->
            <span
              class="req-panel__number"
              :data-testid="`req-number-${req.id}`"
            >{{ req.number }}</span>

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
                :data-testid="`add-child-btn-${req.id}`"
                :disabled="busy"
                @click="openChildForm(req.id)"
              >
                + Child
              </button>
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

          <!-- Images -->
          <div v-if="req.images.length" class="req-panel__images">
            <div
              v-for="img in req.images"
              :key="img.id"
              class="req-panel__image-wrap"
            >
              <img
                v-if="imageBlobUrls[img.id]"
                :src="imageBlobUrls[img.id]"
                :alt="img.filename"
                :data-testid="`req-image-${img.id}`"
                class="req-panel__image-thumb"
              />
              <button
                type="button"
                class="req-panel__image-delete"
                :data-testid="`delete-image-${img.id}`"
                :disabled="busy"
                @click="handleDeleteImage(req.id, img.id)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="req-panel__image-upload">
            <label
              :data-testid="`upload-image-btn-${req.id}`"
              class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm req-panel__upload-label"
            >
              + Image
              <input
                type="file"
                accept="image/*"
                class="req-panel__file-input"
                :data-testid="`image-file-input-${req.id}`"
                :disabled="busy"
                @change="handleUploadImage(req.id, $event)"
              />
            </label>
          </div>

          <!-- Add-child inline form -->
          <div v-if="addingChildFor === req.id" class="req-panel__child-form">
            <input
              v-model="childStatement"
              type="text"
              placeholder="Child requirement statement"
              class="req-panel__input"
              :data-testid="`child-req-statement-${req.id}`"
              :disabled="busy"
              @keydown.enter="handleAddChild(req.id)"
            />
            <div class="req-panel__form-actions">
              <button
                type="button"
                class="req-panel__btn req-panel__btn--sm"
                :data-testid="`child-req-submit-${req.id}`"
                :disabled="busy || !childStatement.trim()"
                @click="handleAddChild(req.id)"
              >
                Add
              </button>
              <button
                type="button"
                class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                :data-testid="`child-req-cancel-${req.id}`"
                @click="addingChildFor = null"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Slots -->
          <ul v-if="req.slots.length" class="req-panel__slots">
            <li
              v-for="slot in req.slots"
              :key="slot.id"
              class="req-panel__slot"
              :class="`req-panel__slot--${slotState(slot).replace('_', '-')}`"
              :data-testid="`slot-row-${slot.id}`"
            >
              <div class="req-panel__slot-main">
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
                    :data-testid="`attestation-status-${slot.id}`"
                  >
                    {{ isSignedOff(slot) ? "✓" : "✗" }}
                  </span>
                  <span
                    v-else
                    class="req-panel__attestation req-panel__attestation--pending"
                    :data-testid="`attestation-status-${slot.id}`"
                  >—</span>
                  <button
                    v-if="commentCount(slot) > 0"
                    type="button"
                    class="req-panel__chip"
                    :class="{ 'req-panel__chip--active': expandedThreads.has(slot.id) }"
                    :title="expandedThreads.has(slot.id) ? 'Hide comment history' : 'View comment history'"
                    :data-testid="`comment-count-${slot.id}`"
                    @click="toggleThread(slot.id)"
                  >💬 {{ commentCount(slot) }}</button>
                  <button
                    v-if="isImageId(slot.attestations.at(-1)?.evidence)"
                    type="button"
                    class="req-panel__evidence-btn"
                    title="View evidence image"
                    :data-testid="`evidence-btn-${slot.id}`"
                    @click="openLightbox(slot.attestations.at(-1)!.evidence!)"
                  >📷</button>
                </span>

                <span
                  v-if="latestAttesterInitials(slot)"
                  class="req-panel__attester req-panel__attester--row"
                  :title="resolveActorName(slot.attestations.at(-1)!.actorId)"
                  :data-testid="`attester-${slot.id}`"
                >{{ latestAttesterInitials(slot) }}</span>

                <template v-if="pendingAttestation?.slotId !== slot.id">
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
                </template>

                <button
                  type="button"
                  class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                  :data-testid="`delete-slot-${slot.id}`"
                  :disabled="busy"
                  @click="handleDeleteSlot(req.id, slot)"
                >
                  ×
                </button>
              </div>

              <!-- Inline attestation comment form -->
              <div
                v-if="pendingAttestation?.slotId === slot.id"
                class="req-panel__attest-form"
                :data-testid="`attest-form-${slot.id}`"
              >
                <textarea
                  v-model="pendingAttestation.comment"
                  class="req-panel__attest-comment"
                  :data-testid="`attest-comment-${slot.id}`"
                  rows="2"
                  :placeholder="pendingAttestation.verdict === 'not_met'
                    ? 'What still needs to be done? (optional)'
                    : 'Add a note (optional)'"
                  :disabled="busy"
                />
                <div class="req-panel__attest-evidence">
                  <label
                    class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm req-panel__upload-label"
                    :data-testid="`attest-evidence-btn-${slot.id}`"
                  >
                    {{ pendingAttestation.evidenceFile ? pendingAttestation.evidenceFile.name : '+ Attach image' }}
                    <input
                      type="file"
                      accept="image/*"
                      class="req-panel__file-input"
                      :data-testid="`attest-evidence-input-${slot.id}`"
                      :disabled="busy"
                      @change="handleEvidenceFileChange"
                    />
                  </label>
                  <button
                    v-if="pendingAttestation.evidenceFile"
                    type="button"
                    class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                    :disabled="busy"
                    @click="pendingAttestation.evidenceFile = null"
                  >×</button>
                </div>
                <div class="req-panel__form-actions">
                  <button
                    type="button"
                    :class="[
                      'req-panel__btn',
                      'req-panel__btn--sm',
                      pendingAttestation.verdict === 'met'
                        ? 'req-panel__btn--signoff'
                        : 'req-panel__btn--cancel-signoff',
                    ]"
                    :data-testid="`attest-submit-${slot.id}`"
                    :disabled="busy"
                    @click="submitAttestation"
                  >
                    {{ pendingAttestation.verdict === "met" ? "Confirm sign off" : "Confirm cancel" }}
                  </button>
                  <button
                    type="button"
                    class="req-panel__btn req-panel__btn--ghost req-panel__btn--sm"
                    :data-testid="`attest-cancel-${slot.id}`"
                    :disabled="busy"
                    @click="pendingAttestation = null"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <!-- Attestation comment history (toggled via the 💬 chip) -->
              <ul
                v-if="expandedThreads.has(slot.id) && commentCount(slot) > 0"
                class="req-panel__thread"
                :data-testid="`attest-thread-${slot.id}`"
              >
                <li
                  v-for="att in commentedAttestations(slot)"
                  :key="att.id"
                  class="req-panel__entry"
                  :data-testid="`attest-entry-${slot.id}-${att.id}`"
                >
                  <span
                    class="req-panel__attester"
                    :title="resolveActorName(att.actorId)"
                  >{{ initials(resolveActorName(att.actorId)) }}</span>
                  <div class="req-panel__entry-body">
                    <div class="req-panel__entry-head">
                      <span class="req-panel__entry-name">{{ resolveActorName(att.actorId) }}</span>
                      <span
                        class="req-panel__entry-verdict"
                        :class="att.verdict === 'met' ? 'att--met' : 'att--not-met'"
                      >{{ att.verdict === "met" ? "✓ met" : "✗ not met" }}</span>
                      <span class="req-panel__entry-time">{{ formatTimestamp(att.createdAt) }}</span>
                    </div>
                    <p class="req-panel__entry-comment">{{ att.comment }}</p>
                    <button
                      v-if="isImageId(att.evidence)"
                      type="button"
                      class="req-panel__entry-evidence"
                      @click="openLightbox(att.evidence!)"
                    >📷 View evidence</button>
                  </div>
                </li>
              </ul>
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
.req-panel__child-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--color-bg-muted, #f8f8f8);
  border-radius: 4px;
}

.req-panel__child-form {
  margin-top: 0.35rem;
  margin-bottom: 0;
}

.req-panel__slot-form {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
  padding: 0.35rem 0.5rem;
  background: var(--color-bg-muted, #f8f8f8);
  border-radius: 4px;
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

/* Hierarchical number badge */
.req-panel__number {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary, #666);
  background: var(--color-bg-muted, #f0f0f0);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  flex-shrink: 0;
  min-width: 1.8rem;
  text-align: center;
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
  margin: 0.25rem 0 0.5rem 2.2rem;
}

.req-panel__slots {
  list-style: none;
  padding: 0 0 0 2.2rem;
  margin: 0.4rem 0 0;
}

.req-panel__slot {
  padding: 0.3rem 0.5rem;
  margin: 0.3rem 0;
  border: 1px solid #e3e6ea;
  border-left: 4px solid #c9ced6; /* pending (default) */
  border-radius: 6px;
}

.req-panel__slot--met {
  border-left-color: #28a745;
  background: #f6fbf7;
}

.req-panel__slot--not-met {
  border-left-color: #dc3545;
  background: #fdf6f6;
}

.req-panel__slot--pending {
  border-left-color: #c9ced6;
}

.req-panel__slot-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.req-panel__attest-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.35rem;
  padding: 0.4rem 0.5rem;
  background: var(--color-bg-muted, #f8f8f8);
  border-radius: 4px;
}

.req-panel__attest-comment {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.82rem;
  resize: vertical;
  font-family: inherit;
}

/* ── Comment-count chip & attester initials ──────────────────────────────── */

.req-panel__chip {
  font-size: 0.7rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.36rem;
  border: 1px solid #d4d8de;
  border-radius: 10px;
  background: #fff;
  color: #444;
  cursor: pointer;
}

.req-panel__chip:hover {
  background: #f0f1f3;
}

.req-panel__chip--active {
  background: #eef3fb;
  border-color: #b9cdec;
  color: #1a4d8f;
}

.req-panel__attestation--pending {
  color: #b0b6bf;
}

.req-panel__attester {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: #fff;
  background: #6c7589;
  flex: 0 0 auto;
}

.req-panel__attester--row {
  margin-left: auto;
}

/* ── Comment history thread ───────────────────────────────────────────────── */

.req-panel__thread {
  list-style: none;
  margin: 0.5rem 0 0.1rem;
  padding: 0.5rem 0 0;
  border-top: 1px dashed #e3e6ea;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.req-panel__entry {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}

.req-panel__entry-body {
  flex: 1;
}

.req-panel__entry-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.74rem;
  flex-wrap: wrap;
}

.req-panel__entry-name {
  font-weight: 600;
}

.req-panel__entry-verdict {
  font-weight: 700;
}

.req-panel__entry-time {
  color: var(--color-text-muted, #666);
}

.req-panel__entry-comment {
  font-size: 0.8rem;
  margin: 0.2rem 0 0;
  line-height: 1.4;
}

.req-panel__entry-evidence {
  font-size: 0.72rem;
  color: #1a4d8f;
  background: none;
  border: none;
  padding: 0.2rem 0 0;
  cursor: pointer;
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
  padding: 0.2rem 0 0.2rem 2.2rem;
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

.req-panel__images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.4rem 0 0.4rem 2.2rem;
}

.req-panel__image-wrap {
  position: relative;
  display: inline-flex;
}

.req-panel__image-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border, #ddd);
  cursor: pointer;
}

.req-panel__image-delete {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: #c0392b;
  color: white;
  font-size: 0.65rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.req-panel__image-upload {
  margin: 0.25rem 0 0 2.2rem;
}

.req-panel__upload-label {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.req-panel__file-input {
  display: none;
}

.req-panel__attest-evidence {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.req-panel__evidence-btn {
  background: none;
  border: none;
  padding: 0 0.1rem;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.75;
}

.req-panel__evidence-btn:hover {
  opacity: 1;
}

.req-lightbox-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.req-lightbox {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.req-lightbox__img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
}

.req-lightbox__close {
  position: absolute;
  top: -0.75rem;
  right: -0.75rem;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: none;
  background: #fff;
  color: #333;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
</style>
