"use client"

import * as React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, Bell, BookOpen, Bookmark, Calendar, CircleAlert, CircleCheck, CircleHelp, Clock, Flag, Flame, GraduationCap,
  Heart, Info, KeyRound, Lightbulb, Megaphone, MessageSquare, Pin, Rocket, ShieldAlert, Sparkles, Star, Target, Zap,
} from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils/helpers/cn'
import { moveInGrid } from '@/lib/moveInGrid'

/**
 * A callout (content.md D11): a camp tint, r10, no border, with a Lucide
 * icon in the tone's ink, never an emoji. The tone is the node's stored
 * colour, its kind (older docs carry an emoji too; it is kept, not drawn), so
 * every callout keeps its meaning: blue is a note, yellow a warning, red a
 * risk, green done, purple an idea, gray a remark.
 *
 * B2: hovering a callout one can edit shows its kinds as a bar of discs at
 * its top right (D11: lighter and faster than a list), and its icon opens a
 * picker of kinds and of Lucide icons; the icon chosen is stored by name
 * (data-icon), the kind's own when none is.
 */
interface Tone {
  label: string
  icon: LucideIcon
  className: string
  disc: string
}

const TONES: Record<string, Tone> = {
  blue: { label: 'Note', icon: Info, className: 'bg-camp-sky-tint [--callout-ink:var(--camp-sky-ink)]', disc: 'bg-camp-sky-tint text-camp-sky-ink' },
  yellow: { label: 'Warning', icon: AlertTriangle, className: 'bg-camp-sun-tint [--callout-ink:var(--camp-sun-ink)]', disc: 'bg-camp-sun-tint text-camp-sun-ink' },
  red: { label: 'Risk', icon: AlertTriangle, className: 'bg-camp-berry-tint [--callout-ink:var(--camp-berry-ink)]', disc: 'bg-camp-berry-tint text-camp-berry-ink' },
  green: { label: 'Done', icon: CircleCheck, className: 'bg-camp-moss-tint [--callout-ink:var(--camp-moss-ink)]', disc: 'bg-camp-moss-tint text-camp-moss-ink' },
  purple: { label: 'Idea', icon: Lightbulb, className: 'bg-camp-dusk-tint [--callout-ink:var(--camp-dusk-ink)]', disc: 'bg-camp-dusk-tint text-camp-dusk-ink' },
  gray: { label: 'Remark', icon: MessageSquare, className: 'bg-sunken [--callout-ink:var(--ink-2)]', disc: 'bg-sunken text-ink-2' },
  agent: { label: 'From AI', icon: Sparkles, className: 'bg-agent-muted [--callout-ink:var(--agent-ink)]', disc: 'bg-agent-muted text-agent-ink' },
}

/** The kinds a person picks; "From AI" is an agent's own, kept on what an agent wrote. */
export const PICKED_TONES = ['blue', 'yellow', 'red', 'green', 'purple', 'gray'] as const

/** The icons a callout may wear, by their Lucide names (stored as data-icon). */
export const CALLOUT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  info: { icon: Info, label: 'Information' },
  lightbulb: { icon: Lightbulb, label: 'Light bulb' },
  'triangle-alert': { icon: AlertTriangle, label: 'Warning sign' },
  'circle-alert': { icon: CircleAlert, label: 'Alert' },
  'circle-check': { icon: CircleCheck, label: 'Tick' },
  'circle-help': { icon: CircleHelp, label: 'Question' },
  'message-square': { icon: MessageSquare, label: 'Speech bubble' },
  megaphone: { icon: Megaphone, label: 'Megaphone' },
  flag: { icon: Flag, label: 'Flag' },
  star: { icon: Star, label: 'Star' },
  bookmark: { icon: Bookmark, label: 'Bookmark' },
  pin: { icon: Pin, label: 'Pin' },
  target: { icon: Target, label: 'Target' },
  rocket: { icon: Rocket, label: 'Rocket' },
  zap: { icon: Zap, label: 'Lightning' },
  flame: { icon: Flame, label: 'Flame' },
  bell: { icon: Bell, label: 'Bell' },
  calendar: { icon: Calendar, label: 'Calendar' },
  clock: { icon: Clock, label: 'Clock' },
  'book-open': { icon: BookOpen, label: 'Book' },
  'graduation-cap': { icon: GraduationCap, label: 'Graduation cap' },
  'key-round': { icon: KeyRound, label: 'Key' },
  'shield-alert': { icon: ShieldAlert, label: 'Shield' },
  heart: { icon: Heart, label: 'Heart' },
}

const cell =
  'inline-flex items-center justify-center rounded-md outline-none transition-colors duration-[140ms] ease-[var(--ease-out)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand'

export const CalloutView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const color: string = node.attrs.color in TONES ? node.attrs.color : 'blue'
  const tone = TONES[color]
  const chosen = typeof node.attrs.icon === 'string' ? CALLOUT_ICONS[node.attrs.icon] : undefined
  const Icon = chosen?.icon ?? tone.icon
  const [open, setOpen] = React.useState(false)
  const editable = editor.isEditable

  return (
    <NodeViewWrapper
      className={cn('callout group/callout relative my-3 rounded-[10px] px-4 py-3', tone.className)}
      data-type="callout"
      data-tone={color}
    >
      <div className="flex gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              contentEditable={false}
              disabled={!editable}
              data-callout-icon=""
              aria-label={`${tone.label} callout. Change its kind or icon`}
              className="mt-[3px] inline-flex size-5 shrink-0 select-none items-center justify-center rounded-md text-[var(--callout-ink)] outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/10"
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="content-float w-[264px] rounded-xl p-2 shadow-e3" contentEditable={false}>
            <div role="group" aria-label="Kind" className="grid grid-cols-3 gap-1" onKeyDown={(e) => moveInGrid(e, 3)}>
              {(color === 'agent' ? [...PICKED_TONES, 'agent' as const] : PICKED_TONES).map((key) => {
                const t = TONES[key]
                const TIcon = t.icon
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={key === color}
                    onClick={() => updateAttributes({ color: key })}
                    className={cn(cell, 'h-8 justify-start gap-2 px-1.5 text-ui-sm text-ink', key === color && 'bg-press')}
                  >
                    <span className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-md', t.disc)}>
                      <TIcon className="size-3.5" aria-hidden="true" />
                    </span>
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div aria-hidden="true" className="mt-2 px-1 pb-1 text-meta font-[510] text-ink-3">
              Icon
            </div>
            <div role="group" aria-label="Icon" className="grid grid-cols-8 gap-0.5" onKeyDown={(e) => moveInGrid(e, 8)}>
              {Object.entries(CALLOUT_ICONS).map(([name, { icon: I, label }]) => (
                <button
                  key={name}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={node.attrs.icon === name}
                  onClick={() => {
                    updateAttributes({ icon: node.attrs.icon === name ? null : name })
                    setOpen(false)
                  }}
                  className={cn(cell, 'size-7 text-ink-2 hover:text-ink', node.attrs.icon === name && 'bg-press text-ink')}
                >
                  <I className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
            {chosen && (
              <button
                type="button"
                onClick={() => {
                  updateAttributes({ icon: null })
                  setOpen(false)
                }}
                className={cn(cell, 'mt-1 h-8 w-full justify-start px-1.5 text-ui-sm text-ink-2 hover:text-ink')}
              >
                {`Use the ${tone.label.toLowerCase()} icon`}
              </button>
            )}
          </PopoverContent>
        </Popover>

        <div className="min-w-0 flex-1 text-ink">
          <NodeViewContent className="callout-content" />
        </div>
      </div>

      {/* D11: the kinds as discs on hover, for a pointer; the icon's picker
          has them too, for the keyboard and a touch screen. */}
      {editable && (
        <div
          contentEditable={false}
          role="group"
          aria-label="Kind"
          data-callout-tones=""
          className="pointer-events-none absolute -top-3 right-2 flex gap-0.5 rounded-[10px] bg-pop p-1 opacity-0 shadow-e3 transition-opacity duration-[140ms] ease-[var(--ease-out)] [@media(hover:hover)]:group-hover/callout:pointer-events-auto [@media(hover:hover)]:group-hover/callout:opacity-100"
        >
          {PICKED_TONES.map((key) => {
            const t = TONES[key]
            return (
              <button
                key={key}
                type="button"
                tabIndex={-1}
                aria-label={t.label}
                title={t.label}
                aria-pressed={key === color}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ color: key })}
                className={cn(cell, 'size-6')}
              >
                <span className={cn('size-3.5 rounded-full border-[1.5px] border-current', t.disc, key === color && 'ring-2 ring-[var(--ink-2)] ring-offset-1 ring-offset-[var(--pop)]')} />
              </button>
            )
          })}
        </div>
      )}
    </NodeViewWrapper>
  )
}
