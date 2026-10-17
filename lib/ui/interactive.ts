import { Children, createElement, type ReactNode } from "react"

import type { CampHue } from "@/lib/campHue"

/** The interaction layer's attributes (INTERACTION_SPEC §9.2): spread ix(kind) in place of state classes. */
type IxKind =
  | "button" | "icon" | "row" | "nav" | "tree" | "card" | "chip" | "tab" | "item"
  | "field" | "toggle" | "cell" | "event" | "message" | "block" | "avatar" | "link"

interface IxOptions {
  hue?: CampHue | "agent"
  /** Only where no ARIA state fits. */
  selected?: boolean
  /** Focusable still (aria-disabled), with the reason in a tip. */
  disabledReason?: string
  tone?: "danger" | "success" | "light" | "primary"
}

type IxAttrs = { "data-interactive": IxKind; "data-hue"?: string; "data-tone"?: string; "data-selected"?: "true"; "aria-disabled"?: true; "data-disabled-reason"?: string }

/** Only what is set: an undefined key would erase a primitive's own (Radix's aria-disabled). */
export function ix(kind: IxKind, { hue, selected, disabledReason, tone }: IxOptions = {}): IxAttrs {
  const a: IxAttrs = { "data-interactive": kind }
  if (hue) a["data-hue"] = hue
  if (tone) a["data-tone"] = tone
  if (selected) a["data-selected"] = "true"
  if (disabledReason) Object.assign(a, { "aria-disabled": true, "data-disabled-reason": disabledReason })
  return a
}

/** Wraps a control's text in [data-label], which reserves its selected weight (D8). */
export function withLabel(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" && child.trim() ? createElement("span", { "data-label": child }, child) : child,
  )
}
