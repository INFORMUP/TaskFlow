<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { listFlows, type Flow, type FlowStatusBreakdownEntry } from "@/api/flows.api";
import StageBadge from "@/components/visual/StageBadge.vue";
import { DEFAULT_STATUS_COLOR } from "@/utils/contrast";

const flows = ref<Flow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const MIN_SEGMENT_PX = 6;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    flows.value = await listFlows();
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load flows";
  } finally {
    loading.value = false;
  }
}

function nonEmpty(byStatus: FlowStatusBreakdownEntry[]): FlowStatusBreakdownEntry[] {
  return byStatus.filter((b) => b.count > 0);
}

function segmentColor(entry: FlowStatusBreakdownEntry): string {
  return entry.status.color || DEFAULT_STATUS_COLOR;
}

// Proportional flex-basis as a percentage. Combined with min-width and flex-grow,
// this gives a stable layout where tiny segments stay visible but large ones still dominate.
function segmentBasis(entry: FlowStatusBreakdownEntry, openCount: number): string {
  if (openCount <= 0) return "0%";
  const pct = (entry.count / openCount) * 100;
  return `${pct.toFixed(4)}%`;
}

function breakdownAriaLabel(flow: Flow): string {
  const entries = nonEmpty(flow.stats.byStatus);
  if (entries.length === 0) return "No open tasks";
  const parts = entries.map((b) => `${b.count} in ${b.status.name}`);
  return `Breakdown: ${parts.join(", ")}`;
}

onMounted(load);
</script>

<template>
  <section class="flows">
    <header class="flows__header">
      <h1>Flows</h1>
    </header>

    <p v-if="loading" class="flows__empty">Loading…</p>
    <p v-else-if="error" class="flows__error">{{ error }}</p>
    <p v-else-if="flows.length === 0" class="flows__empty">No flows found.</p>
    <div v-else class="flows__grid">
      <article
        v-for="f in flows"
        :key="f.id"
        class="flow-card"
        :data-testid="`flow-card-${f.slug}`"
      >
        <header class="flow-card__header">
          <router-link
            :to="`/tasks/${f.slug}`"
            class="flow-card__name"
            :data-testid="`flow-link-${f.slug}`"
          >
            {{ f.name }}
          </router-link>
          <span class="flow-card__slug">{{ f.slug }}</span>
        </header>

        <p v-if="f.description" class="flow-card__description">
          {{ f.description }}
        </p>

        <template v-if="f.stats.openCount === 0">
          <p
            class="flow-card__empty"
            :data-testid="`flow-empty-${f.slug}`"
          >No open tasks</p>
        </template>
        <template v-else>
          <div
            class="flow-card__breakdown"
            role="group"
            :aria-label="breakdownAriaLabel(f)"
            :data-testid="`flow-breakdown-${f.slug}`"
          >
            <div
              class="flow-card__bar"
              :data-testid="`flow-bar-${f.slug}`"
              aria-hidden="true"
            >
              <span
                v-for="b in nonEmpty(f.stats.byStatus)"
                :key="b.status.id"
                class="flow-card__segment"
                :data-testid="`flow-segment-${f.slug}-${b.status.slug}`"
                :title="`${b.status.name}: ${b.count}`"
                :style="{
                  flexBasis: segmentBasis(b, f.stats.openCount),
                  backgroundColor: segmentColor(b),
                }"
              />
            </div>
            <ul class="flow-card__chips">
              <li
                v-for="b in nonEmpty(f.stats.byStatus)"
                :key="b.status.id"
                :data-testid="`flow-chip-${f.slug}-${b.status.slug}`"
              >
                <StageBadge
                  :name="`${b.count} ${b.status.name}`"
                  :color="b.status.color"
                />
              </li>
            </ul>
          </div>
        </template>

        <footer class="flow-card__footer">
          <span
            class="flow-card__open-count"
            :data-testid="`flow-open-count-${f.slug}`"
          >{{ f.stats.openCount }} open</span>
          <span
            class="flow-card__mine-count"
            :data-testid="`flow-mine-count-${f.slug}`"
          >· {{ f.stats.assignedToMeCount }} mine</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.flows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.flows__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.flows__empty,
.flows__error {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.flows__error {
  color: var(--priority-critical, #c0392b);
}
.flows__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1rem;
}

.flow-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-primary);
  box-shadow: var(--shadow-card);
  border-radius: var(--radius);
  border: 1px solid var(--border-soft, transparent);
}
.flow-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.flow-card__name {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.flow-card__name:hover {
  text-decoration: underline;
}
.flow-card__slug {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.flow-card__description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.35;
}
.flow-card__empty {
  margin: 0.25rem 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-style: italic;
}
.flow-card__breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.flow-card__bar {
  display: flex;
  width: 100%;
  height: 0.625rem;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}
.flow-card__segment {
  display: block;
  height: 100%;
  flex-grow: 1;
  flex-shrink: 1;
  min-width: 6px;
}
.flow-card__segment:not(:last-child) {
  margin-right: 1px;
}
.flow-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.flow-card__footer {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.flow-card__open-count {
  font-weight: 600;
  color: var(--text-primary);
}
</style>
