<script setup lang="ts">
import { computed } from "vue";
import type { TaskGraphNode, TaskGraphResponse } from "@/api/tasks.api";
import { orderGraph } from "../graph-order";
import ProjectChip from "@/components/visual/ProjectChip.vue";
import StatusBadge from "@/components/visual/StatusBadge.vue";

const props = defineProps<{ graph: TaskGraphResponse }>();

const rows = computed(() => orderGraph(props.graph));

function detailTo(node: TaskGraphNode) {
  return { name: "task-detail", params: { flow: node.flow.slug, taskId: node.id } };
}
</script>

<template>
  <table class="graph-table" data-testid="graph-table">
    <thead>
      <tr>
        <th scope="col">ID</th>
        <th scope="col">Title</th>
        <th scope="col">Project</th>
        <th scope="col">Status</th>
        <th scope="col">Blocked by</th>
        <th scope="col">Blocks</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.node.id"
        data-testid="graph-row"
        :data-display-id="row.node.displayId"
        :data-ready="row.ready ? 'true' : 'false'"
        :data-closed="row.node.currentStatus.slug === 'closed' ? 'true' : 'false'"
        class="graph-table__row"
        :class="{
          'graph-table__row--ready': row.ready,
          'graph-table__row--closed': row.node.currentStatus.slug === 'closed',
          'graph-table__row--cycle': row.inCycle,
        }"
      >
        <td class="graph-table__id">
          <span v-if="row.node.isRoot" class="graph-table__root">{{
            row.node.displayId
          }}</span>
          <router-link v-else :to="detailTo(row.node)">{{
            row.node.displayId
          }}</router-link>
          <span
            v-if="row.ready"
            class="graph-table__ready-pill"
            title="All blockers are closed — ready to pick up next"
            >ready</span
          >
        </td>
        <td class="graph-table__title">
          <span v-if="row.node.isRoot">{{ row.node.title }}</span>
          <router-link v-else :to="detailTo(row.node)">{{ row.node.title }}</router-link>
        </td>
        <td>
          <div class="graph-table__chips">
            <ProjectChip
              v-for="p in row.node.projects"
              :key="p.key"
              :project-key="p.key"
              :name="p.name"
              :color="p.color"
            />
          </div>
        </td>
        <td class="graph-table__status">
          <StatusBadge
            :name="row.node.currentStatus.name"
            :color="row.node.currentStatus.color"
          />
        </td>
        <td data-testid="row-blocked-by">
          <div class="graph-table__refs">
            <template v-if="row.blockedBy.length">
              <div
                v-for="b in row.blockedBy"
                :key="b.id"
                class="graph-table__ref-line"
                data-testid="ref-line"
              >
                <router-link :to="detailTo(b)" class="graph-table__ref">{{
                  b.displayId
                }}</router-link>
                <StatusBadge :name="b.currentStatus.name" :color="b.currentStatus.color" />
              </div>
            </template>
            <span v-else class="graph-table__none">—</span>
          </div>
        </td>
        <td data-testid="row-blocks">
          <div class="graph-table__refs">
            <template v-if="row.blocks.length">
              <div
                v-for="b in row.blocks"
                :key="b.id"
                class="graph-table__ref-line"
                data-testid="ref-line"
              >
                <router-link :to="detailTo(b)" class="graph-table__ref">{{
                  b.displayId
                }}</router-link>
                <StatusBadge :name="b.currentStatus.name" :color="b.currentStatus.color" />
              </div>
            </template>
            <span v-else class="graph-table__none">—</span>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.graph-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.graph-table th,
.graph-table td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border-primary, #eee);
  vertical-align: top;
  /* Only the title column wraps; every other column stays on one line so task
     ids like FEAT-81 never break across rows. */
  white-space: nowrap;
}
.graph-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted, #666);
  position: sticky;
  top: 0;
  /* Opaque background + stacking above body cells so scrolled rows don't show
     through the sticky header. */
  background: var(--bg-primary, #fff);
  z-index: 1;
}
.graph-table__title {
  white-space: normal;
}
.graph-table__row--ready {
  background: var(--color-ready-bg, #ecfdf5);
}
.graph-table__row--closed {
  opacity: 0.6;
  font-style: italic;
}
.graph-table__row--cycle {
  outline: 1px dashed var(--color-danger, #c0392b);
  outline-offset: -1px;
}
.graph-table__id a,
.graph-table__title a,
.graph-table__ref {
  color: var(--color-link, #2563eb);
  text-decoration: none;
}
.graph-table__id a:hover,
.graph-table__title a:hover,
.graph-table__ref:hover {
  text-decoration: underline;
}
.graph-table__id {
  white-space: nowrap;
}
.graph-table__ready-pill {
  margin-left: 0.4rem;
  padding: 0.05rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  background: var(--color-success, #10b981);
  color: #fff;
}
.graph-table__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.graph-table__refs {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.graph-table__ref-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.graph-table__none {
  color: var(--color-text-muted, #999);
}
</style>
