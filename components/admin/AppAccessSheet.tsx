"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { OverlayBody, OverlayFooter } from "@/components/ui/overlay"
import { StateWord } from "@/components/admin/connectParts"
import AppIcon from "@/components/admin/AppIcon"
import { AppPlacePicker } from "@/components/admin/AppPlacePicker"
import { AppTokens } from "@/components/admin/AppTokens"
import { ScopeChecklist } from "@/components/tokens/tokenParts"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { busyWith } from "@/lib/ui/busyWith"
import { FileText, Plus, Table, X } from "@/lib/icons"
import { GetEndpointUrl } from "@/services/endPoints"
import { AdminGet } from "@/services/endpoints/admin"
import { scopeLabel } from "@/services/apiTokenService"
import type { DataTable } from "@/services/tableService"
import {
  appAccessRoutes,
  changeAppAccess,
  placeNoun,
  placeReach,
  placeTitle,
  readAppAccess,
  sameScopes,
  withPlace,
  withoutPlace,
  type AccessEdit,
  type AppAccess,
  type AppAudience,
  type AppIdentity,
  type AppPlace,
} from "@/components/admin/appAccess"

/**
 * An installed app's access, in Admin › Apps (platform P-API, §3.1): the user
 * it acts as, what it may do (its scopes), where it may reach (its places)
 * and its tokens, which are made, rotated and revoked here. Opened from the
 * app's row. Everything it changes is in the audit log.
 */
export default function AppAccessSheet({ appId, appName, onClose }: { appId: string; appName: string; onClose: () => void }) {
  const { data, isLoading, isError, mutate } = useFetch<unknown>(appAccessRoutes.identity(appId), undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const access = readAppAccess(data)
  const writer = useAccessWriter(appId, () => void mutate())
  const draft = useScopeDraft(access?.identity, writer)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-app-access="" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{appName}</SheetTitle>
          <SheetDescription>What it may do, where it may reach, and its tokens. Every change here is in the audit log.</SheetDescription>
        </SheetHeader>
        <OverlayBody className="flex-1">
        {access ? (
          <AccessBody appId={appId} access={access} draft={draft} writer={writer} onChanged={() => void mutate()} />
        ) : isError ? (
          <ErrorState compact className="mt-6" subject="the app's access" detail={apiErrorMessage(isError) || undefined} onRetry={() => void mutate()} />
        ) : (
          <AccessSkeleton loading={isLoading} />
        )}
        </OverlayBody>
        {draft.changed && (
          <OverlayFooter className="flex justify-end gap-2 pt-3" data-scopes-save="">
            <Button type="button" variant="ghost" onClick={draft.undo}>
              Undo changes
            </Button>
            <Button type="button" {...busyWith(writer.busy, "scopes")} onClick={() => void draft.save()}>
              Save scopes
            </Button>
          </OverlayFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** The sheet while it loads, in its sections' shape. */
function AccessSkeleton({ loading }: { loading: boolean }) {
  return (
    <div role="status" aria-label={loading ? "Loading the app's access" : undefined} className="space-y-8 py-4" aria-hidden={!loading || undefined}>
      <Skeleton className="h-14 w-full rounded-lg" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function AccessBody({ appId, access, draft, writer, onChanged }: { appId: string; access: AppAccess; draft: ScopeDraft; writer: AccessWriter; onChanged: () => void }) {
  const { identity, tokens } = access
  return (
    <div className="space-y-8 py-4">
      <ItsUser identity={identity} />
      <ScopesSection appId={appId} draft={draft} />
      <PlacesSection identity={identity} writer={writer} />
      <AppTokens appId={appId} identity={identity} tokens={tokens} onChanged={onChanged} />
    </div>
  )
}

/** Who the app acts as: its own user, made with its first token, never an admin. */
function ItsUser({ identity }: { identity: AppIdentity }) {
  return (
    <div data-app-user="" className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
      <AppIcon src={identity.icon_url} alt="" size="sm" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{identity.name} acts as its own user</p>
        <p className="text-xs text-muted-foreground text-pretty">
          {identity.bot_user_id ? "Its tokens act as that user, never with an admin's powers." : "Made with its first token. Its tokens act as that user, never with an admin's powers."}
          {!identity.enabled && " It's turned off, so its tokens don't work until it's on again."}
        </p>
      </div>
    </div>
  )
}

/**
 * The sheet's one way to change the app's access: one change at a time, each
 * built on the app as the server holds it now (changeAppAccess). Every
 * control that changes the access waits while `busy` names a change: two
 * places taken away at once each sent the list without the other, and the
 * second put the first back.
 */
interface AccessWriter {
  /** The change under way ("scopes", "add", or a place's kind:id), or null. */
  busy: string | null
  /** Makes a change; false, sending nothing, while another is under way. */
  write: (what: string, edit: AccessEdit) => Promise<boolean>
}

function useAccessWriter(appId: string, onWritten: () => void): AccessWriter {
  const [busy, setBusy] = useState<string | null>(null)
  // Two picks in one frame both read `busy` as null, and the second's list
  // could drop the first's place: the writer itself refuses.
  const writing = useRef(false)
  const write = async (what: string, edit: AccessEdit) => {
    if (writing.current) return false
    writing.current = true
    setBusy(what)
    try {
      await changeAppAccess(appId, edit)
      onWritten()
      return true
    } finally {
      writing.current = false
      setBusy(null)
    }
  }
  return { busy, write }
}

/** The scopes being chosen, and saving them: held by the sheet, so Save sits in its footer. */
interface ScopeDraft {
  chosen: Set<string>
  changed: boolean
  saving: boolean
  problem: string
  toggle: (scope: string, on: boolean) => void
  undo: () => void
  save: () => Promise<void>
}

function useScopeDraft(identity: AppIdentity | undefined, writer: AccessWriter): ScopeDraft {
  const { toast } = useToast()
  const saved = identity?.scopes ?? []
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(saved))
  const [problem, setProblem] = useState("")
  const savedKey = saved.join(" ")
  // A fresh read of the app (after a save, say) is what the boxes show.
  useEffect(() => setChosen(new Set(savedKey ? savedKey.split(" ") : [])), [savedKey])
  const changed = Boolean(identity) && !sameScopes([...chosen], saved)

  const toggle = (scope: string, on: boolean) => {
    setProblem("")
    setChosen((prev) => {
      const next = new Set(prev)
      if (on) next.add(scope)
      else next.delete(scope)
      return next
    })
  }

  const save = async () => {
    if (!identity) return
    setProblem("")
    const taken = saved.filter((s) => !chosen.has(s))
    try {
      if (!(await writer.write("scopes", (now) => ({ scopes: [...chosen].sort(), audience: now.audience })))) return
      toast({
        title: "Scopes saved",
        description: taken.length ? `Its tokens lost ${taken.map(scopeLabel).join(", ").toLowerCase()} just now.` : undefined,
        tone: "success",
      })
    } catch (e) {
      setProblem(`Couldn't save the scopes. ${apiErrorMessage(e, "Try again in a moment.")}`)
    }
  }

  return { chosen, changed, saving: writer.busy === "scopes", problem, toggle, undo: () => setChosen(new Set(saved)), save }
}

function ScopesSection({ appId, draft }: { appId: string; draft: ScopeDraft }) {
  const labelId = useId()
  const { data, isError, mutate } = useFetch<{ data: string[] }>(AdminGet.GetApiTokenScopes)
  const available = data?.data ?? []
  const { chosen, toggle, problem } = draft

  return (
    <SettingsSection level={3} title={<span id={labelId}>What it may do</span>} description="Its tokens may carry these scopes and no others. Taking one away takes it from its tokens at once.">
      {isError ? (
        <ErrorState compact subject="the scopes" onRetry={() => void mutate()} />
      ) : available.length === 0 ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <ScopeChecklist available={available} selected={chosen} onToggle={toggle} labelledBy={labelId} idPrefix={`app-scope-${appId}`} />
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-danger-ink text-pretty">
          {problem}
        </p>
      )}
    </SettingsSection>
  )
}

const KIND_ICON: Record<string, typeof FileText> = { doc: FileText, table: Table }

function PlacesSection({ identity, writer }: { identity: AppIdentity; writer: AccessWriter }) {
  const { toast } = useToast()
  const places = identity.audience.places
  const [adding, setAdding] = useState(false)
  const busy = writer.busy
  // Tables have no title reader yet: the admin's own list of tables names them.
  const wantsTables = places.some((p) => p.kind === "table" && !p.title)
  const { data: tablesData } = useFetch<{ data: DataTable[] }>(wantsTables || adding ? GetEndpointUrl.GetTables : "")
  const tables = useMemo(() => tablesData?.data ?? [], [tablesData])
  const tableNames = useMemo(() => new Map(tables.map((t) => [t.id, t.name])), [tables])

  // The place list changes on the app as it is now; its scopes go back as the server holds them, not as drafted.
  const change = async (what: string, next: (audience: AppAudience) => AppAudience, said: { title: string; description: string }) => {
    try {
      if (!(await writer.write(what, (now) => ({ scopes: now.scopes, audience: next(now.audience) })))) return false
      toast({ ...said, tone: "success" })
      return true
    } catch (e) {
      toast({ title: "Couldn't change where it may reach", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
      return false
    }
  }

  const remove = (p: AppPlace) =>
    void change(`${p.kind}:${p.id}`, (audience) => withoutPlace(audience, p), {
      title: `Removed ${placeTitle(p, tableNames)}`,
      description: `${identity.name} can't open it by its address now.`,
    })

  const add = async (p: AppPlace) => {
    const ok = await change("add", (audience) => withPlace(audience, p), {
      title: `Added ${p.title ?? placeNoun(p.kind)}`,
      description: `${identity.name} can open it where its user may.`,
    })
    if (ok) setAdding(false)
  }

  return (
    <SettingsSection
      level={3}
      title="Where it may reach"
      description="Its tokens open a doc or a table by its address only when it's listed here and the app's user may open it too."
      action={
        <Button type="button" size="sm" variant="secondary" className={sectionActionClass} disabled={busy !== null} onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add a doc or table
        </Button>
      }
    >
      {places.length === 0 ? (
        <p data-places-empty="" className="rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground text-pretty">
          Nowhere yet: its tokens can&apos;t open any doc or table by its address.
        </p>
      ) : (
        <ul aria-label={`Where ${identity.name} may reach`} className="set-card">
          {places.map((p) => {
            const Icon = KIND_ICON[p.kind] ?? FileText
            const title = placeTitle(p, tableNames)
            const reach = placeReach(p)
            const key = `${p.kind}:${p.id}`
            return (
              <li key={key} data-place-row={p.kind} className="you-token-row">
                <span aria-hidden="true" className="you-key-tile">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", !p.title && !tableNames.get(p.id) && "text-muted-foreground")}>{title}</p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="capitalize">{placeNoun(p.kind)}</span>
                    {reach && <StateWord tone={reach.tone}>{reach.word}</StateWord>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 md:size-8"
                  {...busyWith(busy, key)}
                  aria-label={`Remove ${title} from where ${identity.name} may reach`}
                  onClick={() => remove(p)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {adding && (
        <AppPlacePicker
          appName={identity.name}
          tables={tables}
          isAdded={(kind, id) => places.some((p) => p.kind === kind && p.id.toLowerCase() === id.toLowerCase())}
          saving={busy !== null}
          onPick={(p) => void add(p)}
          onClose={() => setAdding(false)}
        />
      )}
    </SettingsSection>
  )
}

