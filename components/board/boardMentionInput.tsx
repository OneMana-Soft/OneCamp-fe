"use client"

// ---------------------------------------------------------------------------
// BoardMentionInput: a Textarea with @mention autocomplete for board comments.
//
// Typing "@" followed by a query opens a member-search dropdown (reusing the
// board user search). Picking a user inserts "@Full Name " into the text and
// tracks that user. On every change the set of still-present mentions is
// reported via onMentionedUsersChange so the parent can notify them when the
// comment is posted. Only dropdown-selected users are tracked, so a stray "@"
// never produces a phantom mention.
// ---------------------------------------------------------------------------

import { displayNameOf, handleOf } from "@/lib/personName"
import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { UserProfileDataInterface } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"

export interface MentionedUser {
  uuid: string
  name: string
}

interface BoardMentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionedUsersChange: (users: MentionedUser[]) => void
  onSubmit?: () => void
  onCancel?: () => void
  /** The box's words; a box that finds people adds "(use @ to mention)" (a board link's guest's says nothing of mentions). */
  placeholder?: string
  className?: string
  autoFocus?: boolean
  /** The field, for a caller that puts the focus back in it (a refused comment keeps its words, miro-32). */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  /**
   * Finds the workspace's people on "@": the caller's search (a member's board page passes it in); without one, as for a
   * board link's guest, the box mentions no one and carries no request code (miro-33).
   */
  findPeople?: (text: string) => Promise<UserProfileDataInterface[] | null | undefined>
}

const displayName = (u: UserProfileDataInterface) => displayNameOf(u) || "user"

export function BoardMentionInput({
  value,
  onChange,
  onMentionedUsersChange,
  onSubmit,
  onCancel,
  placeholder,
  className,
  autoFocus,
  inputRef,
  findPeople,
}: BoardMentionInputProps) {
  const own = React.useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own

  // Users picked from the dropdown (the only mention candidates).
  const [selected, setSelected] = React.useState<MentionedUser[]>([])
  const [results, setResults] = React.useState<UserProfileDataInterface[]>([])
  const [query, setQuery] = React.useState<string | null>(null)
  const [mentionStart, setMentionStart] = React.useState(0)
  const [activeIndex, setActiveIndex] = React.useState(0)

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus, ref])

  // Report the mentions that are still present in the text (so deleting an
  // "@Name" token removes the notification too). Deduplicated by uuid.
  React.useEffect(() => {
    const seen = new Set<string>()
    const present: MentionedUser[] = []
    for (const u of selected) {
      if (seen.has(u.uuid)) continue
      if (value.includes(`@${u.name}`)) {
        seen.add(u.uuid)
        present.push(u)
      }
    }
    onMentionedUsersChange(present)
    // onMentionedUsersChange is expected to be stable from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selected])

  // Debounced member search while a mention query is active.
  React.useEffect(() => {
    if (!findPeople || query === null || query.length < 1) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await findPeople(query)
        setResults(res && Array.isArray(res) ? res.slice(0, 6) : [])
        setActiveIndex(0)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const detectMention = (text: string, caret: number) => {
    const upToCaret = text.slice(0, caret)
    const match = upToCaret.match(/(?:^|\s)@(\w{0,30})$/)
    if (match) {
      setQuery(match[1])
      setMentionStart(caret - match[1].length - 1)
    } else {
      setQuery(null)
      setResults([])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const caret = e.target.selectionStart ?? text.length
    onChange(text)
    detectMention(text, caret)
  }

  const pickUser = (u: UserProfileDataInterface) => {
    const name = displayName(u)
    const queryLen = (query?.length ?? 0) + 1 // include the "@"
    const before = value.slice(0, mentionStart)
    const after = value.slice(mentionStart + queryLen)
    const next = `${before}@${name} ${after}`
    onChange(next)
    setSelected((prev) => [...prev, { uuid: u.user_uuid, name }])
    setQuery(null)
    setResults([])
    // Restore focus and place the caret after the inserted mention.
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const pos = (before + "@" + name + " ").length
      el.setSelectionRange(pos, pos)
    })
  }

  const dropdownOpen = query !== null && results.length > 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (dropdownOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % results.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + results.length) % results.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        pickUser(results[activeIndex])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setQuery(null)
        setResults([])
        return
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && value.trim()) {
      e.preventDefault()
      onSubmit?.()
      return
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        data-escape-own={dropdownOpen ? "" : undefined}
        onKeyDown={handleKeyDown}
        placeholder={placeholder && findPeople ? `${placeholder} (use @ to mention)` : placeholder}
        className={className}
      />
      {dropdownOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-1 max-h-44 w-full overflow-y-auto rounded-lg border bg-popover shadow-e3">
          {results.map((u, i) => (
            <button
              key={u.user_uuid}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pickUser(u)
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs",
                i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarFallback className="text-3xs">
                  {displayName(u).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{displayName(u)}</span>
              {handleOf(u) && (
                <span className="truncate text-2xs text-muted-foreground">@{handleOf(u)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

