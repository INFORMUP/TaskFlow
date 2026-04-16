import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsView from "./SettingsView.vue";
import type { Scope, TokenSummary, CreatedToken } from "@/api/tokens.api";

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
  { key: "transitions:write", description: "Transition tasks" },
  { key: "comments:write", description: "Post comments" },
];

function tokenFixture(overrides: Partial<TokenSummary> = {}): TokenSummary {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "ci-runner",
    integration: false,
    scopes: ["tasks:read"],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: "2026-04-15T12:00:00.000Z",
    ...overrides,
  };
}

async function mountView() {
  const wrapper = mount(SettingsView);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  listScopes.mockReset();
  listTokens.mockReset();
  createToken.mockReset();
  revokeToken.mockReset();
  listScopes.mockResolvedValue({ data: SCOPES });
  listTokens.mockResolvedValue({ data: [] });
});

describe("SettingsView — token management", () => {
  it("renders one checkbox per available scope", async () => {
    const wrapper = await mountView();
    for (const s of SCOPES) {
      expect(
        wrapper.find(`[data-testid='scope-checkbox-${s.key}']`).exists()
      ).toBe(true);
    }
  });

  it("disables create while the name or scopes are empty", async () => {
    const wrapper = await mountView();
    const submit = wrapper.get(
      "[data-testid='token-create-submit']"
    ).element as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await wrapper.get("[data-testid='token-name-input']").setValue("my-token");
    expect(submit.disabled).toBe(true); // still no scope

    await wrapper
      .get("[data-testid='scope-checkbox-tasks:read']")
      .setValue(true);
    expect(submit.disabled).toBe(false);
  });

  it("shows the plaintext token exactly once on create and hides it after dismissal", async () => {
    const created: CreatedToken = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "ci-runner",
      token: "tf_secretplaintexttoken12345678",
      integration: false,
      scopes: ["tasks:read"],
      expiresAt: null,
      createdAt: "2026-04-15T12:00:00.000Z",
    };
    createToken.mockResolvedValueOnce(created);
    listTokens.mockResolvedValueOnce({ data: [] });
    listTokens.mockResolvedValueOnce({
      data: [tokenFixture({ id: created.id, name: "ci-runner" })],
    });

    const wrapper = await mountView();

    await wrapper.get("[data-testid='token-name-input']").setValue("ci-runner");
    await wrapper
      .get("[data-testid='scope-checkbox-tasks:read']")
      .setValue(true);
    await wrapper.get("[data-testid='token-create-submit']").trigger("submit");
    await flushPromises();

    // Plaintext shown in modal
    const modal = wrapper.find("[data-testid='token-created-modal']");
    expect(modal.exists()).toBe(true);
    expect(modal.get("[data-testid='token-plaintext']").text()).toBe(
      "tf_secretplaintexttoken12345678"
    );

    // Token appears in the listing
    expect(
      wrapper.find(`[data-testid='token-row-${created.id}']`).exists()
    ).toBe(true);

    // Dismissing hides the modal
    await wrapper.get("[data-testid='token-dismiss-button']").trigger("click");
    expect(wrapper.find("[data-testid='token-created-modal']").exists()).toBe(
      false
    );

    // Full page HTML no longer contains the plaintext
    expect(wrapper.html()).not.toContain("tf_secretplaintexttoken12345678");
  });

  it("copies the plaintext token to the clipboard when 'Copy' is pressed", async () => {
    const created: CreatedToken = {
      id: "33333333-3333-3333-3333-333333333333",
      name: "alpha",
      token: "tf_plaintext_abcdefghi",
      integration: false,
      scopes: ["tasks:read"],
      expiresAt: null,
      createdAt: "2026-04-15T12:00:00.000Z",
    };
    createToken.mockResolvedValueOnce(created);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const wrapper = await mountView();
    await wrapper.get("[data-testid='token-name-input']").setValue("alpha");
    await wrapper
      .get("[data-testid='scope-checkbox-tasks:read']")
      .setValue(true);
    await wrapper.get("[data-testid='token-create-submit']").trigger("submit");
    await flushPromises();

    await wrapper.get("[data-testid='token-copy-button']").trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("tf_plaintext_abcdefghi");
    expect(
      wrapper.get("[data-testid='token-copy-status']").text()
    ).toContain("Copied");
  });

  it("revokes a token after confirmation and refreshes the list", async () => {
    const existing = tokenFixture({ id: "aaaa1111-1111-1111-1111-111111111111" });
    listTokens
      .mockResolvedValueOnce({ data: [existing] })
      .mockResolvedValueOnce({ data: [] });
    revokeToken.mockResolvedValue(undefined);

    const wrapper = await mountView();
    await wrapper
      .get(`[data-testid='token-revoke-${existing.id}']`)
      .trigger("click");

    const dialog = wrapper.find("[data-testid='token-revoke-modal']");
    expect(dialog.exists()).toBe(true);

    await wrapper
      .get("[data-testid='token-revoke-confirm']")
      .trigger("click");
    await flushPromises();

    expect(revokeToken).toHaveBeenCalledWith(existing.id);
    expect(wrapper.find("[data-testid='token-revoke-modal']").exists()).toBe(
      false
    );
    expect(
      wrapper.find(`[data-testid='token-row-${existing.id}']`).exists()
    ).toBe(false);
  });

  it("cancelling the revoke dialog does not call revokeToken", async () => {
    const existing = tokenFixture({ id: "bbbb2222-2222-2222-2222-222222222222" });
    listTokens.mockResolvedValueOnce({ data: [existing] });

    const wrapper = await mountView();
    await wrapper
      .get(`[data-testid='token-revoke-${existing.id}']`)
      .trigger("click");
    await wrapper
      .get("[data-testid='token-revoke-cancel']")
      .trigger("click");

    expect(revokeToken).not.toHaveBeenCalled();
    expect(wrapper.find("[data-testid='token-revoke-modal']").exists()).toBe(
      false
    );
  });

  it("surfaces server validation errors when create fails", async () => {
    createToken.mockRejectedValue({
      status: 400,
      error: { code: "UNKNOWN_SCOPE", message: "Unknown scope(s): tasks:bad" },
    });

    const wrapper = await mountView();
    await wrapper.get("[data-testid='token-name-input']").setValue("x");
    await wrapper
      .get("[data-testid='scope-checkbox-tasks:read']")
      .setValue(true);
    await wrapper.get("[data-testid='token-create-submit']").trigger("submit");
    await flushPromises();

    expect(wrapper.get("[data-testid='token-form-error']").text()).toContain(
      "Unknown scope"
    );
    expect(wrapper.find("[data-testid='token-created-modal']").exists()).toBe(
      false
    );
  });
});
