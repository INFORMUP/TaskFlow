import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import AttachmentStrip from "./AttachmentStrip.vue";
import type { ImageMeta } from "@/api/attachments.api";

vi.mock("@/api/attachments.api", () => ({
  getImageBlobUrl: vi.fn().mockResolvedValue("blob:fake"),
}));

const img1: ImageMeta = { id: "img-1", filename: "a.png", mimeType: "image/png", size: 100, createdAt: "2026-01-01T00:00:00Z" };
const img2: ImageMeta = { id: "img-2", filename: "b.png", mimeType: "image/png", size: 200, createdAt: "2026-01-02T00:00:00Z" };

describe("AttachmentStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders '+ Image' upload button", () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [] } });
    expect(wrapper.text()).toContain("+ Image");
  });

  it("shows no thumbnails when images is empty", () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [] } });
    expect(wrapper.find(".attachment-strip__thumbs").exists()).toBe(false);
  });

  it("renders a delete button per image", () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [img1, img2] } });
    expect(wrapper.findAll(".attachment-strip__delete")).toHaveLength(2);
  });

  it("emits delete with the correct imageId when delete button is clicked", async () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [img1] } });
    await wrapper.find(".attachment-strip__delete").trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual(["img-1"]);
  });

  it("emits upload with the selected file when a file is chosen", async () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [] } });
    const file = new File(["data"], "test.png", { type: "image/png" });
    const input = wrapper.find(".attachment-strip__file-input");
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(wrapper.emitted("upload")?.[0]).toEqual([file]);
  });

  it("disables delete buttons when busy", () => {
    const wrapper = mount(AttachmentStrip, { props: { images: [img1], busy: true } });
    const btn = wrapper.find(".attachment-strip__delete");
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });
});
