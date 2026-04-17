<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useOrg } from "@/composables/useOrg";
import { createOrganization, switchOrganization } from "@/api/organizations.api";

const router = useRouter();
const org = useOrg();

const slug = ref("");
const name = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

async function handleSubmit() {
  error.value = null;
  submitting.value = true;
  try {
    const created = await createOrganization({
      slug: slug.value.trim(),
      name: name.value.trim(),
    });
    org.addMembership(created);
    await switchOrganization(created.id);
    localStorage.setItem("activeOrgId", created.id);
    await org.hydrate();
    router.replace("/");
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to create organization";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="create-org" data-testid="create-org-view">
    <h1 class="create-org__title">Create your first organization</h1>
    <p class="create-org__subtitle">
      You'll be the owner. You can invite others once the organization is
      created.
    </p>

    <form class="create-org__form" @submit.prevent="handleSubmit">
      <label class="create-org__field">
        <span class="create-org__label">Organization name</span>
        <input
          v-model="name"
          type="text"
          required
          minlength="1"
          maxlength="120"
          class="create-org__input"
          data-testid="create-org-name"
          placeholder="Acme Co"
        />
      </label>
      <label class="create-org__field">
        <span class="create-org__label">Slug</span>
        <input
          v-model="slug"
          type="text"
          required
          minlength="1"
          maxlength="64"
          pattern="[a-z0-9-]+"
          class="create-org__input"
          data-testid="create-org-slug"
          placeholder="acme"
        />
      </label>
      <div v-if="error" class="create-org__error" data-testid="create-org-error">
        {{ error }}
      </div>
      <button
        type="submit"
        class="create-org__btn"
        :disabled="submitting || !name || !slug"
        data-testid="create-org-submit"
      >
        {{ submitting ? "Creating..." : "Create organization" }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.create-org {
  max-width: 480px;
  margin: 3rem auto;
}
.create-org__title {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.create-org__subtitle {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}
.create-org__form {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1.5rem;
}
.create-org__field {
  display: block;
  margin-bottom: 0.75rem;
}
.create-org__label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}
.create-org__input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
}
.create-org__btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}
.create-org__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.create-org__error {
  color: var(--priority-critical);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
</style>
