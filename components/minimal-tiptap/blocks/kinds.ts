import type { EditorKind } from "@/components/docEditor/registry/types"

/** Every editor: the doc page, the guest's page, the chat composer and messages, a task's description. */
export const EVERY_EDITOR: EditorKind[] = ["doc", "guest", "chat", "task"]

/** A doc's editors: the guest's schema is always the doc's (I4). */
export const DOC_EDITORS: EditorKind[] = ["doc", "guest"]

/** Where the formatting items of "/" show: every editor someone types in. */
export const TYPING_EDITORS: EditorKind[] = ["doc", "chat", "task"]

/**
 * Each built-in block's place in the extension list: the place it had in the
 * hand-written lists (use-minimal-tiptap.ts createExtensions, then the doc's
 * extras), since a later extension's keys run first. Packages come after all
 * of these (factory.ts PACKAGE_ORDER).
 */
export const ORDER = {
  starterKit: 100,
  link: 200,
  emoji: 300,
  poll: 400,
  mention: 500,
  channelMention: 600,
  entityMention: 700,
  underline: 800,
  image: 900,
  fileHandler: 1000,
  color: 1100,
  textStyle: 1200,
  selection: 1300,
  typography: 1400,
  unsetAllMarks: 1500,
  horizontalRule: 1600,
  resetMarksOnEnter: 1700,
  codeBlock: 1800,
  recordingEmbed: 1900,
  chartEmbed: 2000,
  diffEmbed: 2100,
  placeholder: 2200,
  slash: 2300,
  submit: 2400,
  offloadImages: 2500,
  collaboration: 2600,
  // The doc's own, after the shared list.
  callout: 3000,
  collapsible: 3100,
  tableEmbed: 3200,
  blockHandle: 3300,
  clickToCreate: 3400,
  taskList: 3500,
  docKeymap: 3600,
  // Every editor's: the keys the shortcut table binds itself.
  shortcutTable: 3650,
  clipboardMarkdown: 3700,
  blockId: 3800,
} as const

/** "/" menu order within a section, as the hand-written menu had it. */
export const SLASH_ORDER = {
  heading1: 10,
  heading2: 20,
  heading3: 30,
  bulletList: 40,
  orderedList: 50,
  taskList: 60,
  blockquote: 70,
  codeBlock: 80,
  horizontalRule: 90,
  callout: 100,
  collapsible: 110,
  image: 120,
  table: 130,
  bold: 200,
  italic: 210,
  underline: 220,
  strikethrough: 230,
  inlineCode: 240,
  clearFormatting: 250,
} as const
