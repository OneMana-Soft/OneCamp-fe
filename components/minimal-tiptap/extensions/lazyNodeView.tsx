"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps, type ReactNodeViewProps } from "@tiptap/react"

/**
 * A node view whose component loads the first time one is drawn (docs
 * programme A1, I20). The node itself (its name, attributes and HTML) stays in
 * the editor's schema, so a message or a doc holding one keeps it; only what
 * draws it (a poll's votes, a chart, a diff, a recording's player) waits, and
 * an editor that never shows one never fetches it. Until then the block holds
 * its place, empty, at the height it is usually drawn at.
 */
export function lazyNodeView(
  load: () => Promise<React.ComponentType<NodeViewProps>>,
  minHeight = 48,
): (props: ReactNodeViewProps<HTMLElement>) => React.JSX.Element {
  const Lazy = React.lazy(() => load().then((Component) => ({ default: Component })))
  // Tiptap hands a node view a ref of its own; the view drawn inside doesn't take one.
  function LazyNodeView({ ref: _ref, ...props }: ReactNodeViewProps<HTMLElement>) {
    return (
      <React.Suspense fallback={<NodeViewWrapper data-node-loading="" contentEditable={false} style={{ minHeight }} />}>
        <Lazy {...props} />
      </React.Suspense>
    )
  }
  return LazyNodeView
}
