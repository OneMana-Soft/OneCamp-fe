import { describe, it, expect } from "vitest";
import { getLastMessagePreview } from "./lastMessagePreview";
import { AttachmentMediaReq } from "@/types/attachment";

function att(type: AttachmentMediaReq["attachment_type"], name = "f"): AttachmentMediaReq {
    return {
        attachment_uuid: Math.random().toString(36).slice(2),
        attachment_file_name: name,
        attachment_type: type,
        attachment_size: 1,
        attachment_created_at: new Date().toISOString(),
    };
}

describe("getLastMessagePreview", () => {
    it("returns plain text for a normal message", () => {
        expect(getLastMessagePreview("<p>hello world</p>")).toBe("hello world");
    });

    it("trims whitespace-only HTML to empty", () => {
        expect(getLastMessagePreview("<p></p>")).toBe("");
        expect(getLastMessagePreview("<p>   </p>")).toBe("");
    });

    it("labels a GIF posted via /giphy (img with .gif src, no caption)", () => {
        const html = '<p><img src="https://media.giphy.com/x/abc.gif" alt="hi"/></p>';
        expect(getLastMessagePreview(html)).toBe("GIF");
    });

    it("labels a .gif with query string", () => {
        const html = '<p><img src="https://media.giphy.com/x/abc.gif?cid=1&ct=g" alt=""/></p>';
        expect(getLastMessagePreview(html)).toBe("GIF");
    });

    it("labels an inline non-gif image as Photo", () => {
        const html = '<p><img src="https://example.com/pic.png"/></p>';
        expect(getLastMessagePreview(html)).toBe("Photo");
    });

    it("prefers real caption text over the inline image", () => {
        const html = '<p>check this <img src="x.gif"/></p>';
        expect(getLastMessagePreview(html)).toBe("check this");
    });

    it("labels a single image attachment as Photo", () => {
        expect(getLastMessagePreview("", [att("image")])).toBe("Photo");
    });

    it("labels a single video / document / audio", () => {
        expect(getLastMessagePreview("", [att("video")])).toBe("Video");
        expect(getLastMessagePreview("", [att("document")])).toBe("Document");
        expect(getLastMessagePreview("", [att("audio")])).toBe("Audio message");
    });

    it("pluralizes same-type attachments", () => {
        expect(getLastMessagePreview("", [att("image"), att("image")])).toBe("2 photos");
    });

    it("uses a generic label for mixed-type attachments", () => {
        expect(getLastMessagePreview("", [att("image"), att("document")])).toBe("2 attachments");
    });

    it("prefers caption text over attachment label", () => {
        expect(getLastMessagePreview("<p>caption</p>", [att("image")])).toBe("caption");
    });

    it("returns empty string when there is genuinely nothing", () => {
        expect(getLastMessagePreview("", [])).toBe("");
        expect(getLastMessagePreview(undefined, undefined)).toBe("");
    });
});
