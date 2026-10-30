"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ChevronLeft } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"

/**
 * A side menu as a sheet is a step over its menu: Back, and its row's words
 * (textValue, else its text bar what it hides). Back is Radix's own close key.
 */
export default function SubStepHead() {
  const [title, setTitle] = React.useState("")
  const head = React.useCallback((el: HTMLDivElement | null) => {
    const row = el && document.getElementById(el.closest('[role="menu"]')?.getAttribute("aria-labelledby") ?? "")
    if (row) setTitle(row.dataset.textValue || [...row.childNodes].filter((n) => !(n instanceof Element && n.ariaHidden === "true")).map((n) => n.textContent).join(" ").trim())
  }, [])
  return (
    <div ref={head} data-sub-step-head="" className="flex min-h-12 items-center border-b border-line-1 pb-1">
      <DropdownMenuPrimitive.Item
        aria-label="Back"
        className="flex size-11 shrink-0 items-center justify-center rounded-md"
        onSelect={(e) => {
          e.preventDefault()
          e.target?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
        }}
        {...ix("icon")}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </DropdownMenuPrimitive.Item>
      <span className="min-w-0 flex-1 truncate pr-11 text-center text-ui font-semibold text-ink">{title}</span>
    </div>
  )
}