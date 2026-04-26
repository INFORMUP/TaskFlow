import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FeedbackBubble from "./FeedbackBubble.vue";

const submitFeedback = vi.fn();
vi.mock("@/api/feedback.api", () => ({
  submitFeedback: (...a: unknown[]) => submitFeedback(...a),
}));

beforeEach(() => {
  submitFeedback.mockReset();
  submitFeedback.mockResolvedValue({
    id: "fb-1",
    orgId: "o",
    userId: "u",
    type: "BUG",
    message: "x",
    page: "http://localhost/",
    adminNotes: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "http://localhost/tasks" },
  });
});

describe("FeedbackBubble", () => {
  it("renders in collapsed state by default", () => {
    const wrapper = mount(FeedbackBubble);
    expect(wrapper.find("[data-testid='feedback-bubble-button']").exists()).toBe(
      true,
    );
    expect(wrapper.find("[data-testid='feedback-bubble-panel']").exists()).toBe(
      false,
    );
  });

  it("clicking the bubble expands the panel; close collapses", async () => {
    const wrapper = mount(FeedbackBubble);
    await wrapper.get("[data-testid='feedback-bubble-button']").trigger("click");
    expect(wrapper.find("[data-testid='feedback-bubble-panel']").exists()).toBe(
      true,
    );
    await wrapper.get("[data-testid='feedback-bubble-close']").trigger("click");
    expect(wrapper.find("[data-testid='feedback-bubble-panel']").exists()).toBe(
      false,
    );
  });

  it("type selector toggles between BUG, IMPROVEMENT, and FEATURE", async () => {
    const wrapper = mount(FeedbackBubble);
    await wrapper.get("[data-testid='feedback-bubble-button']").trigger("click");

    const bugBtn = wrapper.get("[data-testid='feedback-type-bug']");
    const impBtn = wrapper.get("[data-testid='feedback-type-improvement']");
    const featBtn = wrapper.get("[data-testid='feedback-type-feature']");

    // default is BUG
    expect(bugBtn.attributes("aria-pressed")).toBe("true");
    expect(impBtn.attributes("aria-pressed")).toBe("false");
    expect(featBtn.attributes("aria-pressed")).toBe("false");

    await impBtn.trigger("click");
    expect(bugBtn.attributes("aria-pressed")).toBe("false");
    expect(impBtn.attributes("aria-pressed")).toBe("true");
    expect(featBtn.attributes("aria-pressed")).toBe("false");

    await featBtn.trigger("click");
    expect(impBtn.attributes("aria-pressed")).toBe("false");
    expect(featBtn.attributes("aria-pressed")).toBe("true");

    await bugBtn.trigger("click");
    expect(bugBtn.attributes("aria-pressed")).toBe("true");
  });

  it("submit button is disabled when message is empty", async () => {
    const wrapper = mount(FeedbackBubble);
    await wrapper.get("[data-testid='feedback-bubble-button']").trigger("click");
    const submit = wrapper.get(
      "[data-testid='feedback-submit']",
    ).element as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await wrapper
      .get("[data-testid='feedback-message']")
      .setValue("something is broken");
    expect(submit.disabled).toBe(false);
  });

  it("submitting sends the correct payload and includes current page URL", async () => {
    const wrapper = mount(FeedbackBubble);
    await wrapper.get("[data-testid='feedback-bubble-button']").trigger("click");
    await wrapper
      .get("[data-testid='feedback-type-improvement']")
      .trigger("click");
    await wrapper
      .get("[data-testid='feedback-message']")
      .setValue("make it faster");
    await wrapper.get("[data-testid='feedback-submit']").trigger("click");

    expect(submitFeedback).toHaveBeenCalledWith({
      type: "IMPROVEMENT",
      message: "make it faster",
      page: "http://localhost/tasks",
    });
  });

  it("resets and collapses after successful submit", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(FeedbackBubble);
      await wrapper
        .get("[data-testid='feedback-bubble-button']")
        .trigger("click");
      await wrapper
        .get("[data-testid='feedback-message']")
        .setValue("bug here");
      await wrapper.get("[data-testid='feedback-submit']").trigger("click");
      await flushPromises();

      // success state visible
      expect(wrapper.find("[data-testid='feedback-success']").exists()).toBe(
        true,
      );

      vi.advanceTimersByTime(2000);
      await flushPromises();

      expect(
        wrapper.find("[data-testid='feedback-bubble-panel']").exists(),
      ).toBe(false);

      // reopen to confirm reset
      await wrapper
        .get("[data-testid='feedback-bubble-button']")
        .trigger("click");
      const textarea = wrapper.get("[data-testid='feedback-message']")
        .element as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an inline error on failure and does not collapse", async () => {
    submitFeedback.mockRejectedValueOnce({
      status: 500,
      error: { code: "X", message: "boom" },
    });
    const wrapper = mount(FeedbackBubble);
    await wrapper.get("[data-testid='feedback-bubble-button']").trigger("click");
    await wrapper.get("[data-testid='feedback-message']").setValue("boom");
    await wrapper.get("[data-testid='feedback-submit']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-testid='feedback-error']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='feedback-bubble-panel']").exists()).toBe(
      true,
    );
  });
});
