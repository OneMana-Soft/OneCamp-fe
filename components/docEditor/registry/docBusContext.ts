/**
 * The doc bus as a component reads it: the shell's bus, or one nothing
 * listens to. Its own module, apart from the bus (commandBus), so a page that
 * only hosts a doc pane (the board) or a bar that only reads the bus
 * (ActiveUsersBar) doesn't bring the bus and the palette's registry with it.
 */

import * as React from 'react'
import type { DocCommandBus } from './types'

/** A bus nothing listens to: what an action gets outside a doc. */
export const NO_BUS: DocCommandBus = { docId: '', key: '', emit() {}, on: () => () => {} }

/** The bus of the doc shell around a component (the header, a panel), when it has one. */
export const DocBusContext = React.createContext<DocCommandBus | null>(null)

export function useDocBus(): DocCommandBus {
  return React.useContext(DocBusContext) ?? NO_BUS
}
