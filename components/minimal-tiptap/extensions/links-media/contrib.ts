"use client"

import type { Editor, Range } from "@tiptap/core"
import { registerAction, registerBlock, registerDialog, registerSlot } from "@/components/docEditor/registry/registry"
import type { ActionContext, SurfaceAction } from "@/components/docEditor/registry/types"
import { Bookmark, Crop, Download, ExternalLink, File, FileText, Globe, Headphones, Link2, RefreshCw, Replace, Type, Video } from "@/lib/icons"
import { embedFor } from "@/lib/embeds/providers"
import { ACCEPT, pickFiles, type FileKind } from "../file-block/fileBlock"
import { adminHostsNow, requestLinkFocus } from "./hosts"
import { actionBlock } from "../../utils/actionBlock"
import type { BlockActionId } from "./blockActions"

/**
 * What the chunk adds as it loads (chunk.ts), before a doc's editor is built:
 * the "/" entries for its blocks, their actions on the block menu (B1's ⋮⋮
 * menu and the phone's long-press sheet, WAVE_B_CONTRACTS "The block menu"),
 * the picture's crop and words dialogs, and the overlay that draws the paste
 * menu. What the actions do loads the first time one runs (blockActions.ts).
 */

const S = "Media and embeds"
const add = (type: string) => (e: Editor, r: Range) => {
  requestLinkFocus()
  e.chain().focus().deleteRange(r).insertContent({ type }).run()
}
const pick = (kind: FileKind) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).run()
  void pickFiles(ACCEPT[kind]).then((f) => f.length && e.commands.insertFileBlocks(f))
}

registerBlock({
  id: "linksMediaSlash",
  editors: ["doc"],
  edition: "both",
  schema: [],
  slash: [
    { id: "video", title: "Video", description: "Upload a video to play here", aliases: ["mp4", "movie"], icon: Video, section: S, order: 121, run: pick("video") },
    { id: "audio", title: "Audio", description: "Upload a recording to play here", aliases: ["sound", "mp3", "music"], icon: Headphones, section: S, order: 122, run: pick("audio") },
    { id: "file", title: "File", description: "Upload any file", aliases: ["attachment", "upload"], icon: File, section: S, order: 123, run: pick("file") },
    { id: "pdf", title: "PDF", description: "Upload a PDF to read here", aliases: ["document"], icon: FileText, section: S, order: 124, run: pick("pdf") },
    { id: "bookmark", title: "Bookmark", description: "A link as a card, with its title and picture", aliases: ["link", "url", "web"], icon: Bookmark, section: S, order: 125, run: add("bookmark") },
    {
      id: "embed",
      title: "Embed",
      description: "YouTube, Figma, Loom, Google Docs, Maps and more",
      aliases: ["youtube", "vimeo", "loom", "figma", "maps", "sheets", "gist", "codepen", "excalidraw", "miro", "spotify", "tweet", "iframe"],
      icon: Globe,
      section: S,
      order: 126,
      run: add("webEmbed"),
    },
  ],
})

const typeAt = (ctx: ActionContext) => actionBlock(ctx)?.node.type.name ?? ""

/** One block action, on the block menu for the block types it names; changes only for someone who can edit. */
function action(id: BlockActionId, label: string, icon: SurfaceAction["icon"], types: string[], reads = false, extra?: (ctx: ActionContext) => boolean) {
  registerAction({
    id: `media.${id}`,
    label,
    icon,
    group: "media",
    surfaces: ["blockMenu"],
    edition: "both",
    isVisible: (ctx) => (reads || ctx.canEdit) && types.includes(typeAt(ctx)) && (!extra || extra(ctx)),
    run: (ctx) => import("./blockActions").then((m) => m.runBlockAction(id, ctx)),
  })
}

action("replace", "Replace", Replace, ["image", "fileBlock"])
action("crop", "Crop", Crop, ["image"])
action("alt", "Alt text", Type, ["image"])
action("link", "Link", Link2, ["image"])
action("refresh", "Refresh preview", RefreshCw, ["bookmark"])
action("toEmbed", "Turn into embed", Globe, ["bookmark"], false, (ctx) => !!embedFor(String(actionBlock(ctx)?.node.attrs.href || ""), adminHostsNow()))
action("toBookmark", "Turn into bookmark", Bookmark, ["webEmbed"])
action("toLink", "Turn into link", Link2, ["bookmark", "webEmbed"])
action("open", "Open in a new tab", ExternalLink, ["bookmark", "webEmbed"], true)
action("download", "Download", Download, ["image", "fileBlock"], true)

registerDialog({ id: "media.crop", edition: "both", load: () => import("./CropDialog") })
registerDialog({ id: "media.text", edition: "both", load: () => import("./ImageTextDialog") })

registerSlot({ slot: "editorOverlay", id: "linksMedia", edition: "both", load: () => import("./Overlay") })
