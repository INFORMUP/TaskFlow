import { ref } from "vue";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  type SavedView,
} from "@/api/saved-views.api";

const views = ref<SavedView[]>([]);
const loaded = ref(false);
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    views.value = await listSavedViews();
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}

async function create(name: string, filters: Record<string, string>): Promise<SavedView> {
  const view = await createSavedView(name, filters);
  views.value = [...views.value, view];
  return view;
}

async function remove(id: string) {
  await deleteSavedView(id);
  views.value = views.value.filter((v) => v.id !== id);
}

export function useSavedViews() {
  return { views, loaded, loading, refresh, create, remove };
}
