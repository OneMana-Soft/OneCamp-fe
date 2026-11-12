import type { SVGProps } from "react"

/**
 * Outlook's mark in its own blue: a brand mark, which keeps its colours as
 * Google's G does (GoogleMark). Wherever Outlook Calendar is named.
 */
export function OutlookMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-outlook-mark="" {...props}>
      <rect x="9" y="4" width="13" height="16" rx="2" fill="#28A8EA" />
      <path fill="#0078D4" d="M9 9h13v9a2 2 0 0 1-2 2H9z" />
      <rect x="2" y="6" width="12" height="12" rx="2" fill="#0F6CBD" />
      <circle cx="8" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  )
}
