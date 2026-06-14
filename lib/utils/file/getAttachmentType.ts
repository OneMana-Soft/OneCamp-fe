import { AttachmentType } from "@/types/attachment"

export const ATTACHMENT_TYPE_IMAGE = "image"
export const ATTACHMENT_TYPE_DOC = "document"
export const ATTACHMENT_TYPE_AUDIO = "audio"
export const ATTACHMENT_TYPE_VIDEO = "video"
export const ATTACHMENT_TYPE_OTHER = "other"

/**
 * Extension → AttachmentType lookup.
 *
 * Kept in sync with the BE classifiers that mirror this list:
 *   - business/SlackImport/file_worker.go::classifyAttachmentByName
 *   - business/Import/attachment_worker.go::classifyAttachmentByName
 *
 * Cover the modern image formats (webp, avif, heic, svg, bmp, tiff)
 * because every browser <img> can render them; routing them to the
 * video player breaks the lightbox. webp in particular is the default
 * Chrome screenshot format and the most common offender.
 */
const IMAGE_EXTS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "heic",
    "heif",
    "svg",
    "bmp",
    "tif",
    "tiff",
    "ico",
])

const VIDEO_EXTS = new Set([
    "mp4",
    "mov",
    "webm",
    "avi",
    "mkv",
    "m4v",
    "3gp",
])

const AUDIO_EXTS = new Set([
    "mp3",
    "wav",
    "ogg",
    "m4a",
    "aac",
    "flac",
    "opus",
])

const DOC_EXTS = new Set([
    "pdf",
    "txt",
    "md",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "csv",
    "json",
    "xml",
    "log",
    "ppt",
    "pptx",
    "rtf",
])

export const getAttachmentType = (fileName: string): AttachmentType => {
    if (!fileName) return ATTACHMENT_TYPE_OTHER

    // Some file names arrive with query strings (e.g. presigned URLs
    // round-tripped as filenames). Strip them so the extension lookup
    // sees the real tail.
    const cleaned = fileName.split("?")[0].split("#")[0]
    const extension = cleaned.split(".").pop()?.toLowerCase() ?? ""

    if (IMAGE_EXTS.has(extension)) return ATTACHMENT_TYPE_IMAGE
    if (VIDEO_EXTS.has(extension)) return ATTACHMENT_TYPE_VIDEO
    if (AUDIO_EXTS.has(extension)) return ATTACHMENT_TYPE_AUDIO
    if (DOC_EXTS.has(extension)) return ATTACHMENT_TYPE_DOC

    return ATTACHMENT_TYPE_OTHER
}

/**
 * Returns true when the file name maps to an extension that any
 * modern browser can render with a plain <img>. Used by the lightbox
 * to recover from legacy rows where attachment_type was persisted as
 * something other than "image" before the classifier was fixed.
 */
export const isImageByExtension = (fileName: string): boolean => {
    if (!fileName) return false
    const cleaned = fileName.split("?")[0].split("#")[0]
    const extension = cleaned.split(".").pop()?.toLowerCase() ?? ""
    return IMAGE_EXTS.has(extension)
}
