import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import FileStrip from "./FileStrip.vue";
import type { FileMeta } from "@/api/files.api";
import * as filesApi from "@/api/files.api";

vi.mock("@/api/files.api", () => ({
  downloadTaskFile: vi.fn().mockResolvedValue(undefined),
}));

const file1: FileMeta = { id: "f-1", filename: "report.html", mimeType: "text/html", size: 1024, createdAt: "2026-01-01T00:00:00Z" };
const file2: FileMeta = { id: "f-2", filename: "notes.txt", mimeType: "text/plain", size: 512, createdAt: "2026-01-02T00:00:00Z" };

describe("FileStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders '+ File' upload button", () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [] } });
    expect(wrapper.text()).toContain("+ File");
  });

  it("shows no file list when files is empty", () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [] } });
    expect(wrapper.find(".file-strip__list").exists()).toBe(false);
  });

  it("renders a row per file showing the filename", () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [file1, file2] } });
    expect(wrapper.text()).toContain("report.html");
    expect(wrapper.text()).toContain("notes.txt");
  });

  it("renders a delete button per file", () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [file1, file2] } });
    expect(wrapper.findAll(".file-strip__delete")).toHaveLength(2);
  });

  it("emits delete with the correct fileId when delete button is clicked", async () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [file1] } });
    await wrapper.find(".file-strip__delete").trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual(["f-1"]);
  });

  it("emits upload with the selected file when a file is chosen", async () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [] } });
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const input = wrapper.find(".file-strip__file-input");
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(wrapper.emitted("upload")?.[0]).toEqual([file]);
  });

  it("disables delete buttons when busy", () => {
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [file1], busy: true } });
    const btn = wrapper.find(".file-strip__delete");
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking the download button calls downloadTaskFile with the correct id and filename", async () => {
    const spy = vi.spyOn(filesApi, "downloadTaskFile");
    const wrapper = mount(FileStrip, { props: { taskId: "task-1", files: [file1] } });
    await wrapper.find(".file-strip__download").trigger("click");
    expect(spy).toHaveBeenCalledWith("f-1", "report.html");
  });
});
