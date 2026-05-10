import { ref, watch } from "vue";
import { globalSearch, type SearchResults } from "@/api/search.api";

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

export function useGlobalSearch() {
  const query = ref("");
  const results = ref<SearchResults>({ tasks: [], projects: [] });
  const loading = ref(false);
  const error = ref<string | null>(null);

  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;

  function clear() {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = null;
    }
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    results.value = { tasks: [], projects: [] };
    loading.value = false;
    error.value = null;
  }

  watch(query, (next) => {
    if (debounceHandle) clearTimeout(debounceHandle);
    if (activeController) activeController.abort();

    const trimmed = next.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      results.value = { tasks: [], projects: [] };
      loading.value = false;
      error.value = null;
      return;
    }

    loading.value = true;
    debounceHandle = setTimeout(async () => {
      const controller = new AbortController();
      activeController = controller;
      try {
        const data = await globalSearch(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;
        results.value = data;
        error.value = null;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") return;
        error.value =
          (err as { error?: { message?: string } })?.error?.message ?? "Search failed";
        results.value = { tasks: [], projects: [] };
      } finally {
        if (activeController === controller) {
          activeController = null;
          loading.value = false;
        }
      }
    }, DEBOUNCE_MS);
  });

  return { query, results, loading, error, clear };
}
