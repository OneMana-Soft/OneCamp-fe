import type { ReactNode } from "react"
import { EmbeddedPage } from "@/components/public/EmbeddedPage"

// A board's embed is a page another site frames (lib/security/framing.ts), so
// the shell's own corner cards stay off it (components/public/EmbeddedPage).
export default function BoardEmbedLayout({ children }: { children: ReactNode }) {
    return <EmbeddedPage>{children}</EmbeddedPage>
}
