"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps, type ReactNodeViewProps } from "@tiptap/react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { PieceUnavailable } from "@/lib/lazy/pieceUnavailable"

/**
 * A node view whose component loads the first time one is drawn (docs
 * programme A1, I20). The node itself (its name, attributes and HTML) stays in
 * the editor's schema, so a message or a doc holding one keeps it; only what
 * draws it (a poll's votes, a chart, a diff, a recording's player) waits, and
 * an editor that never shows one never fetches it. Until then the block holds
 * its place, empty, at the height it is usually drawn at (or the room its
 * attributes give it: a picture's size). When its code can't
 * come (no network), the block says so in its place, calmly, and asks again
 * when the browser is back online or the block is next drawn; the editor and
 * the document carry on as they were (lib/lazy lazyPiece, V-64b).
 */
export function lazyNodeView(
  load: () => Promise<React.ComponentType<NodeViewProps>>,
  room: number | ((attrs: NodeViewProps["node"]["attrs"]) => React.CSSProperties) = 48,
): (props: ReactNodeViewProps<HTMLElement>) => React.JSX.Element {
  const roomOf = (attrs: NodeViewProps["node"]["attrs"]) => (typeof room === "number" ? { minHeight: room } : room(attrs))
  const Lazy = lazyPiece(() => load().then((Component) => ({ default: Component })), {
    failed: ({ retry, node }) => (
      <NodeViewWrapper data-node-unavailable="" contentEditable={false} style={roomOf(node.attrs)}>
        <PieceUnavailable what="this block" retry={retry} />
      </NodeViewWrapper>
    ),
  })
  // Tiptap hands a node view a ref of its own; the view drawn inside doesn't take one.
  function LazyNodeView({ ref: _ref, ...props }: ReactNodeViewProps<HTMLElement>) {
    return (
      <React.Suspense fallback={<NodeViewWrapper data-node-loading="" contentEditable={false} style={roomOf(props.node.attrs)} />}>
        <Lazy {...props} />
      </React.Suspense>
    )
  }
  return LazyNodeView
}
