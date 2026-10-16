"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useMedia } from "@/context/MediaQueryContext"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { setDocLook } from "@/services/docChromeService"
import { busForDoc } from "@/components/docEditor/registry/commandBus"
import type { DocLookChange } from "@/types/docChrome"
import { ChromeSheet } from "./chrome/Sheet"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useBacklinksShown } from "./chrome/backlinksPref"
import { usePageFacts } from "./chrome/pageFacts"
import { useDoc } from "./chrome/useDoc"

const FONTS: { value: "" | "serif" | "mono"; label: string; family: string }[] = [
  { value: "", label: "Default", family: "var(--font-sans)" },
  { value: "serif", label: "Serif", family: 'ui-serif, "Iowan Old Style", Charter, Georgia, serif' },
  { value: "mono", label: "Mono", family: "var(--font-mono), ui-monospace, monospace" },
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-ui text-ink">{label}</p>
        {hint ? <p className="text-meta text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

/**
 * Customize page (small-details P18): the page's style for everyone who opens
 * it (its font, small text and full width, D-7: kept on the doc, and saved by
 * anyone who can edit), and what shows around it for this person ("Linked
 * from").
 */
export default function CustomizePage({ docId, onClose }: { docId: string; onClose(): void }) {
  const doc = useDoc(docId)
  const { isMobile } = useMedia()
  const facts = usePageFacts(docId)
  const held = (facts.lock || doc?.doc_lock_level) === "soft" && !facts.unlockedForMe
  const canEdit = (doc?.doc_edit_access ?? 0) > 0 && !held
  const [backlinks, setBacklinks] = useBacklinksShown(docId)

  const change = async (c: Omit<DocLookChange, "doc_uuid">) => {
    try {
      await setDocLook({ doc_uuid: docId, ...c })
    } catch (e) {
      toast({ title: "The page's style didn't change", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  // Full width is the page's for everyone; this person's view follows at once
  // (DocView keeps it, through the doc's command bus).
  const fullWidth = (wide: boolean) => {
    void change({ full_width: wide })
    const shown = !!document.querySelector(`[data-doc-view] .doc-measure-full`)
    if (shown !== wide) busForDoc(docId)?.emit("toggle", { what: "fullWidth" })
  }

  return (
    <ChromeSheet
      onClose={onClose}
      title="Customise page"
      description={
        held ? "The page is locked. Unlock it to change its style." : canEdit ? "The style is the page's, for everyone who opens it." : "Only people who can edit change the page's style."
      }
      data-doc-customize=""
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <section aria-label="Style" className="flex flex-col gap-2">
        <h3 className="text-meta font-medium text-ink-2">Style</h3>
        <RadioGroupPrimitive.Root
          value={doc?.doc_font ?? ""}
          onValueChange={(v) => void change({ font: v as "" | "serif" | "mono" })}
          disabled={!canEdit}
          aria-label="Font"
          className="grid grid-cols-3 gap-2"
        >
          {FONTS.map((f) => (
            <RadioGroupPrimitive.Item
              key={f.label}
              value={f.value}
              data-font={f.value || "default"}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl bg-sunken py-3 text-ink-2 outline-none ring-1 ring-inset ring-transparent transition-colors",
                "hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:bg-raised data-[state=checked]:text-ink data-[state=checked]:shadow-e1 data-[state=checked]:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span aria-hidden="true" className="text-2xl" style={{ fontFamily: f.family }}>
                Ag
              </span>
              <span className="text-meta">{f.label}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <Row label="Small text" hint="Everything a step smaller, for long pages.">
          <Switch checked={!!doc?.doc_small_text} disabled={!canEdit} onCheckedChange={(v) => void change({ small_text: v })} aria-label="Small text" />
        </Row>
        {!isMobile ? (
          <Row label="Full width" hint="The page uses the whole window.">
            <Switch checked={!!doc?.doc_full_width} disabled={!canEdit} onCheckedChange={fullWidth} aria-label="Full width" />
          </Row>
        ) : null}
      </section>
      <section aria-label="Around the page" className="flex flex-col gap-1 border-t border-line pt-3">
        <h3 className="text-meta font-medium text-ink-2">Just for you</h3>
        <Row label="Linked from" hint="The tasks, projects and docs that link here, above the page.">
          <Switch checked={backlinks} onCheckedChange={setBacklinks} aria-label="Show what links here" />
        </Row>
      </section>
    </ChromeSheet>
  )
}
