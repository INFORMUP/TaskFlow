<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { VueFlow, type Edge, type Node, MarkerType } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import dagre from "dagre";
import { getTaskGraph, type TaskGraphResponse } from "@/api/tasks.api";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";

const route = useRoute();
const router = useRouter();
const taskId = route.params.taskId as string;
const flowSlug = route.params.flow as string;

const data = ref<TaskGraphResponse | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

function layout(graph: TaskGraphResponse): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });

  for (const n of graph.nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of graph.edges) {
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = g.node(n.id);
    const closed = n.currentStatus.slug === "closed";
    return {
      id: n.id,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { node: n },
      type: "default",
      label: `${n.displayId}\n${n.title}`,
      style: {
        width: `${NODE_WIDTH}px`,
        minHeight: `${NODE_HEIGHT}px`,
        fontSize: "0.8rem",
        textAlign: "left",
        whiteSpace: "pre-wrap",
        padding: "0.5rem",
        border: n.isRoot ? "2px solid var(--color-link, #2563eb)" : "1px solid #999",
        opacity: closed ? 0.55 : 1,
        fontStyle: closed ? "italic" : "normal",
        background: n.isRoot ? "#eff6ff" : "#fff",
      },
    };
  });

  const edges: Edge[] = graph.edges.map((e, i) => ({
    id: `${e.type}-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: "default",
    animated: false,
    label: e.type === "blocker" ? "blocks" : undefined,
    style: {
      stroke: e.type === "spawn" ? "#10b981" : "#ef4444",
      strokeWidth: 2,
      strokeDasharray: e.type === "blocker" ? "6 4" : undefined,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.type === "spawn" ? "#10b981" : "#ef4444",
    },
    data: { type: e.type },
  }));

  return { nodes, edges };
}

const flowNodes = ref<Node[]>([]);
const flowEdges = ref<Edge[]>([]);

const truncated = computed(() => data.value?.truncated ?? false);
const isEmpty = computed(
  () => !!data.value && data.value.nodes.length <= 1 && data.value.edges.length === 0,
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getTaskGraph(taskId);
    data.value = res;
    const laid = layout(res);
    flowNodes.value = laid.nodes;
    flowEdges.value = laid.edges;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load task graph";
  } finally {
    loading.value = false;
  }
}

function onNodeClick(event: { node: Node }) {
  const node = event.node;
  const meta = (node.data as { node: TaskGraphResponse["nodes"][number] }).node;
  if (meta.isRoot) return;
  router.push({
    name: "task-detail",
    params: { flow: meta.flow.slug, taskId: meta.id },
  });
}

watch(() => route.params.taskId, load);
onMounted(load);
</script>

<template>
  <div class="graph-view">
    <header class="graph-view__header">
      <router-link
        class="graph-view__back"
        :to="`/tasks/${flowSlug}/${taskId}`"
        data-testid="graph-back-link"
      >
        ← Back to task
      </router-link>
      <h2>Task graph</h2>
      <ul class="graph-view__legend">
        <li><span class="legend__swatch legend__swatch--spawn"></span>Spawn</li>
        <li><span class="legend__swatch legend__swatch--blocker"></span>Blocks</li>
        <li><span class="legend__swatch legend__swatch--root"></span>Root</li>
        <li><span class="legend__swatch legend__swatch--closed"></span>Closed</li>
      </ul>
    </header>

    <p v-if="loading" class="graph-view__status">Loading graph…</p>
    <p v-else-if="error" class="graph-view__error" role="alert">{{ error }}</p>
    <p v-else-if="isEmpty" class="graph-view__status" data-testid="graph-empty">
      No spawn or blocker relationships from this task.
    </p>

    <p v-if="truncated" class="graph-view__truncated" role="status">
      Graph is large; results were truncated at 500 nodes.
    </p>

    <div v-show="!loading && !error && !isEmpty" class="graph-view__canvas" data-testid="graph-canvas">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="true"
        fit-view-on-init
        @node-click="onNodeClick"
      >
        <Background />
        <Controls />
      </VueFlow>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 4rem);
  padding: 1rem;
  gap: 0.75rem;
}
.graph-view__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.graph-view__header h2 {
  margin: 0;
  font-size: 1.1rem;
}
.graph-view__back {
  color: var(--color-link, #2563eb);
  text-decoration: none;
  font-size: 0.9rem;
}
.graph-view__back:hover {
  text-decoration: underline;
}
.graph-view__legend {
  display: flex;
  gap: 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted, #666);
}
.graph-view__legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.legend__swatch {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 2px;
}
.legend__swatch--spawn {
  background: #10b981;
}
.legend__swatch--blocker {
  background: #ef4444;
}
.legend__swatch--root {
  background: #eff6ff;
  border: 2px solid #2563eb;
}
.legend__swatch--closed {
  background: #ddd;
  opacity: 0.55;
}
.graph-view__canvas {
  flex: 1;
  border: 1px solid var(--border-primary, #ddd);
  border-radius: 4px;
  min-height: 400px;
}
.graph-view__status,
.graph-view__error,
.graph-view__truncated {
  font-size: 0.9rem;
  color: var(--color-text-muted, #666);
}
.graph-view__error {
  color: var(--color-danger, #c0392b);
}
</style>
