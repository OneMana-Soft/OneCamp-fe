/**
 * AI & agents' sub-pages (design v3, admin §A15). The section was one 7,000px
 * column of switches, meters, pickers and tables; it is six pages now, chosen
 * from a tab bar under the header and held in the URL as `?tab=ai-models&sub=…`.
 *
 * The card ids the section has always had (`#ai-models-drill` and the rest)
 * are in links in the wild, in Search settings (lib/adminSections) and in the
 * consent page's "manage it here" link, so each one still lands: it names the
 * sub-page that holds the card, which opens, and the card flashes.
 */

export const AI_SUBTABS = [
  { value: "overview", label: "Overview" },
  { value: "models", label: "Models" },
  { value: "agents", label: "Agents" },
  { value: "governance", label: "Governance" },
  { value: "usage", label: "Usage" },
  { value: "advanced", label: "Advanced" },
] as const

export type AISubTab = (typeof AI_SUBTABS)[number]["value"]

export const DEFAULT_AI_SUBTAB: AISubTab = "overview"

/**
 * Every card id in the section, and the sub-page it lives on. The first seven
 * are the old on-this-page jumps; the rest are cards that had ids of their own
 * inside the models card.
 */
export const AI_CARD_TAB: Record<string, AISubTab> = {
  "ai-models-models": "models",
  "ai-models-routing": "models",
  "ai-models-inventory": "agents",
  "ai-models-delegation": "agents",
  "ai-models-drill": "governance",
  "ai-models-mcp": "governance",
  "ai-models-activity": "usage",
  // Cards that were sections of the models card.
  "ai-models-status": "overview",
  "ai-models-selftest": "overview",
  "ai-models-allowlist": "models",
  "ai-models-ambient": "agents",
  "ai-models-mcp-servers": "agents",
  "ai-models-redaction": "governance",
  "ai-models-budgets": "usage",
  "ai-models-consumers": "usage",
  "ai-models-tuning": "advanced",
  "ai-models-depth": "advanced",
  "ai-models-web-search": "advanced",
  "ai-models-sandbox": "advanced",
  "ai-models-code-prs": "advanced",
}

export function isAISubTab(v: string | null | undefined): v is AISubTab {
  return !!v && AI_SUBTABS.some((t) => t.value === v)
}

/**
 * The sub-page to show: a card named by the URL's #fragment wins (it is what
 * the link was for), then `?sub=`, then Overview.
 */
export function aiSubTabFor(sub: string | null | undefined, hash: string | null | undefined): AISubTab {
  const id = decodeURIComponent((hash ?? "").replace(/^#/, ""))
  if (id && AI_CARD_TAB[id]) return AI_CARD_TAB[id]
  return isAISubTab(sub) ? sub : DEFAULT_AI_SUBTAB
}
