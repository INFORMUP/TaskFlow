import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import FeedbackAdminView from "./FeedbackAdminView.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type {
  FeedbackWithUser,
  FeedbackListResponse,
} from "@/api/feedback.api";
import type { Project } from "@/api/projects.api";
import type { Flow } from "@/api/flows.api";
import type { OrgMembership, OrgRole } from "@/api/organizations.api";

const listFeedback = vi.fn();
const archiveFeedback = vi.fn();
const updateFeedbackNotes = vi.fn();
const exportFeedbackCsv = vi.fn();
const promoteFeedback = vi.fn();
const listProjects = vi.fn();
const listFlows = vi.fn();

vi.mock("@/api/feedback.api", () => ({
  listFeedback: (...a: unknown[]) => listFeedback(...a),
  archiveFeedback: (...a: unknown[]) => archiveFeedback(...a),
  updateFeedbackNotes: (...a: unknown[]) => updateFeedbackNotes(...a),
  exportFeedbackCsv: (...a: unknown[]) => exportFeedbackCsv(...a),
  promoteFeedback: (...a: unknown[]) => promoteFeedback(...a),
}));

vi.mock("@/api/projects.api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
}));

vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
}));

const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

function row(overrides: Partial<FeedbackWithUser> = {}): FeedbackWithUser {
  return {
    id: "fb-1",
    orgId: "org-1",
    userId: "u-1",
    type: "BUG",
    message: "something broke",
    page: "/x",
    adminNotes: null,
    archivedAt: null,
    taskId: null,
    task: null,
    createdAt: new Date("2026-05-01T00:00:00Z").toISOString(),
    user: { displayName: "Alice", email: "a@x.com" },
    ...overrides,
  };
}

function flow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "flow-1",
    slug: "feature",
    name: "Feature",
    description: null,
    icon: null,
    stats: { openCount: 0, assignedToMeCount: 0 },
    ...overrides,
  };
}

const DEFAULT_FLOWS: Flow[] = [
  flow({ id: "flow-bug", slug: "bug", name: "Bug" }),
  flow({ id: "flow-feat", slug: "feature", name: "Feature" }),
  flow({ id: "flow-imp", slug: "improvement", name: "Improvement" }),
];

function page(rows: FeedbackWithUser[], opts: Partial<FeedbackListResponse> = {}): FeedbackListResponse {
  return {
    data: rows,
    total: opts.total ?? rows.length,
    page: opts.page ?? 1,
    limit: opts.limit ?? 20,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    key: "TF",
    name: "TaskFlow",
    owner: { id: "u-1", displayName: "Alice", actorType: "human" },
    defaultAssignee: null,
    defaultFlow: null,
    teams: [],
    color: null,
    createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function makeStore(role: OrgRole) {
  const active: OrgMembership = { id: "org-1", slug: "acme", name: "Acme", role };
  return {
    memberships: ref([active]),
    activeOrgId: ref<string | null>("org-1"),
    activeOrg: computed(() => active),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(),
    addMembership: vi.fn(),
    setActiveOrg: vi.fn(),
    clear: vi.fn(),
  };
}

async function mountAs(role: OrgRole) {
  const wrapper = mount(FeedbackAdminView, {
    global: {
      provide: { [ORG_INJECTION_KEY as symbol]: makeStore(role) },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  listFeedback.mockReset();
  archiveFeedback.mockReset();
  updateFeedbackNotes.mockReset();
  exportFeedbackCsv.mockReset();
  promoteFeedback.mockReset();
  listProjects.mockReset();
  listFlows.mockReset();
  routerReplace.mockReset();
  listFeedback.mockResolvedValue(page([]));
  listProjects.mockResolvedValue([project()]);
  listFlows.mockResolvedValue(DEFAULT_FLOWS);
});

describe("FeedbackAdminView", () => {
  describe("role gating", () => {
    it("redirects org members away from the admin view", async () => {
      await mountAs("member");
      expect(routerReplace).toHaveBeenCalledWith("/");
      expect(listFeedback).not.toHaveBeenCalled();
    });

    it("does not redirect admins", async () => {
      await mountAs("admin");
      expect(routerReplace).not.toHaveBeenCalled();
      expect(listFeedback).toHaveBeenCalled();
    });
  });

  describe("rendering", () => {
    it("shows the type badge for each row", async () => {
      listFeedback.mockResolvedValue(
        page([
          row({ id: "fb-bug", type: "BUG" }),
          row({ id: "fb-feat", type: "FEATURE" }),
          row({ id: "fb-imp", type: "IMPROVEMENT" }),
        ]),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-type-fb-bug']").classes()).toContain(
        "feedback-type-badge--bug",
      );
      expect(w.find("[data-testid='feedback-type-fb-feat']").classes()).toContain(
        "feedback-type-badge--feature",
      );
      expect(w.find("[data-testid='feedback-type-fb-imp']").classes()).toContain(
        "feedback-type-badge--improvement",
      );
    });

    it("renders an empty state when there is no feedback", async () => {
      listFeedback.mockResolvedValue(page([]));
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-empty']").exists()).toBe(true);
      expect(w.find("[data-testid='feedback-empty']").text()).toContain(
        "No feedback yet",
      );
    });

    it("shows a different empty state when viewing archived", async () => {
      listFeedback.mockResolvedValue(page([]));
      const w = await mountAs("admin");
      await w
        .find("[data-testid='feedback-archived-toggle']")
        .setValue(true);
      await flushPromises();
      expect(w.find("[data-testid='feedback-empty']").text()).toContain(
        "No archived feedback",
      );
    });

    it("renders a 'View task' link when the feedback already has a taskId", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-1", type: "FEATURE", taskId: "task-abc" })]),
      );
      const w = await mountAs("admin");
      const link = w.find("[data-testid='feedback-task-link-fb-1']");
      expect(link.exists()).toBe(true);
      expect(link.attributes("href")).toBe("/tasks/feature/task-abc");
    });

    it("View task link uses the linked task's actual flow when type and flow diverge", async () => {
      listFeedback.mockResolvedValue(
        page([
          row({
            id: "fb-1",
            type: "FEATURE",
            taskId: "task-abc",
            task: { flow: { slug: "improvement" } },
          }),
        ]),
      );
      const w = await mountAs("admin");
      const link = w.find("[data-testid='feedback-task-link-fb-1']");
      expect(link.attributes("href")).toBe("/tasks/improvement/task-abc");
    });
  });

  describe("expandable rows", () => {
    it("clicking a row toggles the expanded panel with full message and notes textarea", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-1", message: "Full message body here." })]),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-expanded-fb-1']").exists()).toBe(false);
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      const panel = w.find("[data-testid='feedback-expanded-fb-1']");
      expect(panel.exists()).toBe(true);
      expect(panel.text()).toContain("Full message body here.");
      expect(panel.find("[data-testid='feedback-notes-fb-1']").exists()).toBe(true);
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      expect(w.find("[data-testid='feedback-expanded-fb-1']").exists()).toBe(false);
    });
  });

  describe("admin notes auto-save", () => {
    it("saves notes on textarea blur and shows a Saved indicator", async () => {
      vi.useFakeTimers();
      try {
        listFeedback.mockResolvedValue(page([row({ id: "fb-1" })]));
        updateFeedbackNotes.mockResolvedValue(
          row({ id: "fb-1", adminNotes: "follow up" }),
        );
        const w = await mountAs("admin");
        await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
        const notes = w.find("[data-testid='feedback-notes-fb-1']");
        await notes.setValue("follow up");
        await notes.trigger("blur");
        await flushPromises();
        expect(updateFeedbackNotes).toHaveBeenCalledWith("fb-1", "follow up");
        expect(w.find("[data-testid='feedback-saved-fb-1']").exists()).toBe(true);
        vi.advanceTimersByTime(2000);
        await flushPromises();
        expect(w.find("[data-testid='feedback-saved-fb-1']").exists()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not call updateFeedbackNotes when the textarea blurs unchanged", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-1", adminNotes: "existing" })]),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      await w.find("[data-testid='feedback-notes-fb-1']").trigger("blur");
      await flushPromises();
      expect(updateFeedbackNotes).not.toHaveBeenCalled();
    });
  });

  describe("archive in expanded row", () => {
    it("toggles archive and removes the row from the active list", async () => {
      listFeedback.mockResolvedValue(page([row({ id: "fb-1" })]));
      archiveFeedback.mockResolvedValue(
        row({ id: "fb-1", archivedAt: new Date().toISOString() }),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      await w
        .find("[data-testid='feedback-archive-toggle-fb-1']")
        .trigger("click");
      await flushPromises();
      expect(archiveFeedback).toHaveBeenCalledWith("fb-1", true);
      expect(w.find("[data-testid='feedback-row-fb-1']").exists()).toBe(false);
    });
  });

  describe("promote to task", () => {
    it("disables the promote button until a project is picked", async () => {
      listFeedback.mockResolvedValue(page([row({ id: "fb-1", type: "BUG" })]));
      listProjects.mockResolvedValue([project({ id: "proj-1", key: "TF", name: "TaskFlow" })]);
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      const btn = w.find("[data-testid='feedback-promote-fb-1']");
      expect(btn.attributes("disabled")).toBeDefined();

      await w
        .find("[data-testid='feedback-project-select-fb-1']")
        .setValue("proj-1");
      await flushPromises();
      expect(
        w.find("[data-testid='feedback-promote-fb-1']").attributes("disabled"),
      ).toBeUndefined();
    });

    it("calls promoteFeedback with the picked project and the type-derived flow", async () => {
      listFeedback.mockResolvedValue(page([row({ id: "fb-1", type: "FEATURE" })]));
      listProjects.mockResolvedValue([project({ id: "proj-1" })]);
      promoteFeedback.mockResolvedValue(
        row({
          id: "fb-1",
          type: "FEATURE",
          taskId: "task-99",
          task: { flow: { slug: "feature" } },
        }),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      await w
        .find("[data-testid='feedback-project-select-fb-1']")
        .setValue("proj-1");
      await w.find("[data-testid='feedback-promote-fb-1']").trigger("click");
      await flushPromises();
      expect(promoteFeedback).toHaveBeenCalledWith("fb-1", "proj-1", "feature");
      expect(w.find("[data-testid='feedback-task-link-fb-1']").exists()).toBe(true);
    });

    it("flow dropdown is pre-selected by feedback type but can be overridden", async () => {
      listFeedback.mockResolvedValue(page([row({ id: "fb-1", type: "FEATURE" })]));
      listProjects.mockResolvedValue([project({ id: "proj-1" })]);
      promoteFeedback.mockResolvedValue(
        row({
          id: "fb-1",
          type: "FEATURE",
          taskId: "task-77",
          task: { flow: { slug: "improvement" } },
        }),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");

      const flowSelect = w.find("[data-testid='feedback-flow-select-fb-1']");
      expect((flowSelect.element as HTMLSelectElement).value).toBe("feature");

      await flowSelect.setValue("improvement");
      expect(w.find("[data-testid='feedback-promote-fb-1']").text()).toContain(
        "improvement",
      );

      await w
        .find("[data-testid='feedback-project-select-fb-1']")
        .setValue("proj-1");
      await w.find("[data-testid='feedback-promote-fb-1']").trigger("click");
      await flushPromises();
      expect(promoteFeedback).toHaveBeenCalledWith("fb-1", "proj-1", "improvement");
    });

    it("hides the promote controls once feedback has a linked task", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-1", taskId: "task-99" })]),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      expect(w.find("[data-testid='feedback-project-select-fb-1']").exists()).toBe(false);
      expect(w.find("[data-testid='feedback-promote-fb-1']").exists()).toBe(false);
    });

    it("labels the promote button with the destination flow slug", async () => {
      listFeedback.mockResolvedValue(
        page([
          row({ id: "fb-bug", type: "BUG" }),
          row({ id: "fb-feat", type: "FEATURE" }),
          row({ id: "fb-imp", type: "IMPROVEMENT" }),
        ]),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-row-fb-bug']").trigger("click");
      expect(w.find("[data-testid='feedback-promote-fb-bug']").text()).toContain("bug");
      await w.find("[data-testid='feedback-row-fb-bug']").trigger("click");
      await w.find("[data-testid='feedback-row-fb-feat']").trigger("click");
      expect(w.find("[data-testid='feedback-promote-fb-feat']").text()).toContain("feature");
      await w.find("[data-testid='feedback-row-fb-feat']").trigger("click");
      await w.find("[data-testid='feedback-row-fb-imp']").trigger("click");
      expect(w.find("[data-testid='feedback-promote-fb-imp']").text()).toContain("improvement");
    });
  });

  describe("pagination", () => {
    it("renders Page X of Y and disables prev on the first page", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-a" })], { total: 45, page: 1, limit: 20 }),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-pagination']").text()).toContain(
        "Page 1 of 3",
      );
      expect(w.find("[data-testid='feedback-prev']").attributes("disabled")).toBeDefined();
      expect(w.find("[data-testid='feedback-next']").attributes("disabled")).toBeUndefined();
    });

    it("clicking next advances the page and re-fetches", async () => {
      listFeedback.mockResolvedValueOnce(
        page([row({ id: "fb-a" })], { total: 45, page: 1, limit: 20 }),
      );
      listFeedback.mockResolvedValueOnce(
        page([row({ id: "fb-b" })], { total: 45, page: 2, limit: 20 }),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-next']").trigger("click");
      await flushPromises();
      expect(listFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 20 }),
      );
    });

    it("changing the archived toggle resets to page 1", async () => {
      listFeedback.mockResolvedValueOnce(
        page([row({ id: "fb-a" })], { total: 45, page: 1, limit: 20 }),
      );
      listFeedback.mockResolvedValueOnce(
        page([row({ id: "fb-b" })], { total: 45, page: 2, limit: 20 }),
      );
      listFeedback.mockResolvedValueOnce(
        page([], { total: 0, page: 1, limit: 20 }),
      );
      const w = await mountAs("admin");
      await w.find("[data-testid='feedback-next']").trigger("click");
      await flushPromises();
      await w
        .find("[data-testid='feedback-archived-toggle']")
        .setValue(true);
      await flushPromises();
      expect(listFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ archived: true, page: 1 }),
      );
    });
  });

  describe("CSV export", () => {
    it("clicking Export CSV calls exportFeedbackCsv and triggers a download", async () => {
      listFeedback.mockResolvedValue(page([row()]));
      const csvBlob = new Blob(["id,date\n"], { type: "text/csv" });
      exportFeedbackCsv.mockResolvedValue(csvBlob);
      const clickSpy = vi.fn();
      const origCreate = document.createElement.bind(document);
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) => {
          const el = origCreate(tag);
          if (tag === "a") {
            (el as HTMLAnchorElement).click = clickSpy;
          }
          return el;
        });
      const createUrl = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:mock");
      const revokeUrl = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => undefined);

      try {
        const w = await mountAs("admin");
        await w.find("[data-testid='feedback-export']").trigger("click");
        await flushPromises();
        expect(exportFeedbackCsv).toHaveBeenCalled();
        expect(createUrl).toHaveBeenCalledWith(csvBlob);
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeUrl).toHaveBeenCalledWith("blob:mock");
      } finally {
        createSpy.mockRestore();
        createUrl.mockRestore();
        revokeUrl.mockRestore();
      }
    });
  });
});
