"use client"

/**
 * The review bar in the doc editor's 'editorOverlay' slot (docs programme A9;
 * registered in minimal-tiptap/extensions/proposals/register.ts): once per
 * editor, loaded the first time a doc draws it. It shows only while the reader
 * can edit (accepting a change writes it). The proposal it is on gets the
 * handlers its producer gave (./reviewers.ts): B9's AI bar names the model and
 * records an accept; a teammate's or an agent's suggestion passes accept and
 * decline from ./persisted when that lands.
 */

import { useSyncExternalStore } from "react"
import { useEditorState } from "@tiptap/react"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { ProposalReviewBar } from "./ProposalReviewBar"
import { reviewerFor, reviewersVersion, subscribeReviewers } from "./reviewers"

export default function ReviewBarSlot({ editor }: SlotProps) {
  const editable = useEditorState({ editor: editor ?? null, selector: ({ editor: e }) => !!e?.isEditable })
  const focus = useEditorState({ editor: editor ?? null, selector: ({ editor: e }) => (e ? proposalsOf(e.state).focus : null) })
  useSyncExternalStore(subscribeReviewers, reviewersVersion, reviewersVersion)
  if (!editor || !editable) return null
  return <ProposalReviewBar editor={editor} {...reviewerFor(focus)} />
}
