import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActorLabel from "./ActorLabel.vue";

describe("ActorLabel", () => {
  it("renders the display name with no badge for human actors", () => {
    const wrapper = mount(ActorLabel, {
      props: { actor: { displayName: "Alice", actorType: "human" } },
    });
    expect(wrapper.text()).toContain("Alice");
    expect(wrapper.find("[data-testid='actor-agent-badge']").exists()).toBe(false);
  });

  it("shows the agent badge when actorType is 'agent'", () => {
    const wrapper = mount(ActorLabel, {
      props: { actor: { displayName: "Bot-1", actorType: "agent" } },
    });
    const badge = wrapper.find("[data-testid='actor-agent-badge']");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("Agent");
    expect(wrapper.text()).toContain("Bot-1");
  });

  it("sets a tooltip describing the actor as an agent on hover", () => {
    const wrapper = mount(ActorLabel, {
      props: { actor: { displayName: "Bot-1", actorType: "agent" } },
    });
    const span = wrapper.find("[data-testid='actor-label']");
    expect(span.attributes("title")).toBe("Bot-1 — Agent");
  });

  it("renders a fallback for a null actor", () => {
    const wrapper = mount(ActorLabel, {
      props: { actor: null, fallback: "Unassigned" },
    });
    expect(wrapper.text()).toContain("Unassigned");
    expect(wrapper.find("[data-testid='actor-agent-badge']").exists()).toBe(false);
  });
});
