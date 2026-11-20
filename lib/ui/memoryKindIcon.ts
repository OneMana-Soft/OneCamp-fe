/**
 * A memory item's kind -> its mark: the one map for the memory page, Home's
 * "What needs me now", the briefing's open items and Save to memory's menu.
 * A kind is an identity, not a status (DESIGN-BUILD-118 F1): a commitment is
 * a promise (Handshake), never CheckCircle2, which beside an open task's
 * empty circle read as a done task; a glossary entry is a word (BookA), not
 * the AI. A leaf (the icons only), so a lazy chunk takes it without the
 * shared core.
 */
import type { ComponentType } from "react"
// From lucide-react itself, not @/lib/icons: every route reads that registry,
// and the root and chat layouts' source lines had no room for a line more.
import { BookA, Handshake, HelpCircle, Zap } from "lucide-react"
import type { MemoryKind } from "@/services/memoryService"

export const MEMORY_KIND_ICON: Record<MemoryKind, ComponentType<{ className?: string }>> = {
  decision: Zap,
  commitment: Handshake,
  question: HelpCircle,
  glossary: BookA,
}
