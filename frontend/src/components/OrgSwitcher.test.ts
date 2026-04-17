import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import OrgSwitcher from "./OrgSwitcher.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type { OrgMembership } from "@/api/organizations.api";

const switchOrganization = vi.fn();
vi.mock("@/api/organizations.api", async (orig) => {
  const real = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...real,
    switchOrganization: (...a: unknown[]) => switchOrganization(...a),
  };
});

function provideStore(memberships: OrgMembership[], activeId: string | null) {
  const membershipsRef = ref(memberships);
  const activeOrgId = ref(activeId);
  const setActiveOrg = vi.fn(async (id: string) => {
    await switchOrganization(id);
    activeOrgId.value = id;
  });
  const store = {
    memberships: membershipsRef,
    activeOrgId,
    activeOrg: computed(
      () => membershipsRef.value.find((m) => m.id === activeOrgId.value) ?? null
    ),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(),
    addMembership: vi.fn(),
    setActiveOrg,
    clear: vi.fn(),
  };
  return store;
}

const MEMBERS: OrgMembership[] = [
  { id: "org-1", slug: "acme", name: "Acme", role: "owner" },
  { id: "org-2", slug: "beta", name: "Beta Co", role: "member" },
];

beforeEach(() => {
  switchOrganization.mockReset();
  switchOrganization.mockResolvedValue("new-token");
});

describe("OrgSwitcher", () => {
  it("renders an option per membership", () => {
    const store = provideStore(MEMBERS, "org-1");
    const wrapper = mount(OrgSwitcher, {
      global: { provide: { [ORG_INJECTION_KEY as symbol]: store } },
    });
    expect(wrapper.findAll("option")).toHaveLength(2);
    expect(wrapper.find("[data-testid='org-option-acme']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='org-option-beta']").exists()).toBe(true);
  });

  it("changing orgs calls setActiveOrg and reloads", async () => {
    const store = provideStore(MEMBERS, "org-1");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const wrapper = mount(OrgSwitcher, {
      global: { provide: { [ORG_INJECTION_KEY as symbol]: store } },
    });

    await wrapper.get("[data-testid='org-switcher']").setValue("org-2");
    await flushPromises();

    expect(store.setActiveOrg).toHaveBeenCalledWith("org-2");
    expect(switchOrganization).toHaveBeenCalledWith("org-2");
    expect(reload).toHaveBeenCalled();
  });

  it("is disabled when there is only one membership", () => {
    const store = provideStore([MEMBERS[0]], "org-1");
    const wrapper = mount(OrgSwitcher, {
      global: { provide: { [ORG_INJECTION_KEY as symbol]: store } },
    });
    const select = wrapper.get("[data-testid='org-switcher']")
      .element as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
