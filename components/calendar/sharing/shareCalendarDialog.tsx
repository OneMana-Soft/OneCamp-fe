"use client"

/**
 * Sharing a calendar (calendar A6, SC-25): who sees more than when you're
 * busy, each at a level: the details, changes too, or changes and sharing.
 * Private events stay busy to all of them. Made of the share dialog's parts
 * (components/dialog/shareParts), so it reads as a doc's and a board's do.
 * A chunk of its own, opened from a calendar's row or the phone's drawer.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ShareFooter, ShareHeading, ShareTokenInvite, ShareUserRow, type ShareRole } from "@/components/dialog/shareParts"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { toast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useCalendarList } from "@/lib/calendar/calendarList"
import { displayNameOf } from "@/lib/personName"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ChannelAndUserListInterfaceResp, UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import { listOf } from "@/lib/utils/listOf"

/** The levels a calendar is shared at, as its share menu names them. */
type Level = "details" | "edit" | "manage"

export const SHARE_LEVELS: ShareRole[] = [
  { value: "details", label: "Can see details" },
  { value: "edit", label: "Can edit" },
  { value: "manage", label: "Can edit and share" },
]

/** Someone a calendar is shared with, as GET …/shares sends them. */
interface Share {
  person: UserProfileDataInterface
  level: Level
}

const sharesUrl = (id: string) => `/calendar/calendars/${encodeURIComponent(id)}/shares`

/** Shares a calendar with someone at a level, or ("") stops. */
function putShare(calendar: string, person: string, level: Level | "") {
  return axiosInstance.put(`${sharesUrl(calendar)}/${encodeURIComponent(person)}`, { level }, OWN_ERRORS)
}

export default function ShareCalendarDialog({
  calendar,
  onClose,
}: {
  /** The calendar to share; your own when none is named. */
  calendar?: { id: string; name: string }
  onClose: () => void
}) {
  const [open, setOpen] = React.useState(true)
  const list = useCalendarList()
  const own = list.find((c) => c.kind === "personal")
  const id = calendar?.id || own?.id || ""
  const mine = !calendar || calendar.id === own?.id

  const read = useFetch<{ data?: Share[] }>(id ? sharesUrl(id) : "", undefined, undefined, OWN_ERRORS)
  const [shares, setShares] = React.useState<Share[]>([])
  React.useEffect(() => {
    if (read.data) setShares(listOf<Share>(read.data.data).filter((s) => s.person?.user_uuid))
  }, [read.data])

  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)?.data?.data
  const existing = React.useMemo(() => new Set([self?.user_uuid, ...shares.map((s) => s.person.user_uuid)].filter(Boolean) as string[]), [self, shares])

  const { makeRequest } = usePost()
  const search = React.useCallback(
    async (q: string): Promise<UserProfileDataInterface[]> => {
      const res = await makeRequest<{ search_text: string }, ChannelAndUserListInterfaceResp[]>({
        apiEndpoint: PostEndpointUrl.SearchUserAndChannel,
        payload: { search_text: q },
        quiet: true,
      })
      return listOf<ChannelAndUserListInterfaceResp>(res)
        .filter((r) => r.user_uuid)
        .map((r) => ({ user_uuid: r.user_uuid, user_name: r.user_name, user_profile_object_key: r.user_profile_object_key }))
    },
    [makeRequest],
  )

  const close = () => {
    setOpen(false)
    onClose()
  }

  const place = (person: UserProfileDataInterface, level: Level | "") =>
    setShares((cur) => {
      const rest = cur.filter((s) => s.person.user_uuid !== person.user_uuid)
      if (!level) return rest
      const at = cur.findIndex((s) => s.person.user_uuid === person.user_uuid)
      const next = { person, level }
      return at < 0 ? [...rest, next] : cur.map((s, i) => (i === at ? next : s))
    })

  // Each change shows at once and goes back, saying so, if it fails.
  const change = async (person: UserProfileDataInterface, level: Level | "", was: Level | "") => {
    place(person, level)
    try {
      await putShare(id, person.user_uuid, level)
    } catch (err) {
      place(person, was)
      toast({ title: level ? "Couldn't change what they see" : "Couldn't stop sharing with them", description: apiErrorMessage(err, "Try again."), variant: "destructive" })
    }
  }

  const invite = async (people: UserProfileDataInterface[], role: string) => {
    const level = role as Level
    // One at a time, so a refusal names whom it was for; the invite row says it failed.
    for (const person of people) {
      await putShare(id, person.user_uuid, level)
      place(person, level)
    }
    void read.mutate()
    const who = people.length === 1 ? displayNameOf(people[0]) : `${people.length} people`
    toast({ title: `${who} can see ${mine ? "your calendar" : "it"} now` })
  }

  const name = calendar?.name?.trim()
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[480px]" data-share-dialog="calendar">
        <DialogHeader className="px-5 pb-0 pr-12 pt-5 text-start">
          <DialogTitle className="truncate text-title-3 text-ink">{mine ? "Share your calendar" : `Share “${name || "this calendar"}”`}</DialogTitle>
          <DialogDescription className="text-ui-sm text-ink-2">
            People you add see what&apos;s on it, or change it too. Private events stay busy to them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(70dvh,560px)] flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
          {id ? <ShareTokenInvite search={search} roles={SHARE_LEVELS} defaultRole="details" existing={existing} onInvite={invite} /> : null}

          <section className="flex flex-col gap-1.5" aria-busy={!read.data && !read.isError ? true : undefined}>
            <ShareHeading>People with access</ShareHeading>
            <div className="flex flex-col">
              {mine && self ? <ShareUserRow user={self} role="owner" roles={SHARE_LEVELS} canEdit={false} /> : null}
              {shares.map((s) => (
                <div key={s.person.user_uuid} className="content-row-in">
                  <ShareUserRow
                    user={s.person}
                    role={s.level}
                    roles={SHARE_LEVELS}
                    canEdit
                    onRoleChange={(to) => void change(s.person, to as Level, s.level)}
                    onRemove={() => void change(s.person, "", s.level)}
                  />
                </div>
              ))}
              {read.data && shares.length === 0 ? (
                <p className="py-1 text-meta text-ink-3" data-share-none="">
                  Not shared with anyone yet.
                </p>
              ) : null}
              {read.isError ? (
                <p role="alert" className="py-1 text-meta text-danger-ink">
                  Who it&apos;s shared with couldn&apos;t be read.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={() => void read.mutate()}>
                    Try again
                  </button>
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <ShareFooter onDone={close} link={false} />
      </DialogContent>
    </Dialog>
  )
}
