"use client"

/**
 * What sits inside a line, in every editor: links, underline, text colour, the
 * three chips (@person, #channel, +work item) and ":" emoji.
 */

import type { DOMOutputSpec } from "@tiptap/pm/model"
import { PluginKey } from "@tiptap/pm/state"
import { mergeAttributes, ReactNodeViewRenderer } from "@tiptap/react"
import { Mention } from "@tiptap/extension-mention"
import { Underline } from "@tiptap/extension-underline"
import { Underline as UnderlineIcon } from "@/lib/icons"
import { registerBlock } from "@/components/docEditor/registry/registry"
import { Link } from "../extensions/link/link"
import { Color, TextStyle } from "../extensions/color/color"
import { EmojiSuggest } from "../extensions/emoji-suggest/emojiSuggest"
import { mentionSuggestionOptions } from "../extensions/mention-list/mentionList"
import MentionNodeView from "../extensions/mention-list/MentionNodeView"
import ReferenceMentionNodeView from "../extensions/reference-mention/ReferenceMentionNodeView"
import { makeReferenceSuggestion } from "../extensions/reference-mention/referenceMentionList"
import { EVERY_EDITOR, ORDER, SLASH_ORDER, TYPING_EDITORS } from "./kinds"

const MENTION_ATTRS = ["id", "label", "mentionSuggestionChar"]

registerBlock({
  id: "link",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.link,
  extensions: [Link],
  schema: [{ kind: "mark", name: "link", attrs: ["class", "href", "rel", "target"] }],
  shortcuts: [{ keys: "Mod-k", label: "Link, with text selected", group: "Text", order: 60 }],
})

// ":" and two letters offers a row of emoji (design v3 chat, C43).
registerBlock({ id: "emoji", editors: EVERY_EDITOR, edition: "both", order: ORDER.emoji, extensions: [EmojiSuggest], schema: [] })

// Distinct plugin keys so the #-channel and +-work-item suggestion plugins
// don't collide with each other or with the @-user mention plugin.
const ChannelMentionPluginKey = new PluginKey("channelMention")
const EntityMentionPluginKey = new PluginKey("entityMention")

registerBlock({
  id: "mention",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.mention,
  extensions: [
    Mention.extend({
      addNodeView() {
        return ReactNodeViewRenderer(MentionNodeView)
      },
    }).configure({
      suggestion: mentionSuggestionOptions,
      HTMLAttributes: { class: "mention" },
      renderHTML: (prop): DOMOutputSpec => [
        "span",
        mergeAttributes({ class: "mention hover:cursor-pointer", "data-id": prop.node.attrs.id, "data-label": prop.node.attrs.label, "data-type": "mention" }),
        `@${prop.node.attrs.label}`,
      ],
    }),
  ],
  schema: [{ kind: "node", name: "mention", attrs: MENTION_ATTRS }],
  shortcuts: [{ typed: ["@"], label: "Mention someone", group: "Doc", order: 70 }],
})

// #-trigger: reference a channel. A clickable chip in the composer and in
// displayed messages (the read-only editor uses the same config).
registerBlock({
  id: "channelMention",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.channelMention,
  extensions: [
    Mention.extend({
      name: "channelMention",
      addNodeView() {
        return ReactNodeViewRenderer(ReferenceMentionNodeView)
      },
    }).configure({
      suggestion: makeReferenceSuggestion({ char: "#", types: ["channel"], pluginKey: ChannelMentionPluginKey, emptyHint: "Type to search channels", nodeName: "channelMention" }),
      HTMLAttributes: { class: "channel-mention" },
      renderHTML: (prop): DOMOutputSpec => [
        "span",
        mergeAttributes({ class: "channel-mention hover:cursor-pointer", "data-id": prop.node.attrs.id, "data-label": prop.node.attrs.label, "data-type": "channelMention" }),
        `#${prop.node.attrs.label}`,
      ],
    }),
  ],
  schema: [{ kind: "node", name: "channelMention", attrs: MENTION_ATTRS }],
})

// +-trigger: reference a work item (doc, board, task, project).
registerBlock({
  id: "entityMention",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.entityMention,
  extensions: [
    Mention.extend({
      name: "entityMention",
      addNodeView() {
        return ReactNodeViewRenderer(ReferenceMentionNodeView)
      },
    }).configure({
      suggestion: makeReferenceSuggestion({ char: "+", types: ["doc", "board", "task", "project"], pluginKey: EntityMentionPluginKey, emptyHint: "Type to search docs, boards, tasks, projects", nodeName: "entityMention" }),
      HTMLAttributes: { class: "entity-mention" },
      renderHTML: (prop): DOMOutputSpec => [
        "span",
        mergeAttributes({ class: "entity-mention hover:cursor-pointer", "data-id": prop.node.attrs.id, "data-label": prop.node.attrs.label, "data-type": "entityMention" }),
        `${prop.node.attrs.label}`,
      ],
    }),
  ],
  schema: [{ kind: "node", name: "entityMention", attrs: MENTION_ATTRS }],
})

registerBlock({
  id: "underline",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.underline,
  extensions: [Underline],
  schema: [{ kind: "mark", name: "underline", attrs: [] }],
  slash: [
    {
      id: "underline",
      title: "Underline",
      description: "Underline text",
      aliases: ["u"],
      icon: UnderlineIcon,
      section: "Format",
      order: SLASH_ORDER.underline,
      editors: TYPING_EDITORS,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).toggleUnderline().run()
      },
    },
  ],
  shortcuts: [{ keys: "Mod-u", label: "Underline", group: "Text", order: 30 }],
})

// Colour is an attribute of textStyle; the two go in their old places.
registerBlock({
  id: "color",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.color,
  extensions: [Color],
  schema: [],
})
registerBlock({
  id: "textStyle",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.textStyle,
  extensions: [TextStyle],
  schema: [{ kind: "mark", name: "textStyle", attrs: ["color"] }],
})
