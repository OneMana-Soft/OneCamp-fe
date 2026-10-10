"use client"

import { displayNameOf, matchesPerson, secondaryNameOf } from "@/lib/personName"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints"
import { UserProfileDataInterface } from "@/types/user"
import axiosInstance from "@/lib/axiosInstance"
import { usePost } from "@/hooks/usePost"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Check, Search } from "@/lib/icons";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { toast } from "@/hooks/use-toast"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface AddAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Page = { data?: UserProfileDataInterface[]; has_more?: boolean }

/** Members are read 100 at a time; the server pages, and sets no cap. */
const PAGE_SIZE = 100
/** Rows drawn at once. More than this, and the search box narrows them. */
const SHOWN = 50

/**
 * Every member, page by page. The picker used to read the first 50 and stop,
 * so in a bigger workspace most people could never be made an admin from here.
 */
export async function loadEveryMember(get: (url: string) => Promise<Page>): Promise<UserProfileDataInterface[]> {
  const out: UserProfileDataInterface[] = []
  // 100 pages of 100 is far past any workspace this runs; the bound only stops
  // a server that always says "more" from looping forever.
  for (let page = 0; page < 100; page++) {
    const res = await get(`${GetEndpointUrl.GetAdminUserList}?pageIndex=${page}&pageSize=${PAGE_SIZE}`)
    out.push(...(res.data ?? []))
    if (!res.has_more) break
  }
  return out
}

/**
 * Who can be made an admin: active members who aren't one already. The member
 * list does not say who is an admin (the users query never selects it), so
 * the admin list is read beside it and matched by id and by address.
 */
export function adminCandidates(members: UserProfileDataInterface[], admins: UserProfileDataInterface[]) {
  const ids = new Set(admins.map((a) => a.user_uuid).filter(Boolean))
  const emails = new Set(admins.map((a) => a.user_email_id?.toLowerCase()).filter(Boolean))
  return members.filter(
    (m) =>
      isZeroEpoch(m.user_deleted_at || "") &&
      !ids.has(m.user_uuid) &&
      !(m.user_email_id && emails.has(m.user_email_id.toLowerCase())),
  )
}

interface UserPickRowProps {
  user: UserProfileDataInterface
  isSelected: boolean
  onSelect: (user: UserProfileDataInterface) => void
}

function UserPickRow({ user, isSelected, onSelect }: UserPickRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = displayNameOf(user)
  const fullName = secondaryNameOf(user)
  const line = fullName ? `${fullName} · ${user.user_email_id ?? ""}` : user.user_email_id

  return (
    <li>
      {/* A button, so the list works from the keyboard: Tab to a person, then
          Enter or Space. It was a div with an onClick, which a keyboard could
          not reach at all. */}
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(user)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
          "hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          isSelected && "bg-highlight",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={imageSrc} alt="" />
            <AvatarFallback className={cn("text-3xs font-semibold", getAvatarFallbackClass(seed))}>
              {getNameInitials(seed)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium leading-5">{seed}</span>
            {line && <span className="truncate text-xs text-muted-foreground">{line}</span>}
          </span>
        </span>
        {isSelected && <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />}
      </button>
    </li>
  )
}

type Loaded =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; candidates: UserProfileDataInterface[] }

export const AddAdminDialog: React.FC<AddAdminDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null)
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" })
  const [refused, setRefused] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const post = usePost()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoaded({ state: "loading" })
    const get = (url: string) => axiosInstance.get(url).then((r) => r.data as Page)
    Promise.all([loadEveryMember(get), get(`${GetEndpointUrl.GetAdminAdminList}?pageIndex=0&pageSize=500`)])
      .then(([members, admins]) => {
        if (!cancelled) setLoaded({ state: "ready", candidates: adminCandidates(members, admins.data ?? []) })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ state: "failed" })
      })
    return () => {
      cancelled = true
    }
  }, [open, attempt])

  const close = useCallback(
    (next: boolean) => {
      if (!next) {
        setSelectedUser(null)
        setSearchTerm("")
        setRefused("")
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const matches = useMemo(
    () =>
      loaded.state === "ready"
        ? loaded.candidates.filter((user) => matchesPerson(user, searchTerm, [user.user_email_id]))
        : [],
    [loaded, searchTerm],
  )

  const handleAddAdmin = async () => {
    if (!selectedUser || submitting) return
    setRefused("")
    setSubmitting(true)
    try {
      // Quiet: a refusal is said here, beside the choice, so neither usePost's
      // toast nor the global one says it a second time.
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.CreateAdmin,
        payload: { user_uuid: selectedUser.user_uuid },
        quiet: true,
      })
    } catch (e) {
      // The dialog stays open, to choose again or try again.
      setRefused(apiErrorMessage(e, "Try again in a moment."))
      return
    } finally {
      setSubmitting(false)
    }
    toast({ title: `${displayNameOf(selectedUser)} is an admin now` })
    onSuccess()
    close(false)
  }

  let body: React.ReactNode
  if (loaded.state === "loading") {
    body = (
      <ul aria-busy="true" aria-label="Loading members" className="space-y-0.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-1.5" aria-hidden="true">
            <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
            <span className="flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-32" : "w-40")} />
              <Skeleton className={cn("h-3", i % 2 === 0 ? "w-52" : "w-44")} />
            </span>
          </li>
        ))}
      </ul>
    )
  } else if (loaded.state === "failed") {
    body = <ErrorState subject="the members" onRetry={() => setAttempt((n) => n + 1)} />
  } else if (loaded.candidates.length === 0) {
    body = <p className="py-8 text-center text-sm text-muted-foreground">Everyone here is an admin already.</p>
  } else if (matches.length === 0) {
    body = (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No member matches &ldquo;{searchTerm.trim()}&rdquo;.
      </p>
    )
  } else {
    body = (
      <>
        <ul className="space-y-0.5">
          {matches.slice(0, SHOWN).map((user) => (
            <UserPickRow
              key={user.user_uuid}
              user={user}
              isSelected={selectedUser?.user_uuid === user.user_uuid}
              onSelect={setSelectedUser}
            />
          ))}
        </ul>
        {matches.length > SHOWN && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            Showing {SHOWN} of {matches.length}. Type a name to narrow it down.
          </p>
        )}
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* The people group's hue, as the admin menu draws Admins; the
                accent is for Make admin. */}
            <Tile hue={ADMIN_GROUP_HUE.people} size="sm">
              <UserPlus />
            </Tile>
            Add an admin
          </DialogTitle>
          <DialogDescription>
            Choose a member. Admins can open Admin and change any of its settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              name="admin-candidate-search"
              aria-label="Search members"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search by name or email…"
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <ScrollArea className="h-[260px] pr-3">{body}</ScrollArea>

          {refused && (
            <p role="alert" className="text-sm text-danger-ink">
              {refused}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAddAdmin} disabled={!selectedUser || submitting}>
            {submitting ? "Making admin…" : "Make admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
