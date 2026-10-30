"use client"

import * as React from "react"
import { Switch } from "@/components/ui/switch"

/** A lasting setting of the call as a switch row: its name, a line of help, the switch. */
export function ToolSwitch({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = React.useId()
  return (
    <div className="mt-2 flex min-h-8 items-center justify-between gap-3 [@media(pointer:coarse)]:min-h-11" data-call-switch="">
      <span className="flex min-w-0 flex-col">
        <label htmlFor={id} className="cursor-pointer text-ui-sm text-ink-2">
          {label}
        </label>
        {help ? (
          <span id={`${id}-help`} className="text-meta text-ink-3">
            {help}
          </span>
        ) : null}
      </span>
      <Switch id={id} aria-describedby={help ? `${id}-help` : undefined} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
