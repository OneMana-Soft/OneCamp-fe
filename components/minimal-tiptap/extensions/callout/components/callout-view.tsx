"use client"

import * as React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CircleCheck, Info, Lightbulb, MessageSquare, Sparkles } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/helpers/cn'

/**
 * A callout (content.md D11): a camp tint, r10, no border, with a Lucide
 * icon in the tone's ink, never an emoji. The tone is the node's stored
 * colour (older docs carry an emoji too; it is kept, not drawn), so every
 * existing callout keeps its meaning: blue is a note, yellow a warning, red
 * a risk, green done, purple an idea, gray a remark.
 */
interface Tone {
  label: string
  icon: LucideIcon
  className: string
}

const TONES: Record<string, Tone> = {
  blue: { label: 'Note', icon: Info, className: 'bg-camp-sky-tint [--callout-ink:var(--camp-sky-ink)]' },
  yellow: { label: 'Warning', icon: AlertTriangle, className: 'bg-camp-sun-tint [--callout-ink:var(--camp-sun-ink)]' },
  red: { label: 'Risk', icon: AlertTriangle, className: 'bg-camp-berry-tint [--callout-ink:var(--camp-berry-ink)]' },
  green: { label: 'Done', icon: CircleCheck, className: 'bg-camp-moss-tint [--callout-ink:var(--camp-moss-ink)]' },
  purple: { label: 'Idea', icon: Lightbulb, className: 'bg-camp-dusk-tint [--callout-ink:var(--camp-dusk-ink)]' },
  gray: { label: 'Remark', icon: MessageSquare, className: 'bg-sunken [--callout-ink:var(--ink-2)]' },
  agent: { label: 'From AI', icon: Sparkles, className: 'bg-agent-muted [--callout-ink:var(--agent-ink)]' },
}

export const CalloutView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const color: string = node.attrs.color in TONES ? node.attrs.color : 'blue'
  const tone = TONES[color]
  const Icon = tone.icon
  const [open, setOpen] = React.useState(false)

  return (
    <NodeViewWrapper
      className={cn('callout my-3 rounded-[10px] px-4 py-3', tone.className)}
      data-type="callout"
      data-tone={color}
    >
      <div className="flex gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              contentEditable={false}
              disabled={!editor.isEditable}
              aria-label={`${tone.label} callout. Change its kind`}
              className="mt-[3px] inline-flex size-5 shrink-0 select-none items-center justify-center rounded-md text-[var(--callout-ink)] outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/10"
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="content-float w-44 rounded-xl p-1 shadow-e3" contentEditable={false}>
            {Object.entries(TONES).map(([key, t]) => {
              const TIcon = t.icon
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    updateAttributes({ color: key })
                    setOpen(false)
                  }}
                  className={cn(
                    'flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-ui-sm text-ink outline-none hover:bg-hover focus-visible:bg-press',
                    key === color && 'bg-press',
                  )}
                >
                  <span className={cn('inline-flex size-5 items-center justify-center rounded-md text-[var(--callout-ink)]', t.className)}>
                    <TIcon className="size-3.5" aria-hidden="true" />
                  </span>
                  {t.label}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>

        <div className="min-w-0 flex-1 text-ink">
          <NodeViewContent className="callout-content" />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
