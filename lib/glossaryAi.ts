import type { GlossaryRow } from "@/lib/glossary"

/**
 * The AI edition's words (UX-PROGRAM foundation 7), the rows of lib/glossary.ts
 * that only this edition says. The AI-free line ports lib/ whole and leaves
 * this file out (AI_ONLY in lib/editionBoundary.test.ts), so none of them
 * reach it. app/glossaryGuard.test.ts counts their retired words in this
 * edition's copy. Adding a word: one row, in term order, as in lib/glossary.ts.
 */
// prettier-ignore
export const GLOSSARY_AI: readonly (GlossaryRow & { edition: "ai" })[] = [
  { term: "Act on its own", means: "an agent's setting: it acts without asking first", owner: "ADMIN", edition: "ai" },
  { term: "Agents", means: "the workspace's bots, acting under their own names", owner: "IA", edition: "ai" },
  { term: "Ask first", means: "an agent's setting: it asks before each action (the default)", owner: "ADMIN", edition: "ai" },
  { term: "OneCamp AI", means: "the built-in assistant that answers and drafts", retired: ["AI teammate", "AI teammates", "AI assistant"], owner: "IA", edition: "ai" },
  { term: "Outside assistants", means: "the assistants people connected from outside (ChatGPT, Claude), as an admin sees them", owner: "ADMIN", edition: "ai" },
  { term: "Plan, then ask", means: "an agent's setting: it plans, then asks before it acts", owner: "ADMIN", edition: "ai" },
  { term: "Remember this for AI", means: "keep a message in the workspace's AI memory", retired: ["Save to memory"], owner: "CHAT", edition: "ai" },
  { term: "Tools for your agents", means: "the tools (MCP) an admin lets the workspace's agents use", owner: "ADMIN", edition: "ai" },
  { term: "Your assistants", means: "the outside assistants a person connected, acting as them", retired: ["Your AI assistants"], owner: "IA", edition: "ai" },
]
