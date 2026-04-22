import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TaskColumnEmptyState from "./TaskColumnEmptyState.vue";
import {
  GENERIC_EMPTY_STATE,
  getEmptyStateContent,
} from "@/data/emptyStateContent";

describe("TaskColumnEmptyState", () => {
  it("renders the specific copy for a known flow+status pair", () => {
    const expected = getEmptyStateContent("bug", "triage");
    const wrapper = mount(TaskColumnEmptyState, {
      props: { flowSlug: "bug", statusSlug: "triage" },
    });

    expect(wrapper.text()).toContain(expected.heading);
    expect(wrapper.text()).toContain(expected.description);
  });

  it("renders the specific copy for feature/discuss", () => {
    const expected = getEmptyStateContent("feature", "discuss");
    const wrapper = mount(TaskColumnEmptyState, {
      props: { flowSlug: "feature", statusSlug: "discuss" },
    });

    expect(wrapper.text()).toContain(expected.heading);
    expect(wrapper.text()).toContain(expected.description);
  });

  it("falls back to generic copy for unknown flow", () => {
    const wrapper = mount(TaskColumnEmptyState, {
      props: { flowSlug: "nonexistent", statusSlug: "triage" },
    });

    expect(wrapper.text()).toContain(GENERIC_EMPTY_STATE.heading);
    expect(wrapper.text()).toContain(GENERIC_EMPTY_STATE.description);
  });

  it("falls back to generic copy for unknown status in known flow", () => {
    const wrapper = mount(TaskColumnEmptyState, {
      props: { flowSlug: "bug", statusSlug: "nonexistent" },
    });

    expect(wrapper.text()).toContain(GENERIC_EMPTY_STATE.heading);
  });
});
