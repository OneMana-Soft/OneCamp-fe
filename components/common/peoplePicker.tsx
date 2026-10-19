"use client"

// PeoplePicker: add workspace members by typing part of a name, and with
// allowEmail anyone by their address. Chips for who's in, a short list of
// matches below the input. Used where a form gathers people (event guests).

import { displayNameOf } from "@/lib/personName"
import * as React from "react"
import { Mail, X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { usePost } from "@/hooks/usePost"
import { useDebounce } from "@/hooks/useDebounce"
import { PostEndpointUrl } from "@/services/endPoints"
import { isEmailAddress } from "@/lib/auth/inviteChips"
import type { ChannelAndUserListInterfaceResp } from "@/types/user"

/** Someone picked: a member by uuid, or (uuid "") someone invited by their address. */
export interface PickedPerson {
  uuid: string
  name: string
  /** Someone invited by email: their address, lowercased. */
  email?: string
}

/** A picked person's key: their uuid, or the address they were invited by. */
export const pickedKey = (p: PickedPerson) => p.uuid || `mailto:${p.email ?? ""}`

/** The members picked, by uuid. */
export const pickedMembers = (people: PickedPerson[]) => people.filter((p) => p.uuid).map((p) => p.uuid)

/** Those picked by their address, as the calendar's API takes them. */
export const pickedEmails = (people: PickedPerson[]) =>
  people.filter((p) => !p.uuid && p.email).map((p) => ({ email: p.email!, ...(p.name && p.name !== p.email ? { name: p.name } : {}) }))

export function PeoplePicker({
  value,
  onChange,
  exclude = [],
  placeholder,
  id,
  allowEmail = false,
  showChosen = true,
}: {
  value: PickedPerson[]
  onChange: (people: PickedPerson[]) => void
  /** People never offered, e.g. the person filling in the form. */
  exclude?: string[]
  placeholder?: string
  id?: string
  /** Anyone can be added by their address, as well as members by name. */
  allowEmail?: boolean
  /** Its own chips for the people added; false where the host lists them (the Event Form's guests). */
  showChosen?: boolean
}) {
  const [query, setQuery] = React.useState("")
  const [matches, setMatches] = React.useState<PickedPerson[]>([])
  const [active, setActive] = React.useState(0)
  const debounced = useDebounce(query.trim(), 200)
  const { makeRequest } = usePost()
  const listId = React.useId()

  React.useEffect(() => {
    if (!debounced) {
      setMatches([])
      return
    }
    let alive = true
    makeRequest<{ search_text: string }, ChannelAndUserListInterfaceResp[]>({
      apiEndpoint: PostEndpointUrl.SearchUserAndChannel,
      payload: { search_text: debounced },
    }).then((res) => {
      if (!alive) return
      const taken = new Set([...exclude, ...value.map((p) => p.uuid)])
      setMatches(
        (res ?? [])
          .filter((r) => r.user_uuid && !taken.has(r.user_uuid))
          .slice(0, 6)
          .map((r) => ({ uuid: r.user_uuid, name: displayNameOf(r) })),
      )
      setActive(0)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search on the query only
  }, [debounced])

  const add = (p: PickedPerson) => {
    onChange([...value, p])
    setQuery("")
    setMatches([])
  }

  // An address typed is someone to invite by email, once.
  const typed = query.trim().toLowerCase()
  const byEmail: PickedPerson | null =
    allowEmail && isEmailAddress(typed) && !value.some((p) => p.email === typed) ? { uuid: "", name: typed, email: typed } : null
  const options = byEmail ? [...matches, byEmail] : matches

  return (
    <div className="grid gap-2">
      {showChosen && value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="People added">
          {value.map((p) => (
            <li key={pickedKey(p)} className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs" data-picked-email={p.uuid ? undefined : ""}>
              {p.uuid ? null : <Mail className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
              {p.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => pickedKey(x) !== pickedKey(p)))}
                aria-label={`Remove ${p.name}`}
                className="rounded-full p-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? (allowEmail ? "Add people by name or email" : "Add people by name")}
          role="combobox"
          aria-expanded={options.length > 0}
          // Esc closes the names offered, and a dialog or popover round the
          // picker stays (lib/keys/escapeOwn); with none offered, it closes that.
          data-escape-own={options.length > 0 ? "" : undefined}
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (!options.length) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((a) => (a + 1) % options.length)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((a) => (a - 1 + options.length) % options.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              add(options[Math.min(active, options.length - 1)])
            } else if (e.key === "Escape") {
              // Closes the suggestions, and only them.
              e.preventDefault()
              setMatches([])
            }
          }}
        />
        {options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 grid gap-0.5 rounded-md border bg-popover p-1 shadow-e3">
            {options.map((m, i) => (
              <li key={pickedKey(m)} role="option" aria-selected={i === Math.min(active, options.length - 1)}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(m)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${i === Math.min(active, options.length - 1) ? "bg-accent" : "hover:bg-accent"}`}
                >
                  {m.uuid ? (
                    m.name
                  ) : (
                    <>
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">Invite {m.email} by email</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
