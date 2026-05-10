import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FeedbackAdminView from "./FeedbackAdminView.vue";
import type { FeedbackWithUser } from "@/api/feedback.api";

const listFeedback = vi.fn();
const retryFeedbackLink = vi.fn();
const archiveFeedback = vi.fn();
const updateFeedbackNotes = vi.fn();

vi.mock("@/api/feedback.api", () => ({
  listFeedback: (...a: unknown[]) => listFeedback(...a),
  retryFeedbackLink: (...a: unknown[]) => retryFeedbackLink(...a),
  archiveFeedback: (...a: unknown[]) => archiveFeedback(...a),
  updateFeedbackNotes: (...a: unknown[]) => updateFeedbackNotes(...a),
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

beforeEach(() => {
  listFeedback.mockReset();
  retryFeedbackLink.mockReset();
});

describe("FeedbackAdminView", () => {
  it("renders rows with status badges", async () => {
    listFeedback.mockResolvedValue({
      data: [
        row({ id: "fb-1", taskLinkStatus: "linked" }),
        row({ id: "fb-2", taskLinkStatus: "failed_create", taskLinkError: "boom" }),
      ],
      total: 2,
      page: 1,
      limit: 50,
    });
    const w = mount(FeedbackAdminView);
    await flushPromises();
    expect(w.text()).toContain("Linked");
    expect(w.text()).toContain("Failed: create");
  });

  it("only shows Retry on failed rows", async () => {
    listFeedback.mockResolvedValue({
      data: [
        row({ id: "fb-1", taskLinkStatus: "linked" }),
        row({ id: "fb-2", taskLinkStatus: "failed_create" }),
        row({ id: "fb-3", taskLinkStatus: "failed_link" }),
        row({ id: "fb-4", taskLinkStatus: "skipped_no_config" }),
      ],
      total: 4,
      page: 1,
      limit: 50,
    });
    const w = mount(FeedbackAdminView);
    await flushPromises();
    expect(w.find("[data-testid='feedback-retry-fb-1']").exists()).toBe(false);
    expect(w.find("[data-testid='feedback-retry-fb-2']").exists()).toBe(true);
    expect(w.find("[data-testid='feedback-retry-fb-3']").exists()).toBe(true);
    expect(w.find("[data-testid='feedback-retry-fb-4']").exists()).toBe(false);
  });

  it("clicking Retry calls retryFeedbackLink and updates the row", async () => {
    listFeedback.mockResolvedValue({
      data: [row({ id: "fb-2", taskLinkStatus: "failed_create" })],
      total: 1,
      page: 1,
      limit: 50,
    });
    retryFeedbackLink.mockResolvedValue(
      row({ id: "fb-2", taskLinkStatus: "linked", taskId: "t-1" }),
    );
    const w = mount(FeedbackAdminView);
    await flushPromises();
    await w.find("[data-testid='feedback-retry-fb-2']").trigger("click");
    await flushPromises();
    expect(retryFeedbackLink).toHaveBeenCalledWith("fb-2");
    expect(w.text()).toContain("Linked");
  });

  it("changing the status filter re-queries with the new value", async () => {
    listFeedback.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    const w = mount(FeedbackAdminView);
    await flushPromises();
    await w
      .find("[data-testid='feedback-status-filter']")
      .setValue("failed_create");
    await flushPromises();
    expect(listFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ taskLinkStatus: "failed_create" }),
    );
  });
});
