"use client"

import { ChromeSheet } from "@/components/docEditor/chrome/Sheet"
import { Button } from "@/components/ui/button"
import { HueSwatches } from "@/components/ui/hueSwatches"
import { toast } from "@/hooks/use-toast"
import type { CampHue } from "@/lib/campHue"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { colorDocs } from "@/services/docFilesService"

/**
 * A colour for one item or a selection, where a menu can't hold the swatches
 * (a phone's sheet; docs F1b): None and the six camp hues, 44 px each. A pick
 * colours them all at once and closes; Cancel sits in the footer.
 */
export function ColourSheet({ ids, current, title, onClose }: { ids: string[]; current?: CampHue | null; title?: string; onClose: () => void }) {
  const heading = ids.length > 1 ? `Colour ${ids.length} items` : title?.trim() ? `Colour “${title.trim()}”` : "Colour"
  return (
    <ChromeSheet
      onClose={onClose}
      title={heading}
      description="A colour marks it in every list, for everyone."
      data-colour-sheet=""
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <HueSwatches
        size="lg"
        value={ids.length === 1 ? current ?? null : undefined}
        onPick={(hue) => {
          onClose()
          colorDocs(ids, hue).catch((e) => toast({ variant: "destructive", title: ids.length > 1 ? "Their colour didn't change" : "Its colour didn't change", description: apiErrorMessage(e, "Try again in a moment.") }))
        }}
        className="py-2"
      />
    </ChromeSheet>
  )
}
