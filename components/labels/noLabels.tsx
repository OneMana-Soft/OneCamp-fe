"use client"

// The label picker's empty state (miro-44 L), passed in by the page with the
// EmptyState it already loads: the lazy picker brings none of its own.

import { EmptyState } from "@/components/ui/empty-state"
import { ShieldCheck } from "@/lib/icons"

export function NoLabelsYet() {
  return <EmptyState icon={ShieldCheck} headingLevel={3} title="No labels yet" description="A workspace admin adds labels in Settings, under Security. Each one keeps boards and docs from guest links or exports." />
}
