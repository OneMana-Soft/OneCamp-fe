"use client"

/**
 * What a doc's links and media add to its editor (docs programme B4), in one
 * chunk fetched with the doc's other blocks (register.ts): paste, the link
 * mention, the bookmark, the embed and the file block. Their views load when
 * one first shows.
 */

export { SmartPaste } from "../smart-paste/smartPaste"
export { LinkMention } from "../link/linkMention"
export { Bookmark } from "../bookmark/bookmark"
export { WebEmbed } from "../web-embed/webEmbed"
export { FileBlock, ACCEPT, pickFiles } from "../file-block/fileBlock"

// Its "/" entries, block actions and overlay, added as the chunk loads:
// before a doc's editor is built, so they are there when it is.
import "./contrib"
