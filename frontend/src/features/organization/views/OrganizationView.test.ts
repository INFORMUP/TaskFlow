import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed } from "vue";
import OrganizationView from "./OrganizationView.vue";
import { ORG_INJECTION_KEY } from "@/composables/useOrg";
import type {
  OrgDetail,
  OrgMembership,
  OrgRole,
} from "@/api/organizations.api";

const getOrganization = vi.fn();
const addMember = vi.fn();
const updateMemberRole = vi.fn();
const removeMember = vi.fn();

vi.mock("@/api/organizations.api", () => ({
  getOrganization: (...a: unknown[]) => getOrganization(...a),
  addMember: (...a: unknown[]) => addMember(...a),
  updateMemberRole: (...a: unknown[]) => updateMemberRole(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}));

const routerReplace = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

function makeStore(role: OrgRole) {
  const active: OrgMembership = {
    id: "org-1",
    slug: "acme",
    name: "Acme",
    role,
  };
  const memberships = ref([active]);
  const activeOrgId = ref<string | null>("org-1");
  return {
    memberships,
    activeOrgId,
    activeOrg: computed(() => active),
    loading: ref(false),
    error: ref<string | null>(null),
    hydrate: vi.fn(),
    addMembership: vi.fn(),
    setActiveOrg: vi.fn(),
    clear: vi.fn(),
  };
}

function detailFixture(role: OrgRole): OrgDetail {
  return {
    id: "org-1",
    slug: "acme",
    name: "Acme",
    role,
    members: [
      {
        userId: "u-owner",
        displayName: "Owner Person",
        email: "owner@example.com",
        role: "owner",
      },
      {
        userId: "u-member",
        displayName: "Member Person",
        email: "member@example.com",
        role: "member",
      },
    ],
  };
}

async function mountAs(role: OrgRole) {
  getOrganization.mockResolvedValue(detailFixture(role));
  const wrapper = mount(OrganizationView, {
    global: {
      provide: { [ORG_INJECTION_KEY as symbol]: makeStore(role) },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  getOrganization.mockReset();
  addMember.mockReset();
  updateMemberRole.mockReset();
  removeMember.mockReset();
  routerReplace.mockReset();
});

describe("OrganizationView", () => {
  it("redirects members away from the settings page", async () => {
    await mountAs("member");
    expect(routerReplace).toHaveBeenCalledWith("/");
  });

  it("shows members and controls for admins", async () => {
    const wrapper = await mountAs("admin");
    expect(wrapper.find("[data-testid='org-member-list']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='org-member-row-u-owner']").exists()).toBe(
      true
    );
    expect(
      wrapper.find("[data-testid='org-member-row-u-member']").exists()
    ).toBe(true);
  });

  it("lets an owner add a member", async () => {
    const wrapper = await mountAs("owner");
    addMember.mockResolvedValue({
      userId: "u-new",
      displayName: "new@example.com",
      email: "new@example.com",
      role: "member",
    });

    await wrapper.get("[data-testid='org-invite-email']").setValue(
      "new@example.com"
    );
    await wrapper.get("[data-testid='org-invite-submit']").trigger("submit");
    await flushPromises();

    expect(addMember).toHaveBeenCalledWith("org-1", {
      email: "new@example.com",
      role: "member",
    });
    expect(
      wrapper.find("[data-testid='org-member-row-u-new']").exists()
    ).toBe(true);
  });

  it("removes a member after confirmation", async () => {
    const wrapper = await mountAs("owner");
    removeMember.mockResolvedValue(undefined);

    await wrapper.get("[data-testid='org-remove-u-member']").trigger("click");
    expect(wrapper.find("[data-testid='org-remove-modal']").exists()).toBe(
      true
    );
    await wrapper.get("[data-testid='org-remove-confirm']").trigger("click");
    await flushPromises();

    expect(removeMember).toHaveBeenCalledWith("org-1", "u-member");
    expect(
      wrapper.find("[data-testid='org-member-row-u-member']").exists()
    ).toBe(false);
  });

  it("admins cannot see a remove button for owner members", async () => {
    const wrapper = await mountAs("admin");
    expect(wrapper.find("[data-testid='org-remove-u-owner']").exists()).toBe(
      false
    );
    expect(wrapper.find("[data-testid='org-remove-u-member']").exists()).toBe(
      true
    );
  });
});
