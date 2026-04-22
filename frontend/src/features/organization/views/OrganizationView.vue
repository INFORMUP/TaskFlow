<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useOrg } from "@/composables/useOrg";
import {
  getOrganization,
  updateMemberRole,
  removeMember,
  listInvitations,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  type OrgDetail,
  type OrgMember,
  type OrgRole,
  type Invitation,
} from "@/api/organizations.api";

const org = useOrg();
const router = useRouter();

const detail = ref<OrgDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

// Invite form
const newEmail = ref("");
const newRole = ref<OrgRole>("member");
const addingMember = ref(false);
const addError = ref<string | null>(null);

// Invitations list + last-issued link (hidden by default; admins can reveal
// it as a fallback when they need to share manually — email is the default
// delivery channel now).
const invitations = ref<Invitation[]>([]);
const lastInviteLink = ref<string | null>(null);
const lastInviteEmail = ref<string | null>(null);
const showInviteLink = ref(false);

// Remove confirmation
const removeTarget = ref<OrgMember | null>(null);
const removing = ref(false);

function inviteLinkFor(token: string): string {
  return `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

const canManage = computed(
  () => detail.value?.role === "owner" || detail.value?.role === "admin"
);
const canManageOwners = computed(() => detail.value?.role === "owner");

function roleOptions(target: OrgMember): OrgRole[] {
  if (!detail.value) return [];
  if (canManageOwners.value) return ["owner", "admin", "member"];
  if (target.role === "owner") return ["owner"];
  return ["admin", "member"];
}

async function load() {
  if (!org.activeOrgId.value) {
    detail.value = null;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    const orgId = org.activeOrgId.value;
    detail.value = await getOrganization(orgId);
    try {
      invitations.value = (await listInvitations(orgId)).data;
    } catch {
      invitations.value = [];
    }
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to load organization";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (org.activeOrg.value && org.activeOrg.value.role === "member") {
    router.replace("/");
    return;
  }
  load();
});

watch(
  () => org.activeOrgId.value,
  () => load()
);

async function handleAddMember() {
  if (!detail.value) return;
  addError.value = null;
  addingMember.value = true;
  try {
    const email = newEmail.value.trim();
    const invite = await createInvitation(detail.value.id, {
      email,
      role: newRole.value,
    });
    invitations.value = [invite, ...invitations.value];
    lastInviteLink.value = inviteLinkFor(invite.token);
    lastInviteEmail.value = email;
    newEmail.value = "";
    newRole.value = "member";
  } catch (e: any) {
    addError.value = e?.error?.message || "Failed to send invitation";
  } finally {
    addingMember.value = false;
  }
}

async function handleResend(invite: Invitation) {
  if (!detail.value) return;
  try {
    const updated = await resendInvitation(detail.value.id, invite.id);
    const idx = invitations.value.findIndex((i) => i.id === invite.id);
    if (idx >= 0) invitations.value[idx] = updated;
    lastInviteLink.value = inviteLinkFor(updated.token);
    lastInviteEmail.value = updated.email;
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to resend invitation";
  }
}

async function handleRevoke(invite: Invitation) {
  if (!detail.value) return;
  try {
    await revokeInvitation(detail.value.id, invite.id);
    const idx = invitations.value.findIndex((i) => i.id === invite.id);
    if (idx >= 0) {
      invitations.value[idx] = {
        ...invite,
        status: "revoked",
        revokedAt: new Date().toISOString(),
      };
    }
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to revoke invitation";
  }
}

async function copyInviteLink() {
  if (!lastInviteLink.value) return;
  try {
    await navigator.clipboard.writeText(lastInviteLink.value);
  } catch {
    // Clipboard API can fail in insecure contexts; user can copy manually.
  }
}

function dismissInviteLink() {
  lastInviteLink.value = null;
  lastInviteEmail.value = null;
  showInviteLink.value = false;
}

async function handleRoleChange(member: OrgMember, role: OrgRole) {
  if (!detail.value || role === member.role) return;
  try {
    const updated = await updateMemberRole(detail.value.id, member.userId, role);
    const idx = detail.value.members.findIndex(
      (m) => m.userId === member.userId
    );
    if (idx >= 0) detail.value.members[idx] = updated;
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to change role";
  }
}

function askRemove(member: OrgMember) {
  removeTarget.value = member;
}

async function confirmRemove() {
  if (!detail.value || !removeTarget.value) return;
  removing.value = true;
  try {
    await removeMember(detail.value.id, removeTarget.value.userId);
    detail.value.members = detail.value.members.filter(
      (m) => m.userId !== removeTarget.value!.userId
    );
    removeTarget.value = null;
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to remove member";
  } finally {
    removing.value = false;
  }
}

function cancelRemove() {
  removeTarget.value = null;
}
</script>

<template>
  <div class="organization" data-testid="organization-view">
    <h1 class="organization__title">Organization</h1>

    <div
      v-if="!canManage && !loading"
      class="organization__blocked"
      data-testid="organization-blocked"
    >
      You don't have permission to view organization settings.
    </div>

    <div v-if="loading" class="organization__loading">Loading…</div>

    <div v-if="loadError" class="organization__error">{{ loadError }}</div>

    <section v-if="detail && canManage" class="organization__section">
      <h2 class="organization__heading">{{ detail.name }}</h2>
      <p class="organization__subheading">
        Your role: <strong>{{ detail.role }}</strong>
      </p>

      <form class="organization__form" @submit.prevent="handleAddMember">
        <h3 class="organization__subheading-bold">Invite a member</h3>
        <label class="organization__field">
          <span class="organization__label">Email</span>
          <input
            v-model="newEmail"
            type="email"
            required
            class="organization__input"
            data-testid="org-invite-email"
          />
        </label>
        <label class="organization__field">
          <span class="organization__label">Role</span>
          <select
            v-model="newRole"
            class="organization__input"
            data-testid="org-invite-role"
          >
            <option v-if="canManageOwners" value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </label>
        <div v-if="addError" class="organization__error" data-testid="org-invite-error">
          {{ addError }}
        </div>
        <button
          type="submit"
          class="organization__btn"
          :disabled="addingMember || !newEmail"
          data-testid="org-invite-submit"
        >
          {{ addingMember ? "Sending..." : "Send invitation" }}
        </button>
      </form>

      <div
        v-if="lastInviteLink"
        class="organization__invite-link"
        data-testid="org-invite-link"
      >
        <p class="organization__invite-link-intro">
          Invitation emailed to <strong>{{ lastInviteEmail }}</strong>.
          <button
            v-if="!showInviteLink"
            type="button"
            class="organization__link-btn organization__link-btn--neutral"
            data-testid="org-invite-link-show"
            @click="showInviteLink = true"
          >
            Show link
          </button>
          <button
            v-else
            type="button"
            class="organization__link-btn organization__link-btn--neutral"
            data-testid="org-invite-link-hide"
            @click="showInviteLink = false"
          >
            Hide link
          </button>
        </p>
        <div v-if="showInviteLink" class="organization__invite-link-row">
          <input
            class="organization__input"
            readonly
            :value="lastInviteLink"
            data-testid="org-invite-link-value"
          />
          <button
            type="button"
            class="organization__btn organization__btn--outline"
            data-testid="org-invite-link-copy"
            @click="copyInviteLink"
          >
            Copy
          </button>
          <button
            type="button"
            class="organization__btn organization__btn--outline"
            data-testid="org-invite-link-dismiss"
            @click="dismissInviteLink"
          >
            Dismiss
          </button>
        </div>
      </div>

      <h3 class="organization__subheading-bold">Pending invitations</h3>
      <table
        v-if="invitations.length"
        class="organization__table"
        data-testid="org-invitations-list"
      >
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Expires</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="inv in invitations"
            :key="inv.id"
            :data-testid="`org-invitation-row-${inv.id}`"
          >
            <td>{{ inv.email }}</td>
            <td>{{ inv.role }}</td>
            <td>
              <span
                class="organization__badge"
                :class="`organization__badge--${inv.status}`"
                :data-testid="`org-invitation-status-${inv.id}`"
              >
                {{ inv.status }}
              </span>
            </td>
            <td>{{ new Date(inv.createdAt).toLocaleDateString() }}</td>
            <td>{{ new Date(inv.expiresAt).toLocaleDateString() }}</td>
            <td>
              <button
                v-if="inv.status === 'pending' || inv.status === 'expired'"
                type="button"
                class="organization__link-btn organization__link-btn--neutral"
                :data-testid="`org-invitation-resend-${inv.id}`"
                @click="handleResend(inv)"
              >
                Resend
              </button>
              <button
                v-if="inv.status === 'pending' || inv.status === 'expired'"
                type="button"
                class="organization__link-btn"
                :data-testid="`org-invitation-revoke-${inv.id}`"
                @click="handleRevoke(inv)"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="organization__subheading">No invitations yet.</p>

      <h3 class="organization__subheading-bold">Members</h3>
      <table class="organization__table" data-testid="org-member-list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in detail.members"
            :key="m.userId"
            :data-testid="`org-member-row-${m.userId}`"
          >
            <td>{{ m.displayName }}</td>
            <td>{{ m.email ?? "—" }}</td>
            <td>
              <select
                :value="m.role"
                :disabled="!canManageOwners && m.role === 'owner'"
                :data-testid="`org-role-select-${m.userId}`"
                @change="handleRoleChange(m, ($event.target as HTMLSelectElement).value as OrgRole)"
              >
                <option
                  v-for="r in roleOptions(m)"
                  :key="r"
                  :value="r"
                >
                  {{ r }}
                </option>
              </select>
            </td>
            <td>
              <button
                v-if="canManageOwners || m.role !== 'owner'"
                class="organization__link-btn"
                :data-testid="`org-remove-${m.userId}`"
                @click="askRemove(m)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <div
      v-if="removeTarget"
      class="modal-backdrop"
      data-testid="org-remove-modal"
    >
      <div class="modal">
        <h3 class="modal__title">Remove member?</h3>
        <p>
          Remove <strong>{{ removeTarget.displayName }}</strong> from the
          organization?
        </p>
        <div class="modal__actions">
          <button
            class="organization__btn organization__btn--outline"
            data-testid="org-remove-cancel"
            @click="cancelRemove"
          >
            Cancel
          </button>
          <button
            class="organization__btn organization__btn--danger"
            :disabled="removing"
            data-testid="org-remove-confirm"
            @click="confirmRemove"
          >
            {{ removing ? "Removing..." : "Remove" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.organization {
  max-width: 960px;
  margin: 0 auto;
}
.organization__title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}
.organization__section {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
}
.organization__heading {
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}
.organization__subheading {
  color: var(--text-secondary);
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
}
.organization__subheading-bold {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 1rem 0 0.75rem;
}
.organization__form {
  padding: 1rem;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  background: var(--bg-secondary);
  margin-bottom: 1rem;
}
.organization__field {
  display: block;
  margin-bottom: 0.75rem;
}
.organization__label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
}
.organization__input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
}
.organization__btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}
.organization__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.organization__btn--outline {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}
.organization__btn--danger {
  background: var(--priority-critical);
}
.organization__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.organization__table th,
.organization__table td {
  padding: 0.625rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
}
.organization__error {
  color: var(--priority-critical);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
.organization__blocked {
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  color: var(--text-secondary);
}
.organization__loading {
  padding: 1rem;
  color: var(--text-secondary);
}
.organization__link-btn {
  background: none;
  border: none;
  color: var(--priority-critical);
  cursor: pointer;
  font-size: 0.8125rem;
}
.organization__link-btn:hover {
  text-decoration: underline;
}
.organization__link-btn--neutral {
  color: var(--text-primary);
  margin-right: 0.75rem;
}
.organization__invite-link {
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  margin-bottom: 1rem;
}
.organization__invite-link-intro {
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}
.organization__invite-link-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.organization__invite-link-row .organization__input {
  flex: 1;
}
.organization__badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: capitalize;
  background: var(--bg-secondary);
  border: 1px solid var(--border-soft);
}
.organization__badge--pending {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}
.organization__badge--accepted {
  background: #d1fae5;
  color: #065f46;
  border-color: #a7f3d0;
}
.organization__badge--revoked,
.organization__badge--expired {
  background: #f3f4f6;
  color: #6b7280;
  border-color: #e5e7eb;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--bg-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}
.modal__title {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
}
.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
