"use client"

import { createContext, useContext } from "react"

/**
 * How many were unread as the conversation opened (hooks/useUnreadOnOpen),
 * given by its kind (ChannelConversation) to the two that draw it: the list's
 * "New" line and banner, and the catch-up banner. The count lands after the
 * conversation draws; carried through the body and its pages, it redrew the
 * whole view (renders per switch +3%, chat A1 step 2b).
 */
export const OpenCount = createContext<number | undefined>(undefined)

export const useOpenCount = () => useContext(OpenCount)
