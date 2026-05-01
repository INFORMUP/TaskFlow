<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import {
  listScopes,
  listTokens,
  createToken,
  revokeToken,
  type Scope,
  type TokenSummary,
  type CreatedToken,
} from "@/api/tokens.api";

const scopes = ref<Scope[]>([]);
const tokens = ref<TokenSummary[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

// Create form
const formName = ref("");
const formSelectedScopes = ref<Record<string, boolean>>({});
const formExpiresAt = ref("");
const formError = ref<string | null>(null);
const creating = ref(false);

// Plaintext dialog
const createdToken = ref<CreatedToken | null>(null);
const copiedMessage = ref<string | null>(null);

// Revoke confirmation
const revokeTarget = ref<TokenSummary | null>(null);
const revoking = ref(false);

const selectedScopeKeys = computed(() =>
  Object.entries(formSelectedScopes.value)
    .filter(([, v]) => v)
    .map(([k]) => k)
);

const canSubmit = computed(
  () =>
    formName.value.trim().length > 0 &&
    selectedScopeKeys.value.length > 0 &&
    !creating.value
);

async function refreshTokens() {
  tokens.value = (await listTokens()).data;
}

onMounted(async () => {
  loading.value = true;
  try {
    const [s, t] = await Promise.all([listScopes(), listTokens()]);
    scopes.value = s.data;
    tokens.value = t.data;
  } catch (e: any) {
    loadError.value = e?.error?.message || "Failed to load settings";
  } finally {
    loading.value = false;
  }
});

async function handleCreate() {
  if (!canSubmit.value) return;
  formError.value = null;
  creating.value = true;
  try {
    const body: Parameters<typeof createToken>[0] = {
      name: formName.value.trim(),
      scopes: selectedScopeKeys.value,
    };
    if (formExpiresAt.value) {
      body.expiresAt = new Date(formExpiresAt.value).toISOString();
    }
    const result = await createToken(body);
    createdToken.value = result;
    formName.value = "";
    formSelectedScopes.value = {};
    formExpiresAt.value = "";
    await refreshTokens();
  } catch (e: any) {
    formError.value = e?.error?.message || "Failed to create token";
  } finally {
    creating.value = false;
  }
}

async function copyTokenToClipboard() {
  if (!createdToken.value) return;
  try {
    await navigator.clipboard.writeText(createdToken.value.token);
    copiedMessage.value = "Copied to clipboard";
    setTimeout(() => {
      copiedMessage.value = null;
    }, 2000);
  } catch {
    copiedMessage.value = "Copy failed — select and copy manually";
  }
}

function dismissCreatedToken() {
  createdToken.value = null;
  copiedMessage.value = null;
}

function askRevoke(token: TokenSummary) {
  revokeTarget.value = token;
}

async function confirmRevoke() {
  if (!revokeTarget.value) return;
  revoking.value = true;
  try {
    await revokeToken(revokeTarget.value.id);
    revokeTarget.value = null;
    await refreshTokens();
  } finally {
    revoking.value = false;
  }
}

function cancelRevoke() {
  revokeTarget.value = null;
}

function tokenStatus(t: TokenSummary): string {
  if (t.revokedAt) return "Revoked";
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return "Expired";
  return "Active";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function handleModalKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (createdToken.value) {
    // The created-token dialog is not dismissible via Esc — user must confirm
    // they saved the plaintext token. Swallow the event so it doesn't bubble.
    e.stopPropagation();
    return;
  }
  if (revokeTarget.value) {
    e.stopPropagation();
    cancelRevoke();
  }
}

const previouslyFocused = ref<HTMLElement | null>(null);

watch(
  () => createdToken.value || revokeTarget.value,
  (open, prev) => {
    if (open && !prev) {
      previouslyFocused.value = (document.activeElement as HTMLElement) ?? null;
    } else if (!open && prev) {
      previouslyFocused.value?.focus?.();
    }
  }
);

onMounted(() => {
  document.addEventListener("keydown", handleModalKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleModalKeydown);
});
</script>

<template>
  <div class="settings" data-testid="settings-view">
    <h1 class="settings__title">Settings</h1>

    <nav class="settings__nav">
      <a href="/settings/labels">Labels →</a>
    </nav>

    <section class="settings__section">
      <h2 class="settings__heading">API Tokens</h2>
      <p class="settings__subheading">
        Tokens let external tools and agents act on your behalf. Each token's
        permissions are the intersection of its scopes and your team permissions.
      </p>

      <div v-if="loadError" class="settings__error" role="alert">{{ loadError }}</div>

      <form v-if="!loading" class="settings__form" @submit.prevent="handleCreate">
        <h3 class="settings__subheading-bold">Create a new token</h3>
        <label class="settings__field">
          <span class="settings__label">Name</span>
          <input
            v-model="formName"
            type="text"
            class="settings__input"
            placeholder="e.g. ci-runner"
            data-testid="token-name-input"
          />
        </label>

        <fieldset class="settings__field settings__scopes">
          <legend class="settings__label">Scopes</legend>
          <label
            v-for="s in scopes"
            :key="s.key"
            class="settings__scope"
            :data-testid="`scope-option-${s.key}`"
          >
            <input
              v-model="formSelectedScopes[s.key]"
              type="checkbox"
              :data-testid="`scope-checkbox-${s.key}`"
            />
            <span>
              <strong>{{ s.key }}</strong>
              <span class="settings__scope-desc">— {{ s.description }}</span>
            </span>
          </label>
        </fieldset>

        <label class="settings__field">
          <span class="settings__label">
            Expires at <span class="settings__muted">(optional)</span>
          </span>
          <input
            v-model="formExpiresAt"
            type="datetime-local"
            class="settings__input"
            data-testid="token-expires-input"
          />
        </label>

        <div
          v-if="formError"
          class="settings__error"
          role="alert"
          data-testid="token-form-error"
        >
          {{ formError }}
        </div>

        <button
          type="submit"
          class="settings__btn"
          :disabled="!canSubmit"
          data-testid="token-create-submit"
        >
          {{ creating ? "Creating..." : "Create token" }}
        </button>
      </form>

      <div v-if="!loading" class="settings__list" data-testid="token-list">
        <h3 class="settings__subheading-bold">Your tokens</h3>
        <div v-if="tokens.length === 0" class="settings__empty">
          You have no tokens yet.
        </div>
        <table v-else class="settings__table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Scopes</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
              <th scope="col">Expires</th>
              <th scope="col"><span class="settings__sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tokens"
              :key="t.id"
              :data-testid="`token-row-${t.id}`"
            >
              <td>
                {{ t.name }}
                <span v-if="t.integration" class="settings__badge" title="Integration token">
                  Integration
                </span>
              </td>
              <td>
                <span v-for="s in t.scopes" :key="s" class="settings__scope-pill">
                  {{ s }}
                </span>
              </td>
              <td>
                <span
                  class="settings__status"
                  :class="`settings__status--${tokenStatus(t).toLowerCase()}`"
                >
                  {{ tokenStatus(t) }}
                </span>
              </td>
              <td>{{ formatDate(t.createdAt) }}</td>
              <td>{{ formatDate(t.lastUsedAt) }}</td>
              <td>{{ formatDate(t.expiresAt) }}</td>
              <td>
                <button
                  v-if="!t.revokedAt"
                  class="settings__link-btn"
                  :data-testid="`token-revoke-${t.id}`"
                  @click="askRevoke(t)"
                >
                  Revoke
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Plaintext-once dialog -->
    <div
      v-if="createdToken"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-created-title"
      data-testid="token-created-modal"
    >
      <div class="modal">
        <h3 id="token-created-title" class="modal__title">Token created</h3>
        <p class="modal__warning">
          <strong>Copy this token now.</strong> You won't be able to see it
          again — if you lose it, you'll need to create a new one.
        </p>
        <div class="modal__token" data-testid="token-plaintext">
          {{ createdToken.token }}
        </div>
        <div class="modal__actions">
          <button
            class="settings__btn settings__btn--outline"
            data-testid="token-copy-button"
            @click="copyTokenToClipboard"
          >
            Copy to clipboard
          </button>
          <button
            class="settings__btn"
            data-testid="token-dismiss-button"
            @click="dismissCreatedToken"
          >
            I've saved it
          </button>
        </div>
        <div
          v-if="copiedMessage"
          class="modal__copied"
          role="status"
          aria-live="polite"
          data-testid="token-copy-status"
        >
          {{ copiedMessage }}
        </div>
      </div>
    </div>

    <!-- Revoke confirmation dialog -->
    <div
      v-if="revokeTarget"
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-revoke-title"
      data-testid="token-revoke-modal"
    >
      <div class="modal">
        <h3 id="token-revoke-title" class="modal__title">Revoke token?</h3>
        <p>
          This will immediately disable
          <strong>{{ revokeTarget.name }}</strong>. Any running agents or
          integrations using it will stop working.
        </p>
        <div class="modal__actions">
          <button
            class="settings__btn settings__btn--outline"
            data-testid="token-revoke-cancel"
            @click="cancelRevoke"
          >
            Cancel
          </button>
          <button
            class="settings__btn settings__btn--danger"
            :disabled="revoking"
            data-testid="token-revoke-confirm"
            @click="confirmRevoke"
          >
            {{ revoking ? "Revoking..." : "Revoke" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  max-width: 960px;
  margin: 0 auto;
}

.settings__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.settings__title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}

.settings__nav {
  margin-bottom: 1rem;
}

.settings__nav a {
  font-size: 0.875rem;
  color: var(--accent);
  text-decoration: none;
}

.settings__nav a:hover {
  text-decoration: underline;
}

.settings__section {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
}

.settings__heading {
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}

.settings__subheading {
  color: var(--text-secondary);
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
}

.settings__subheading-bold {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.settings__form {
  padding: 1rem;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  margin-bottom: 1.5rem;
  background: var(--bg-secondary);
}

.settings__field {
  display: block;
  margin-bottom: 0.75rem;
}

.settings__label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
}

.settings__muted {
  color: var(--text-secondary);
  font-weight: 400;
}

.settings__input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
}

.settings__scopes {
  border: none;
  padding: 0;
}

.settings__scope {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.875rem;
  cursor: pointer;
}

.settings__scope-desc {
  color: var(--text-secondary);
  margin-left: 0.25rem;
}

.settings__btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.settings__btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.settings__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings__btn--outline {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.settings__btn--outline:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.settings__btn--danger {
  background: var(--priority-critical);
}

.settings__btn--danger:hover:not(:disabled) {
  background: #b91c1c;
}

.settings__error {
  color: var(--priority-critical);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.settings__list {
  margin-top: 1.5rem;
}

.settings__empty {
  color: var(--text-secondary);
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
}

.settings__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.settings__table th,
.settings__table td {
  padding: 0.625rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: top;
}

.settings__table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.settings__scope-pill {
  display: inline-block;
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 0.0625rem 0.375rem;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  margin-right: 0.25rem;
}

.settings__badge {
  display: inline-block;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0 0.375rem;
  border-radius: 3px;
  font-size: 0.6875rem;
  margin-left: 0.25rem;
  font-weight: 500;
}

.settings__status {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.settings__status--active {
  color: var(--priority-low);
}

.settings__status--revoked,
.settings__status--expired {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.settings__link-btn {
  background: none;
  border: none;
  color: var(--priority-critical);
  cursor: pointer;
  font-size: 0.8125rem;
  padding: 0;
}

.settings__link-btn:hover {
  text-decoration: underline;
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
  max-width: 540px;
  width: 90%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.modal__title {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
}

.modal__warning {
  background: #fef3c7;
  color: #92400e;
  padding: 0.625rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.modal__token {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--bg-secondary);
  padding: 0.75rem;
  border-radius: 4px;
  word-break: break-all;
  border: 1px solid var(--border-primary);
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.modal__copied {
  text-align: right;
  color: var(--priority-low);
  font-size: 0.75rem;
  margin-top: 0.5rem;
}
</style>
