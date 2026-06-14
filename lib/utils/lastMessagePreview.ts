import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { AttachmentMediaReq, AttachmentType } from "@/types/attachment";

/**
 * getLastMessagePreview — the single source of truth for the "last message"
 * line shown in the channel list and chat (DM/group) list.
 *
 * Why this exists: the naive `removeHtmlTags(body) || "sent an attachment"`
 * approach has two failure modes that both render an EMPTY preview:
 *
 *  1. GIFs (and any inline image) are stored as HTML, e.g. the /giphy command
 *     posts `<p><img src="…"/></p>`. The body is therefore NON-empty, so the
 *     "sent an attachment" fallback never triggers — but stripping the tags
 *     leaves an empty string, so the row shows "Username:" with nothing after.
 *  2. A file/photo/video sent with no caption has an empty body; the old code
 *     showed a generic "sent an attachment" with no idea what it was.
 *
 * This helper resolves a human, Slack-style label in priority order:
 *   real text  →  attachment-type label  →  inline-image ("GIF"/"Photo")  →  "".
 */

// Label a set of attachments by their dominant type, e.g. "Photo",
// "2 photos", "Video", "File", "3 files".
function labelForAttachments(attachments: AttachmentMediaReq[]): string {
    if (!attachments || attachments.length === 0) return "";

    const count = attachments.length;

    // Single attachment → precise, type-aware label.
    if (count === 1) {
        return singularLabel(attachments[0].attachment_type);
    }

    // Multiple — if they're all the same type, pluralize that; otherwise
    // fall back to a generic "N attachments".
    const allSame = attachments.every(
        (a) => a.attachment_type === attachments[0].attachment_type,
    );
    if (allSame) {
        return `${count} ${pluralLabel(attachments[0].attachment_type)}`;
    }
    return `${count} attachments`;
}

function singularLabel(type: AttachmentType): string {
    switch (type) {
        case "image":
            return "Photo";
        case "video":
            return "Video";
        case "audio":
            return "Audio message";
        case "document":
            return "Document";
        default:
            return "Attachment";
    }
}

function pluralLabel(type: AttachmentType): string {
    switch (type) {
        case "image":
            return "photos";
        case "video":
            return "videos";
        case "audio":
            return "audio messages";
        case "document":
            return "documents";
        default:
            return "attachments";
    }
}

// Detect whether HTML body is "media-only" — i.e. it strips to empty text but
// contains an inline <img> (the /giphy path, or a pasted image). We label such
// messages "GIF" when the source is clearly a gif, else "Photo".
function inlineImageLabel(html: string): string | null {
    if (!/<img\b/i.test(html)) return null;
    // A .gif source (Giphy renditions, gif uploads) → "GIF", else generic image.
    if (/\.gif(\?|"|'|\s|>)/i.test(html)) return "GIF";
    return "Photo";
}

export function getLastMessagePreview(
    htmlBody: string | undefined | null,
    attachments?: AttachmentMediaReq[] | null,
): string {
    const html = htmlBody || "";
    const text = removeHtmlTags(html).trim();

    // 1. Real text wins (decode is left to the caller's renderer; we only need
    //    the plain text for a one-line preview).
    if (text !== "") {
        return text;
    }

    // 2. No text, but there are file attachments → type-aware label.
    if (attachments && attachments.length > 0) {
        const label = labelForAttachments(attachments);
        if (label) return label;
    }

    // 3. No text, no attachments, but the body is an inline image/GIF embed.
    const imgLabel = inlineImageLabel(html);
    if (imgLabel) return imgLabel;

    // 4. Genuinely empty.
    return "";
}
