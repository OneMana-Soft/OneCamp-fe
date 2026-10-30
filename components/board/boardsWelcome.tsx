"use client"

// The boards list's first visit (content.md B02): an illustrated header, a
// line, the five templates teams start with most as cards, the whole library
// a press away (the picker), and "Blank board". Loaded only for a workspace
// with no boards, so the list's first load doesn't bring the templates.

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Spark } from "@/components/ui/graphics"
import { Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board/templates"
import { TemplatePreview } from "@/components/board/templatePreview"
import { NotesFallback } from "@/components/board/notesFallback"

const TemplatePicker = dynamic(() => import("@/components/board/templatePicker"), { ssr: false })

/**
 * The first visit (B02): an illustrated header, a line, and the five
 * templates as cards; "Blank board" under them.
 */
export default function BoardsWelcome({ onPick, creating }: { onPick: (t?: Pick<BoardTemplate, "id" | "name">) => void; creating: string | null }) {
  const [all, setAll] = React.useState(false)
  return (
    <section aria-labelledby="boards-welcome" className="flex flex-col items-center pt-4 text-center sm:pt-8">
      <WelcomeArt />
      <h2 id="boards-welcome" className="mt-5 text-title-2 text-ink">
        Think it through together
      </h2>
      <p className="mt-1.5 max-w-[440px] text-ui text-ink-2">
        A shared canvas for retros, brainstorms and plans. Start from a template:
      </p>
      <ul
        className="-mx-4 mt-6 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:w-full sm:justify-center sm:overflow-visible sm:px-1 sm:pb-0"
        aria-label="Templates"
      >
        {BOARD_TEMPLATES.map((t, i) => {
          const busy = creating === t.id;
          return (
            <li key={t.id} className="content-rise shrink-0 snap-start" style={{ ["--i" as string]: i }}>
              <button
                type="button"
                onClick={() => onPick(t)}
                disabled={!!creating}
                data-board-template={t.id}
                className={cn(
                  "group/tpl hover-lift relative flex h-[156px] w-[160px] flex-col overflow-hidden rounded-xl bg-raised text-left shadow-e1 outline-none sm:w-[180px]",
                  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
                  creating && !busy && "opacity-60",
                )}
              >
                <TemplatePreview template={t} height={96} />
                {busy ? (
                  <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-lg bg-pop shadow-e1">
                    <Loader2 className="size-3.5 animate-spin text-ink-2" />
                  </span>
                ) : null}
                <span className="flex flex-1 flex-col justify-center px-3">
                  <span className="truncate text-ui-sm font-medium text-ink">{t.name}</span>
                  <span className="line-clamp-2 text-meta text-ink-3">{t.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAll(true)} disabled={!!creating} data-all-templates="">
          See all templates
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onPick()} disabled={!!creating}>
          {creating === "blank" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Blank board
        </Button>
      </div>
      {all && (
        <TemplatePicker
          description="A new board opens with it, as notes and frames you can change."
          onUse={(t) => {
            setAll(false)
            onPick(t)
          }}
          onClose={() => setAll(false)}
        />
      )}
    </section>
  );
}

/** Three tilted stickies on the dot grid, a dashed orbit and one brand spark. */
function WelcomeArt() {
  return (
    <div aria-hidden="true" data-empty-illustration="" className="relative size-[120px]">
      <div className="dot-ground absolute inset-3 rounded-[40px] opacity-90" />
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" fill="none">
        <circle cx="60" cy="60" r="54" stroke="var(--line-3)" strokeWidth="1.5" strokeDasharray="1.5 5" strokeLinecap="round" />
        <circle cx="8" cy="48" r="3.5" fill="var(--camp-sky)" />
        <circle cx="110" cy="80" r="3" fill="var(--camp-moss)" />
      </svg>
      <NotesFallback />
      <Spark size={14} className="content-twinkle absolute right-3 top-2 text-brand" />
    </div>
  );
}

