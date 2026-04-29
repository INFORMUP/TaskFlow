import { ref } from "vue";
import { listLabels, type Label } from "@/api/labels.api";

const labels = ref<Label[]>([]);
const loaded = ref(false);
const loading = ref(false);

export function useLabels() {
  async function refresh() {
    loading.value = true;
    try {
      labels.value = await listLabels();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function ensureLoaded() {
    if (!loaded.value && !loading.value) await refresh();
  }

  function setLabels(next: Label[]) {
    labels.value = next;
    loaded.value = true;
  }

  return { labels, loaded, loading, refresh, ensureLoaded, setLabels };
}
