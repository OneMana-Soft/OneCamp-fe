"use client"

/**
 * The search page's filters (docs C2-1): each modifier in the text as a chip
 * with its ×, and From, In and Date for the ones not there yet. A chip only
 * writes text (lib/search/query.ts): the field shows exactly what will be
 * searched, a filter typed by hand is a chip too, and the server reads both
 * the same way. People and places are found as the person may see them
 * (/user/searchUserAndChannelList, their projects and teams).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { AtSign, Calendar, Hash, Plus } from "@/lib/icons"
import { Chip } from "@/components/ui/chip"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { useDebounce } from "@/hooks/useDebounce"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { removeSpan, replaceModifiers, setModifier, topModifierList } from "@/lib/search/query"
import { DATE_FIELDS, DATE_PRESETS, hasDate, modifierLabel } from "@/lib/search/queryChips"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ChannelAndUserListInterfaceResp } from "@/types/user"
import type { ProjectInfoInterface } from "@/types/project"
import type { TeamListResponseInterface } from "@/types/team"

export function QueryFilters({ text, onChange, inConversation = false }: {
  text: string
  /** The text with a chip's filter written in, or taken out. */
  onChange: (text: string) => void
  /** Searching one conversation already: In isn't offered. */
  inConversation?: boolean
}) {
  const mods = useMemo(() => topModifierList(text), [text])
  const has = (field: string) => mods.some((m) => m.field.toLowerCase() === field)

  return (
    // Its chips join the row the page draws (display: contents), after the conversation's chip.
    <div data-query-filters="" className="contents">
      {mods.map((m) => {
        const label = modifierLabel(m)
        return (
          <Chip key={`${m.span[0]}-${label}`} onRemove={() => onChange(removeSpan(text, m.span))} removeLabel={`Remove ${label}`}>
            {label}
          </Chip>
        )
      })}
      {!has("from") ? (
        <FilterButton label="From" icon={<AtSign className="size-3.5" />} searched>
          <PeopleAndPlaces placeholder="Search people…" people me onPick={(token) => onChange(setModifier(text, "from", token))} />
        </FilterButton>
      ) : null}
      {!has("in") && !inConversation ? (
        <FilterButton label="In" icon={<Hash className="size-3.5" />} searched>
          <PeopleAndPlaces placeholder="Search channels, people, projects…" people places onPick={(token) => onChange(setModifier(text, "in", token))} />
        </FilterButton>
      ) : null}
      {!hasDate(mods) ? (
        <FilterButton label="Date" icon={<Calendar className="size-3.5" />}>
          <ComboboxList>
            {DATE_PRESETS.map((p) => (
              <ComboboxItem key={p.label} value={p.label} onSelect={() => onChange(replaceModifiers(text, DATE_FIELDS, p.field, p.value))}>
                {p.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </FilterButton>
      ) : null}
    </div>
  )
}

/**
 * A filter not set yet: a quiet chip with a plus, opening its picker (the
 * combobox: a popover, a sheet on a phone). A row chosen closes it.
 */
function FilterButton({ label, icon, searched = false, children }: {
  label: string
  icon: ReactNode
  /** Its rows come from a search of their own: the menu doesn't filter them again. */
  searched?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Combobox open={open} onOpenChange={setOpen}>
      <ComboboxTrigger asChild>
        <button
          type="button"
          data-query-filter={label.toLowerCase()}
          data-touch-target=""
          {...ix("chip")}
          className={cn("chip h-[26px] gap-1 px-2 text-xs text-ink-2 hover:text-foreground", open && "text-foreground")}
        >
          <Plus className="size-3 text-ink-3" aria-hidden />
          {icon}
          {label}
        </button>
      </ComboboxTrigger>
      <ComboboxContent label={label} align="start" command={searched ? { shouldFilter: false } : undefined}>
        {children}
      </ComboboxContent>
    </Combobox>
  )
}

interface Option {
  key: string
  label: string
  hint?: string
  token: string
}

/**
 * People, and with places their channels, DMs, projects and teams, as they
 * may see them, each picked as the token it writes: @handle for a person (a
 * DM with them, in In), #name for a channel, a project's or team's name.
 */
function PeopleAndPlaces({ placeholder, people = false, places = false, me = false, onPick }: {
  placeholder: string
  people?: boolean
  places?: boolean
  /** "Me" first, for From. */
  me?: boolean
  onPick: (token: string) => void
}) {
  const [query, setQuery] = useState("")
  const typed = useDebounce(query.trim(), 200)
  const [found, setFound] = useState<ChannelAndUserListInterfaceResp[]>([])
  const { makeRequest } = usePost()
  const projects = useFetch<{ data?: { user_projects?: ProjectInfoInterface[] } }>(places ? GetEndpointUrl.GetUserProjectList : "", undefined, undefined, OWN_ERRORS)
  const teams = useFetch<TeamListResponseInterface>(places ? GetEndpointUrl.GetUserTeamList : "", undefined, undefined, OWN_ERRORS)

  useEffect(() => {
    if (!typed) {
      setFound([])
      return
    }
    let alive = true
    void makeRequest<{ search_text: string }, ChannelAndUserListInterfaceResp[]>({
      apiEndpoint: PostEndpointUrl.SearchUserAndChannel,
      payload: { search_text: typed },
      showToast: false,
    }).then((res) => {
      if (alive) setFound(res ?? [])
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searched again on the typed words only
  }, [typed])

  const options = useMemo(() => {
    const out: { heading: string; rows: Option[] }[] = []
    const words = typed.toLowerCase()
    if (me && (!words || "me".startsWith(words))) out.push({ heading: "", rows: [{ key: "me", label: "Me", token: "me" }] })
    if (people) {
      const rows = found
        .filter((r) => r.type === "user" && r.user_handle)
        .slice(0, 6)
        .map((r) => ({ key: `u-${r.user_uuid}`, label: r.user_name || `@${r.user_handle}`, hint: `@${r.user_handle}`, token: `@${r.user_handle}` }))
      if (rows.length) out.push({ heading: "People", rows })
    }
    if (places) {
      const channels = found
        .filter((r) => r.type === "channel" && r.channel_name)
        .slice(0, 6)
        .map((r) => ({ key: `c-${r.channel_uuid}`, label: `#${r.channel_name}`, token: `#${r.channel_name}` }))
      if (channels.length) out.push({ heading: "Channels", rows: channels })
      const named = (list: { id: string; name: string }[], kind: string) =>
        list
          .filter((n) => n.name && (!words || n.name.toLowerCase().includes(words)))
          .slice(0, 5)
          .map((n) => ({ key: `${kind}-${n.id}`, label: n.name, token: n.name }))
      const projectRows = named((projects.data?.data?.user_projects ?? []).map((p) => ({ id: p.project_uuid, name: p.project_name })), "p")
      if (projectRows.length) out.push({ heading: "Projects", rows: projectRows })
      const teamRows = named((teams.data?.data ?? []).map((t) => ({ id: t.team_uuid, name: t.team_name })), "t")
      if (teamRows.length) out.push({ heading: "Teams", rows: teamRows })
    }
    return out
  }, [typed, found, me, people, places, projects.data, teams.data])

  return (
    <>
      <ComboboxInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <ComboboxList>
        <ComboboxEmpty>{typed ? "Nobody and nothing by that name." : "Type a name."}</ComboboxEmpty>
        {options.map((g) => (
          <ComboboxGroup key={g.heading || "first"} heading={g.heading || undefined}>
            {g.rows.map((o) => (
              <ComboboxItem key={o.key} value={o.key} onSelect={() => onPick(o.token)}>
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="text-meta text-ink-3">{o.hint}</span> : null}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        ))}
      </ComboboxList>
    </>
  )
}
