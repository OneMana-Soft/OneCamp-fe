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

import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
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
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

const displayName = (u: UserProfileDataInterface) =>
  (u.user_full_name || u.user_name || "user").trim()

export function BoardMentionInput({
  value,
  onChange,
  onMentionedUsersChange,
  onSubmit,
  onCancel,
  placeholder,
  className,
  autoFocus,
}: BoardMentionInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const search = usePost()

  // Users picked from the dropdown (the only mention candidates).
  const [selected, setSelected] = React.useState<MentionedUser[]>([])
  const [results, setResults] = React.useState<UserProfileDataInterface[]>([])
  const [query, setQuery] = React.useState<string | null>(null)
  const [mentionStart, setMentionStart] = React.useState(0)
  const [activeIndex, setActiveIndex] = React.useState(0)

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

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
    if (query === null || query.length < 1) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await search.makeRequest<{ searchText: string }, UserProfileDataInterface[]>({
          apiEndpoint: PostEndpointUrl.SearchUserForBoard,
          payload: { searchText: query },
        })
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
    if (e.key === "Escape") {
      onCancel?.()
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {dropdownOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-1 max-h-44 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
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
                <AvatarFallback className="text-[9px]">
                  {displayName(u).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{displayName(u)}</span>
              {u.user_name && (
                <span className="truncate text-[10px] text-muted-foreground">@{u.user_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default BoardMentionInput
