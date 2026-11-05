/**
 * A sensitivity label's rules (miro-44 L): which items carry labels, the rules'
 * keys and the words they are said in, whether a label holds one, the order
 * labels are listed in, and a refusal a label made. Pure; they load with what
 * draws them (the chip, the picker, a share or export dialog, the admin card).
 */

import type { LabelKind, LabelRule, SensitivityLabel } from "./labelTypes"

export const LABELLED_KINDS: readonly LabelKind[] = ["board", "doc"]

/** Whether a kind of item carries labels (a guest link's resource type, say). Pure. */
export function carriesLabels(kind: string): kind is LabelKind {
  return (LABELLED_KINDS as readonly string[]).includes(kind)
}

export const RULE_NO_GUEST_LINKS = "no_guest_links"
export const RULE_NO_EXPORT = "no_export"

/** Whether a label carries a rule. Pure. */
export function labelHas(label: SensitivityLabel | null | undefined, rule: string): boolean {
  return !!label?.rules?.includes(rule)
}

/** The refusal codes a label answers with: a rule that held, and a lowering only the owner or an admin may make. */
export const LABEL_REFUSALS = ["label_forbids", "label_owner_lowers"] as const

/**
 * The server's own words for a refusal a label made (403, code label_forbids
 * or label_owner_lowers: "This board is labelled Confidential: it can't be
 * exported. …"), shown as they were sent; null for any other failure. Pure.
 */
export function labelRefusal(error: unknown): string | null {
  const data = (error as { response?: { data?: { code?: unknown; msg?: unknown } } } | null)?.response?.data
  const code = data?.code
  const msg = typeof data?.msg === "string" ? data.msg.trim() : ""
  return msg && (LABEL_REFUSALS as readonly unknown[]).includes(code) ? msg : null
}

/**
 * The rules in the server's names and order (business/Label's registerRule), for
 * what is said before GET /labels answers (a chip's title, a dialog's note). The
 * server's list wins wherever it has been read.
 */
export const KNOWN_RULES: readonly LabelRule[] = [
  { key: RULE_NO_GUEST_LINKS, name: "No guest links" },
  { key: RULE_NO_EXPORT, name: "No exports" },
]

/** A rule's name: the server's, else its key in words ("no_export" → "No export"). Pure. */
export function ruleName(key: string, rules?: readonly LabelRule[] | null): string {
  const named = rules?.find((r) => r.key === key)?.name ?? KNOWN_RULES.find((r) => r.key === key)?.name
  if (named) return named
  const words = key.replace(/_/g, " ").trim()
  return words ? words[0].toUpperCase() + words.slice(1) : key
}

/** A label's rules on one line, in the admin card's order: "No guest links · No exports", or "No rules". Pure. */
export function ruleLine(keys: string[] | null | undefined, rules?: readonly LabelRule[] | null): string {
  const list = keys ?? []
  if (list.length === 0) return "No rules"
  const order = rules?.length ? rules : KNOWN_RULES
  const at = (k: string) => {
    const i = order.findIndex((r) => r.key === k)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...list]
    .sort((a, b) => at(a) - at(b) || a.localeCompare(b))
    .map((k) => ruleName(k, rules))
    .join(" · ")
}

/** The workspace's labels, highest level first, then by name: the picker's and the card's order. Pure. */
export function byLevel(labels: SensitivityLabel[] | null | undefined): SensitivityLabel[] {
  return [...(labels ?? [])].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
}
