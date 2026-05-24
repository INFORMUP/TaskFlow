<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import FeedbackBubble from "@/components/FeedbackBubble.vue";

const version = __APP_VERSION__;

// Routes can opt out of the centered max-width container (e.g. the
// dependencies graph/table) to use the full viewport width.
const route = useRoute();
const fullBleed = computed(() => route.meta.fullBleed === true);
</script>

<template>
  <div class="app-layout">
    <NavBar />
    <main class="app-main" :class="{ 'app-main--full': fullBleed }">
      <slot />
    </main>
    <FeedbackBubble />
    <footer class="app-footer">
      <span>TaskFlow v{{ version }}</span>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  padding: 1.5rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

/* Full-bleed routes span the viewport width; the view supplies its own
   horizontal padding. */
.app-main--full {
  max-width: none;
  padding-left: 0;
  padding-right: 0;
}

.app-footer {
  padding: 0.75rem 1.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
</style>
