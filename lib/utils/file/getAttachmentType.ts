import { AttachmentType } from "@/types/attachment"

const ATTACHMENT_TYPE_IMAGE = "image"
const ATTACHMENT_TYPE_DOC = "document"
const ATTACHMENT_TYPE_AUDIO = "audio"
const ATTACHMENT_TYPE_VIDEO = "video"
const ATTACHMENT_TYPE_OTHER = "other"

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
    // Audio-only WebM: how a voice clip recorded in Chrome or Firefox is saved.
    "weba",
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

/**
 * A file name's extension, lower case. Some names arrive with query strings
 * (presigned URLs round-tripped as file names): the lookup sees the real tail.
 */
const extensionOf = (fileName: string): string => fileName.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? ""

export const getAttachmentType = (fileName: string): AttachmentType => {
    if (!fileName) return ATTACHMENT_TYPE_OTHER

    const extension = extensionOf(fileName)

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
    return IMAGE_EXTS.has(extensionOf(fileName))
}

/**
 * The files the in-app viewer shows (components/attachments/documentViewer):
 * a PDF in the browser's own reader, Word and Excel files drawn as a page,
 * and text. A legacy .doc isn't one: the viewer can't read it.
 */
const VIEWABLE_DOC_EXTS = new Set(["pdf", "docx", "xls", "xlsx", "txt", "md", "csv", "json", "xml", "log"])

/** The viewer's type for a file it can show (its extension), or null for one it can't. */
export const viewableDocumentType = (fileName: string): string | null => {
    const extension = fileName ? extensionOf(fileName) : ""
    return VIEWABLE_DOC_EXTS.has(extension) ? extension : null
}
