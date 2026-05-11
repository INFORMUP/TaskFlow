import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import FeedbackAdminView from "./FeedbackAdminView.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type {
  FeedbackWithUser,
  FeedbackListResponse,
} from "@/api/feedback.api";
import type { OrgMembership, OrgRole } from "@/api/organizations.api";

const listFeedback = vi.fn();
const retryFeedbackLink = vi.fn();
const archiveFeedback = vi.fn();
const updateFeedbackNotes = vi.fn();
const exportFeedbackCsv = vi.fn();

vi.mock("@/api/feedback.api", () => ({
  listFeedback: (...a: unknown[]) => listFeedback(...a),
  retryFeedbackLink: (...a: unknown[]) => retryFeedbackLink(...a),
  archiveFeedback: (...a: unknown[]) => archiveFeedback(...a),
  updateFeedbackNotes: (...a: unknown[]) => updateFeedbackNotes(...a),
  exportFeedbackCsv: (...a: unknown[]) => exportFeedbackCsv(...a),
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
    taskLinkStatus: "linked",
    taskLinkError: null,
    createdAt: new Date("2026-05-01T00:00:00Z").toISOString(),
    user: { displayName: "Alice", email: "a@x.com" },
    ...overrides,
  };
}

function page(rows: FeedbackWithUser[], opts: Partial<FeedbackListResponse> = {}): FeedbackListResponse {
  return {
    data: rows,
    total: opts.total ?? rows.length,
    page: opts.page ?? 1,
    limit: opts.limit ?? 20,
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
  retryFeedbackLink.mockReset();
  archiveFeedback.mockReset();
  updateFeedbackNotes.mockReset();
  exportFeedbackCsv.mockReset();
  routerReplace.mockReset();
  listFeedback.mockResolvedValue(page([]));
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

    it("does not redirect owners", async () => {
      await mountAs("owner");
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
      expect(w.find("[data-testid='feedback-type-fb-bug']").text()).toBe("BUG");
      expect(w.find("[data-testid='feedback-type-fb-feat']").text()).toBe("FEATURE");
      expect(w.find("[data-testid='feedback-type-fb-imp']").text()).toBe("IMPROVEMENT");
      expect(w.find("[data-testid='feedback-type-fb-bug']").classes()).toContain(
        "feedback-type-badge--bug",
      );
      expect(w.find("[data-testid='feedback-type-fb-feat']").classes()).toContain(
        "feedback-type-badge--feature",
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
  });

  describe("expandable rows", () => {
    it("clicking a row toggles the expanded panel with full message and notes textarea", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-1", message: "Full message body here." })]),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-expanded-fb-1']").exists()).toBe(
        false,
      );
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      const panel = w.find("[data-testid='feedback-expanded-fb-1']");
      expect(panel.exists()).toBe(true);
      expect(panel.text()).toContain("Full message body here.");
      expect(
        panel.find("[data-testid='feedback-notes-fb-1']").exists(),
      ).toBe(true);
      await w.find("[data-testid='feedback-row-fb-1']").trigger("click");
      expect(w.find("[data-testid='feedback-expanded-fb-1']").exists()).toBe(
        false,
      );
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
        expect(
          w.find("[data-testid='feedback-saved-fb-1']").exists(),
        ).toBe(true);
        vi.advanceTimersByTime(2000);
        await flushPromises();
        expect(
          w.find("[data-testid='feedback-saved-fb-1']").exists(),
        ).toBe(false);
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
      const notes = w.find("[data-testid='feedback-notes-fb-1']");
      await notes.trigger("blur");
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

  describe("pagination", () => {
    it("renders Page X of Y and disables prev on the first page", async () => {
      listFeedback.mockResolvedValue(
        page([row({ id: "fb-a" })], { total: 45, page: 1, limit: 20 }),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-pagination']").text()).toContain(
        "Page 1 of 3",
      );
      expect(
        (w.find("[data-testid='feedback-prev']").attributes("disabled") ?? null) !==
          null,
      ).toBe(true);
      expect(
        (w.find("[data-testid='feedback-next']").attributes("disabled") ?? null) !==
          null,
      ).toBe(false);
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

  describe("task-link status preserved from prior phase", () => {
    it("renders the link-status badge", async () => {
      listFeedback.mockResolvedValue(
        page([
          row({ id: "fb-1", taskLinkStatus: "linked" }),
          row({ id: "fb-2", taskLinkStatus: "failed_create", taskLinkError: "boom" }),
        ]),
      );
      const w = await mountAs("admin");
      expect(w.text()).toContain("Linked");
      expect(w.text()).toContain("Failed: create");
    });

    it("only shows Retry on failed rows", async () => {
      listFeedback.mockResolvedValue(
        page([
          row({ id: "fb-1", taskLinkStatus: "linked" }),
          row({ id: "fb-2", taskLinkStatus: "failed_create" }),
        ]),
      );
      const w = await mountAs("admin");
      expect(w.find("[data-testid='feedback-retry-fb-1']").exists()).toBe(false);
      expect(w.find("[data-testid='feedback-retry-fb-2']").exists()).toBe(true);
    });

    it("changing the link-status filter re-queries with the new value", async () => {
      listFeedback.mockResolvedValue(page([]));
      const w = await mountAs("admin");
      await w
        .find("[data-testid='feedback-status-filter']")
        .setValue("failed_create");
      await flushPromises();
      expect(listFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ taskLinkStatus: "failed_create" }),
      );
    });
  });
});
