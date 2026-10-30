import type { Metadata } from "next"
import type { ReactNode } from "react"

// A personal room's address is for the people it is sent to, never a search result.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function RoomLayout({ children }: { children: ReactNode }) {
  return children
}
