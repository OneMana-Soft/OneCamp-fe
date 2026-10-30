"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { joinTarget } from "@/lib/calls/joinTarget"

/**
 * Another way in, under Start meeting (calls meet-01): a room's name or a
 * link, as Meet's "Enter a code or link". A call in this app opens at its
 * member door, in as yourself; a call anywhere else in a tab of its own.
 */
export function JoinByCode() {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  const join = (e: FormEvent) => {
    e.preventDefault()
    const target = joinTarget(typed, window.location.origin)
    if (!target) {
      setProblem("Type a room's name, or paste a call's link.")
      return
    }
    if ("url" in target) window.open(target.url, "_blank", "noopener,noreferrer")
    else router.push(target.path)
  }

  return (
    <form onSubmit={join} noValidate className="mt-4 grid gap-2 border-t border-line pt-4">
      <Field label="Or join with a room's name or a link" error={problem}>
        <Input
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setProblem(null)
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
        />
      </Field>
      <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={!typed.trim()}>
        Join
      </Button>
    </form>
  )
}
