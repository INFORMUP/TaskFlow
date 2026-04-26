<script setup lang="ts">
import NavBar from "@/components/NavBar.vue";

const version = __APP_VERSION__;
</script>

<template>
  <div class="app-layout">
    <NavBar />
    <main class="app-main">
      <slot />
    </main>
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

.app-footer {
  padding: 0.75rem 1.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
</style>
