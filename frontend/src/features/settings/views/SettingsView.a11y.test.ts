import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axeComponent as axe } from "@/test/axe";
import SettingsView from "./SettingsView.vue";
import type { Scope, TokenSummary } from "@/api/tokens.api";

const listScopes = vi.fn();
const listTokens = vi.fn();
const createToken = vi.fn();
const revokeToken = vi.fn();

vi.mock("@/api/tokens.api", () => ({
  listScopes: (...a: unknown[]) => listScopes(...a),
  listTokens: (...a: unknown[]) => listTokens(...a),
  createToken: (...a: unknown[]) => createToken(...a),
  revokeToken: (...a: unknown[]) => revokeToken(...a),
}));

const SCOPES: Scope[] = [
  { key: "tasks:read", description: "Read tasks" },
  { key: "tasks:write", description: "Write tasks" },
];

const TOKEN: TokenSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "ci-runner",
  integration: false,
  scopes: ["tasks:read"],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: "2026-04-15T12:00:00.000Z",
};

beforeEach(() => {
  listScopes.mockReset();
  listTokens.mockReset();
  createToken.mockReset();
  revokeToken.mockReset();
  listScopes.mockResolvedValue({ data: SCOPES });
  listTokens.mockResolvedValue({ data: [TOKEN] });
});

describe("Surface 4 — SettingsView a11y", () => {
  it("has no axe violations with tokens loaded", async () => {
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it("revoke confirmation modal has no axe violations", async () => {
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    await wrapper.find(`[data-testid='token-revoke-${TOKEN.id}']`).trigger("click");
    await flushPromises();
    const modal = wrapper.find("[data-testid='token-revoke-modal']").element;
    expect(await axe(modal)).toHaveNoViolations();
    wrapper.unmount();
  });
});
