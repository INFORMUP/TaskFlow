<script setup lang="ts">
import { computed } from "vue";
import { useOrg } from "@/composables/useOrg";

const org = useOrg();

const hasMultiple = computed(() => org.memberships.value.length > 1);

async function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const orgId = target.value;
  if (!orgId || orgId === org.activeOrgId.value) return;
  try {
    await org.setActiveOrg(orgId);
    window.location.reload();
  } catch {
    // Revert to previous selection on failure
    target.value = org.activeOrgId.value ?? "";
  }
}
</script>

<template>
  <select
    v-if="org.memberships.value.length > 0"
    class="org-switcher"
    :value="org.activeOrgId.value ?? ''"
    :disabled="!hasMultiple"
    data-testid="org-switcher"
    :aria-label="'Active organization'"
    @change="handleChange"
  >
    <option
      v-for="m in org.memberships.value"
      :key="m.id"
      :value="m.id"
      :data-testid="`org-option-${m.slug}`"
    >
      {{ m.name }}
    </option>
  </select>
</template>

<style scoped>
.org-switcher {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  max-width: 180px;
}

.org-switcher:disabled {
  cursor: default;
  opacity: 0.8;
}
</style>
