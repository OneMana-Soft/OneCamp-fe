"use client"

// PeoplePicker: add workspace members by typing part of a name. Chips for
// who's in, a short list of matches below the input. Used where a form
// gathers people (event guests).

import { displayNameOf } from "@/lib/personName"
import * as React from "react"
import { X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { usePost } from "@/hooks/usePost"
import { useDebounce } from "@/hooks/useDebounce"
import { PostEndpointUrl } from "@/services/endPoints"
import type { ChannelAndUserListInterfaceResp } from "@/types/user"

export interface PickedPerson {
  uuid: string
  name: string
}

export function PeoplePicker({
  value,
  onChange,
  exclude = [],
  placeholder = "Add people by name",
  id,
}: {
  value: PickedPerson[]
  onChange: (people: PickedPerson[]) => void
  /** People never offered, e.g. the person filling in the form. */
  exclude?: string[]
  placeholder?: string
  id?: string
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

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="People added">
          {value.map((p) => (
            <li key={p.uuid} className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs">
              {p.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.uuid !== p.uuid))}
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
          placeholder={placeholder}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (!matches.length) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((a) => (a + 1) % matches.length)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((a) => (a - 1 + matches.length) % matches.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              add(matches[active])
            } else if (e.key === "Escape") {
              // Closes the suggestions, and only them.
              e.preventDefault()
              setMatches([])
            }
          }}
        />
        {matches.length > 0 && (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 grid gap-0.5 rounded-md border bg-popover p-1 shadow-md">
            {matches.map((m, i) => (
              <li key={m.uuid} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(m)}
                  className={`w-full rounded-sm px-2 py-1.5 text-left text-sm ${i === active ? "bg-accent" : "hover:bg-accent"}`}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
