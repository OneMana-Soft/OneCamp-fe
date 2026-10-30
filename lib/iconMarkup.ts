// An icon as plain markup (tables T6b): the svg a lucide icon draws, without
// the two components it is drawn through (the named icon, then lucide's own
// Icon). For markup drawn by the thousand, such as the grid's cells at rest
// as rows scroll in, where each component is a render. Each forwardRef's
// render is called as React would call it (neither holds a hook); an icon
// of any other make comes back as its own element, drawn as usual.

import * as React from "react"

type ForwardRef = { $$typeof: symbol; render: (props: object, ref: null) => React.ReactNode }

const isForwardRef = (t: unknown): t is ForwardRef => typeof t === "object" && t !== null && typeof (t as ForwardRef).render === "function"

/** icon's markup with props, as host elements where it is a lucide icon. */
export function iconMarkup<P extends object>(icon: React.ComponentType<P>, props: P): React.ReactNode {
  let node: React.ReactNode = React.createElement(icon, props)
  for (let i = 0; i < 4 && React.isValidElement(node) && isForwardRef(node.type); i++) {
    node = node.type.render(node.props as object, null)
  }
  return node
}
