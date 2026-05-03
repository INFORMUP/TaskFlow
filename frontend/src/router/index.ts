import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "my-work",
    component: () => import("@/features/tasks/views/MyWorkView.vue"),
    meta: { layout: "app" },
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
    path: "/tasks/:flow/:taskId/graph",
    name: "task-graph",
    component: () => import("@/features/tasks/views/TaskGraphView.vue"),
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
    path: "/organization",
    name: "organization",
    component: () => import("@/features/organization/views/OrganizationView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/organization/new",
    name: "organization-new",
    component: () => import("@/features/organization/views/CreateOrgView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/accept-invite",
    name: "accept-invite",
    component: () => import("@/features/organization/views/AcceptInviteView.vue"),
    meta: { layout: "auth", public: true },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/features/settings/views/SettingsView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/settings/labels",
    name: "settings-labels",
    component: () => import("@/features/labels/views/LabelsSettingsView.vue"),
    meta: { layout: "app" },
  },
  {
    path: "/settings/visuals",
    name: "settings-visuals",
    component: () => import("@/features/settings/views/VisualsSettingsView.vue"),
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
    if (to.fullPath === "/" || to.fullPath === "/flows" || to.fullPath === "/login") {
      return { name: "login" };
    }
    return { name: "login", query: { redirect: to.fullPath } };
  }
});

export default router;
