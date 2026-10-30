"use client"

// Choosing a doc template (docs programme B5): OneCamp's ten and the team's
// own, found by name or by kind, each shown as its page will start, and used
// in one press. Two uses, one picker:
//
//   create  a new doc from it ("New doc → From a template…"): the server
//           writes its body as it makes the doc, so it opens whole, once (N37);
//   apply   into the empty doc on screen (its empty starter's "More
//           templates"): the server writes it into the live copy, which
//           refuses a doc that holds anything, so a second tab can't double it.
//
// ↑ and ↓ move through the list, Enter uses the one chosen, and typing finds
// one by name. On a phone it is a sheet of rows, and a tap uses the template.

import * as React from "react"

import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { Tile } from "@/components/ui/graphics"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { BUILTIN_DOC_TEMPLATES, templateGlyph, templateHue } from "@/lib/docTemplates"
import { Loader2 } from "@/lib/icons"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { applyTemplate, docTemplatePayload, docTemplatesKey } from "@/services/docHomeService"
import type { MarketplaceTemplate } from "@/services/marketplaceService"
import type { DocSpace } from "@/types/docGraph"

/** What choosing a template does. */
export type PickerMode = { kind: "create"; parentId?: string; space?: DocSpace } | { kind: "apply"; docId: string; onApplied?: () => void }

/** One template as the picker shows it. */
export interface PickerTemplate {
  id: string
  name: string
  description: string
  title: string
  category: string
  hue: string | undefined
  glyph: string | undefined
  preview?: string
  builtin: boolean
  author?: string
}

/** The gallery's answer as the picker's rows; OneCamp's own when there's no answer yet. Pure. */
export function pickerTemplates(list: MarketplaceTemplate[] | undefined): PickerTemplate[] {
  if (!list) {
    return BUILTIN_DOC_TEMPLATES.map((b) => ({ id: b.id, name: b.name, description: b.description, title: b.name, category: b.category, hue: b.hue, glyph: b.glyph, builtin: true }))
  }
  return list
    .filter((t) => t.kind === "doc")
    .map((t) => {
      const p = docTemplatePayload(t)
      return {
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        title: p.title,
        category: p.builtin ? p.category || "OneCamp" : "Your team's",
        hue: p.hue,
        glyph: p.glyph,
        preview: p.preview,
        builtin: p.builtin,
        author: p.builtin ? undefined : t.author_name,
      }
    })
}

function TemplateTile({ t, size = "sm" }: { t: PickerTemplate; size?: "sm" | "md" }) {
  const Glyph = templateGlyph(t.glyph)
  return (
    <Tile hue={templateHue(t.hue)} size={size}>
      <Glyph />
    </Tile>
  )
}

/** A template's opening as its page will start: the server's preview, cleaned again here. */
function Preview({ t }: { t: PickerTemplate }) {
  return (
    <div className="relative h-full overflow-hidden rounded-lg bg-sunken px-5 pt-5" data-template-preview={t.id}>
      <div className="h-full overflow-hidden rounded-t-md bg-sheet px-6 pt-6 shadow-e1">
        <p className="mb-3 text-title-3 text-ink">{t.title}</p>
        {t.preview ? (
          <SafeHtml
            as="div"
            html={t.preview}
            sanitizer={sanitizeRichHtml}
            className={cn(
              "pointer-events-none select-none text-ui-sm leading-5 text-ink-2",
              "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-ui [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-ink",
              "[&_p]:mb-1 [&_strong]:font-semibold [&_strong]:text-ink [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3",
              "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1 [&_li[data-type=taskItem]]:before:mr-2 [&_li[data-type=taskItem]]:before:inline-block [&_li[data-type=taskItem]]:before:size-3 [&_li[data-type=taskItem]]:before:rounded-[3px] [&_li[data-type=taskItem]]:before:align-[-1px] [&_li[data-type=taskItem]]:before:shadow-[inset_0_0_0_1.5px_var(--line-3)] [&_li[data-type=taskItem]]:before:content-[''] [&_li[data-type=taskItem]>p]:inline",
            )}
          />
        ) : (
          <p className="text-ui-sm text-ink-3">{t.description}</p>
        )}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-sunken" />
    </div>
  )
}

export default function TemplatePicker({ mode, onClose }: { mode: PickerMode; onClose: () => void }) {
  const { data, isError, mutate } = useFetch<{ data: MarketplaceTemplate[] }>(docTemplatesKey, undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const all = React.useMemo(() => pickerTemplates(data?.data), [data])
  const { create } = useCreateDoc()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState("")

  const choose = async (t: PickerTemplate) => {
    if (busy) return
    setBusy(t.id)
    setError("")
    try {
      if (mode.kind === "create") {
        const id = await create({ templateId: t.id, title: t.title, parentId: mode.parentId, space: mode.space, busyKey: t.id })
        if (id) onClose()
      } else {
        await applyTemplate(mode.docId, t.id)
        mode.onApplied?.()
        onClose()
      }
    } catch (err) {
      // Said here, by the list, where the person is looking.
      setError(apiErrorMessage(err, "The template couldn't be added just now. Try again in a moment."))
    } finally {
      setBusy(null)
    }
  }

  const failure = (isError || error) && (
    <p role="alert" className="px-1 text-ui-sm text-danger-ink">
      {error || (
        <>
          Your team&apos;s templates couldn&apos;t be loaded.{" "}
          <button type="button" onClick={() => void mutate()} className="font-medium underline-offset-2 hover:underline">
            Try again
          </button>
        </>
      )}
    </p>
  )

  return (
    <TemplateGallery
      items={all}
      title={mode.kind === "create" ? "Start from a template" : "Use a template"}
      description={mode.kind === "create" ? "The doc opens with the template in it, ready to fill in." : "It goes into this doc, which is empty."}
      tile={(t, o) =>
        o.busy ? (
          <Tile hue={templateHue(t.hue)} size={o.size}>
            <Loader2 className="animate-spin" />
          </Tile>
        ) : (
          <TemplateTile t={t} size={o.size} />
        )
      }
      preview={(t) => <Preview t={t} />}
      subtitle={(t) => (t.author ? `By ${t.author}` : t.description)}
      busy={busy}
      failure={failure}
      onChoose={(t) => void choose(t)}
      onClose={onClose}
    />
  )
}
