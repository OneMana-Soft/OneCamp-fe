"use client"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The workspace's mark on a phone (design v3, shell M8): a 24px r7 tile in
 * the logo's gradient with the white ring, the only gradient in the chrome.
 * The desktop header draws the same mark at 26px. Decorative: the button
 * around it carries the name.
 */
export function PhoneMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" data-phone-mark="" className={cn("phone-mark", className)}>
      <svg width="14" height="14" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" strokeWidth="3.6" />
      </svg>
    </span>
  )
}
