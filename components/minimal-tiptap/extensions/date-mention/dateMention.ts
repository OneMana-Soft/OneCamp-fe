"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { dateWords, isoDate } from "@/lib/codec/connectedValues"
import { dataAttr } from "../link/dataAttr"
import { dateChoices, reminderTime, reminderWords, type DateChoice } from "./parseDate"
import { remindAt } from "./reminders"
import { DateMentionView } from "./DateMentionView"

/** A day the "@" list offers, and its reminder if it may have one: 9:00 that day, in words. */
export type DateOffer = DateChoice & { remind: string | null }

/**
 * What the "@" list (mention-list) asks of dates, in a doc's editor only: the
 * list loads with every editor, dates with the doc's.
 */
export interface DateMentionStorage {
  suggest(query: string): DateOffer[]
  remind: typeof remindAt
}

/**
 * A date in a line (docs C1, editor.md P1-13): "@today", "@next monday",
 * "@12 Oct", picked from the "@" list. It keeps the day it names, never the
 * words, so "Today" reads "Yesterday" tomorrow (D5); with a reminder, the id
 * of the Later item it set (D6). Its HTML is the day in words, for a reader
 * without the app.
 */
export const DateMention = Node.create<Record<string, never>, DateMentionStorage>({
  name: "dateMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: (el) => isoDate(el.getAttribute("datetime")) || null,
        renderHTML: (attrs) => (isoDate(attrs.date) ? { datetime: attrs.date } : {}),
      },
      reminder: dataAttr("reminder", "data-reminder"),
    }
  },

  addStorage() {
    return {
      suggest: (query: string) =>
        dateChoices(query).map((c) => {
          const when = reminderTime(c.date)
          return { ...c, remind: when ? reminderWords(when) : null }
        }),
      remind: remindAt,
    }
  },

  parseHTML() {
    return [{ tag: 'time[data-type="date-mention"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["time", mergeAttributes({ "data-type": "date-mention" }, HTMLAttributes), dateWords(node.attrs.date)]
  },

  renderText({ node }) {
    return dateWords(node.attrs.date)
  },

  addNodeView() {
    return ReactNodeViewRenderer(DateMentionView, { as: "span" })
  },
})
