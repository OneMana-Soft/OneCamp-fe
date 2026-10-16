"use client"

import * as React from "react"

/**
 * Whether the editor's content is being read by a guest from outside the
 * workspace (the shared doc page, /guest/d/…) rather than by a member.
 *
 * A guest has no session. Any request a node view makes for them (who "you"
 * are for a mention chip, a table's rows, a poll's votes) answers 401, and the
 * app's answer to a 401 is to sign the browser out and go to the sign-in page:
 * the guest would be taken off the doc they were reading. So node views ask
 * this first, and show what a guest may see without asking the API.
 *
 * The guest viewer provides it around its EditorContent; React node views
 * render inside that tree, so they read it like any context.
 */
export const GuestReaderContext = React.createContext(false)

export function useGuestReader(): boolean {
  return React.useContext(GuestReaderContext)
}
