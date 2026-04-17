import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/flows",
  },
  {
    path: "/login",
    name: "login",
    component: () => import("@/features/auth/views/LoginView.vue"),
    meta: { layout: "auth", public: true },
  },
  {
    path: "/tasks",
    redirect: "/flows",
  },
  {
    path: "/flows",
    name: "flow-list",
    component: () => import("@/features/flows/views/FlowListView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/tasks/:flow",
    name: "task-board",
    component: () => import("@/features/tasks/views/TaskBoardView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/tasks/:flow/:taskId",
    name: "task-detail",
    component: () => import("@/features/tasks/views/TaskDetailView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/projects",
    name: "project-list",
    component: () => import("@/features/projects/views/ProjectListView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/projects/new",
    name: "project-new",
    component: () => import("@/features/projects/views/ProjectNewView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/projects/:id",
    name: "project-detail",
    component: () => import("@/features/projects/views/ProjectDetailView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/features/settings/views/SettingsView.vue"),
    meta: { layout: "app" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Auth guard
router.beforeEach((to) => {
  const isPublic = to.meta.public === true;
  const token = localStorage.getItem("accessToken");

  if (!isPublic && !token) {
    return { name: "login" };
  }
});

export default router;
