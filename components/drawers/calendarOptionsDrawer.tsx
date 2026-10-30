"use client"

import * as React from "react"
import { ArrowDownToLine, ArrowUpDown, CalendarDays, Globe, Link2, ListTodo, Plug, Plus, Share2, Unlink, UserPlus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { calendarListUrl } from "@/lib/calendar/calendarList"
import { OWN_HUE } from "@/components/calendar/calendarTones"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useConfirm } from "@/hooks/useConfirm"
import { Switch } from "@/components/ui/switch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useSWRConfig } from "swr"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { ViewOptionRows } from "@/components/calendar/viewOptions"
import { lazyView } from "@/lib/lazy/lazyView"
import { googleSyncLine, googleSyncNext, useGoogleSync } from "@/lib/calendar/googleSync"
import { teammateCalendar, useCalendarRows } from "@/lib/calendar/otherCalendars"
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GoogleMark } from "@/components/ui/graphics/GoogleMark"
import { useRouter } from "next/navigation"
import { calendarRoute } from "@/lib/calendar/route"

// Import and export (calendar A4) and Share (A6), as the Calendars panel offers them.
const ImportExport = lazyView(() => import("@/components/calendar/importExport/importExportDialog"))
const ShareCalendar = lazyView(() => import("@/components/calendar/sharing/shareCalendarDialog"))
const FeedCalendar = lazyView(() => import("@/components/calendar/sharing/feedDialog"))
// A calendar by its address (B8), as the panel's Other calendars offers it.
const Subscribe = lazyView(() => import("@/components/calendar/sharing/subscribeDialog"))

/** A group's name over its card, as the computer's panel names it (the group already says it to a screen reader). */
function SheetCaption({ children }: { children: React.ReactNode }) {
    return (
        <p aria-hidden="true" className="px-5 pb-1.5 pt-3 text-meta font-medium text-ink-3">
            {children}
        </p>
    )
}

interface CalendarOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

export function CalendarOptionsDrawer({ drawerOpenState, setOpenState }: CalendarOptionsDrawerProps) {
    const post = usePost()
    const dispatch = useDispatch()
    const { mutate: globalMutate } = useSWRConfig()
    const router = useRouter()

    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean; accountEmail?: string } }>(
        GetEndpointUrl.GoogleCalendarStatus,
    )

    const isConnected = gcalStatus?.data?.isConnected ?? false
    const [isToggling, setIsToggling] = React.useState(false)
    const confirm = useConfirm()
    // The dialog open over the drawer, if any: the drawer stays mounted under it.
    const [dialog, setDialog] = React.useState<"move" | "share" | "feed" | "subscribe" | null>(null)
    const moving = dialog !== null
    const rows = useCalendarRows()
    const [adding, setAdding] = React.useState(false)
    const [addError, setAddError] = React.useState("")
    const google = useGoogleSync(() => globalMutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GoogleCalendarEvents)))
    const googleNext = googleSyncNext(google.sync)

    function closeDrawer() {
        setOpenState(false)
    }

    // Disconnecting loses Google's events here, so it asks first, as the computer's does.
    const askDisconnect = () =>
        confirm({
            title: "Disconnect Google Calendar?",
            description: "Its events leave your calendar here. What you moved from Google stays.",
            confirmText: "Disconnect Google Calendar",
            destructive: true,
            onConfirm: () => handleGCalToggle(false),
        })

    // Connects Google through its consent screen (or connects it again once
    // it stopped answering, C9), or disconnects it.
    const handleGCalToggle = async (connect: boolean) => {
        setIsToggling(true)
        try {
            if (!connect) {
                await post.makeRequest({ apiEndpoint: PostEndpointUrl.GoogleCalendarUnlink })
                await mutateGcalStatus()
                globalMutate(
                    (key) =>
                        typeof key === "string" &&
                        key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
                    (current: any) => {
                        if (!current?.data) return current
                        return {
                            ...current,
                            data: current.data.filter(
                                (e: any) => !e.event_uuid?.startsWith("gcal-"),
                            ),
                        }
                    },
                    { revalidate: true },
                )
            } else {
                const res = await post.makeRequest<any, { url: string }>({
                    method: "GET",
                    apiEndpoint: GetEndpointUrl.GoogleCalendarAuthUrl as any,
                })
                if (res && res.url) {
                    window.location.href = res.url
                    return
                }
            }
        } catch (e) {
            console.error("Failed to toggle Google Calendar", e)
        } finally {
            setIsToggling(false)
        }
    }

    // The drawer stays mounted under the dialog (closing it unmounts this),
    // and closes with it.
    const openImportExport = () => {
        void ImportExport.warm()
        setDialog("move")
    }
    const closeDialog = () => {
        setDialog(null)
        closeDrawer()
    }
    // A teammate's calendar laid over yours (A6), as the panel adds one.
    const addTeammate = async (picked: PickedPerson[]) => {
        const p = picked.at(-1)
        if (!p?.uuid) return
        setAddError("")
        try {
            rows.addPerson({ id: await teammateCalendar(p.uuid), name: p.name })
            setAdding(false)
        } catch (err) {
            setAddError(apiErrorMessage(err, "Their calendar couldn't be added."))
        }
    }
    const others = [...rows.calendars, ...rows.mine.filter((c) => c.kind === "subscribed"), ...rows.people.map((p) => ({ id: p.id, name: p.name, kind: "person", access: "view" as const }))]
    // A calendar shown or hidden with its switch, the same choice as the panel's.
    const shownRow = (id: string, name: string, mark: Pick<React.ComponentProps<typeof DrawerItem>, "icon" | "hue" | "leading" | "neutralTile">) => (
        <DrawerItem
            key={id}
            {...mark}
            label={name}
            onClick={() => rows.toggle(id)}
            trailing={<Switch checked={!rows.hidden.includes(id)} onCheckedChange={() => rows.toggle(id)} onClick={(e) => e.stopPropagation()} aria-label={`Show ${name}`} />}
        />
    )

    const handleCreateEvent = () => {
        closeDrawer()
        dispatch(openUI({ key: "createCalendarEvent" }))
    }

    return (
        <>
        {dialog === "move" ? (
            <ImportExport.View
                fallback={null}
                render={(m) => (
                    <m.default
                        onClose={closeDialog}
                        onImported={() => globalMutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GoogleCalendarEvents))}
                        onShow={(day, ids) => {
                            rows.show(ids)
                            router.push(calendarRoute({ date: day }))
                        }}
                    />
                )}
            />
        ) : dialog === "share" ? (
            <ShareCalendar.View fallback={null} render={(m) => <m.default onClose={closeDialog} />} />
        ) : dialog === "feed" ? (
            <FeedCalendar.View fallback={null} render={(m) => <m.default onClose={closeDialog} />} />
        ) : dialog === "subscribe" ? (
            <Subscribe.View
                fallback={null}
                render={(m) => (
                    <m.default
                        onClose={closeDialog}
                        onAdded={(added) => {
                            rows.show([added.calendar_id])
                            void globalMutate(calendarListUrl)
                            closeDialog()
                        }}
                    />
                )}
            />
        ) : null}
        <Drawer detent="menu" onOpenChange={(open) => !open && !moving && closeDrawer()} open={drawerOpenState && !moving}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Calendar options</DrawerTitle>
                    <DrawerDescription>Calendar event and integration controls.</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Calendar">
                    <DrawerItem icon={Plus} label="Create event" onClick={handleCreateEvent} />
                    <DrawerItem icon={ArrowUpDown} label="Import and export" onClick={openImportExport} />
                    <DrawerItem icon={Share2} label="Share my calendar" onClick={() => { void ShareCalendar.warm(); setDialog("share") }} />
                    <DrawerItem icon={Link2} label="Show my calendar in another app" onClick={() => { void FeedCalendar.warm(); setDialog("feed") }} />
                </SheetGroup>
                    {/* Google Calendar as the computer's panel has it (B6): its mark, name and how it
                        stands (in danger ink once Google stopped answering, C9), then the move or
                        connecting it again; Disconnect, which loses something, last and alone. */}
                    <SheetGroup label="Google Calendar" data-drawer-google="">
                        {isConnected ? (
                            <>
                                <div className="flex min-h-14 items-center gap-3 px-3 py-2" data-google-sync={google.sync?.state ?? "none"}>
                                    <span className="flex size-8 shrink-0 items-center justify-center">
                                        <GoogleMark className="size-5 shrink-0" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-body leading-5 text-foreground">Google Calendar</span>
                                        <span className={cn("mt-0.5 line-clamp-2 break-words text-xs", google.sync?.state === "broken" ? "text-danger-ink" : "text-muted-foreground")} role="status" data-google-account="">
                                            {googleSyncLine(gcalStatus?.data?.accountEmail, google.sync) || "Connected"}
                                        </span>
                                    </span>
                                </div>
                                {google.ready && googleNext ? (
                                    <DrawerItem icon={googleNext.reconnect ? Plug : ArrowDownToLine} label={googleNext.label} primary={googleNext.reconnect} disabled={googleNext.reconnect && isToggling}
                                        description={google.error || (google.sync?.state === "failed" ? google.words : undefined)}
                                        onClick={() => void (googleNext.reconnect ? handleGCalToggle(true) : google.start())} />
                                ) : null}
                            </>
                        ) : (
                            <DrawerItem leading={<GoogleMark className="size-5 shrink-0" />} label="Connect Google Calendar" onClick={() => void handleGCalToggle(true)} disabled={isToggling}
                                trailing={<Plus className="size-4 text-muted-foreground" aria-hidden="true" />} />
                        )}
                    </SheetGroup>
                    {/* The same calendars as the computer's panel, under the same names (A6): yours, then others'. */}
                    <SheetCaption>My calendars</SheetCaption>
                    <SheetGroup label="My calendars" data-drawer-calendars="">
                        {shownRow("onecamp", "Personal", { icon: CalendarDays, hue: OWN_HUE })}
                        {rows.mine.filter((c) => c.kind !== "subscribed").map((c) => shownRow(c.id, c.name, { icon: CalendarDays, hue: rows.hueOf(c) }))}
                        {isConnected ? shownRow("google", "Google Calendar", { leading: <GoogleMark className="size-5 shrink-0" /> }) : null}
                        {shownRow("tasks", "Assigned tasks", { icon: ListTodo, neutralTile: true })}
                    </SheetGroup>
                    <SheetCaption>Other calendars</SheetCaption>
                    <SheetGroup label="Other calendars" data-drawer-other-calendars="">
                        {others.map((c) => shownRow(c.id, c.name, { icon: CalendarDays, hue: rows.hueOf(c) }))}
                        {adding ? (
                            <div className="grid gap-1 px-3 py-1">
                                <PeoplePicker value={[]} onChange={(v) => void addTeammate(v)} placeholder="Add a teammate's calendar" showChosen={false} />
                                {addError ? <p role="alert" className="text-meta text-danger-ink">{addError}</p> : <p className="text-meta text-ink-3">You see when they&apos;re busy, and more if they share it.</p>}
                            </div>
                        ) : (
                            <DrawerItem icon={UserPlus} label="Add a teammate's calendar" onClick={() => setAdding(true)} />
                        )}
                        <DrawerItem icon={Globe} label="Subscribe to a calendar" onClick={() => { void Subscribe.warm(); setDialog("subscribe") }} />
                    </SheetGroup>
                    {/* How the views are laid out, the same choices as the computer's View options. */}
                    <SheetCaption>View</SheetCaption>
                    <SheetGroup label="View" data-drawer-view-options="">
                        <ViewOptionRows phone />
                    </SheetGroup>
                    {isConnected ? (
                        <SheetGroup label="Disconnect">
                            <DrawerItem icon={Unlink} label="Disconnect Google Calendar" destructive disabled={isToggling} onClick={askDisconnect} />
                        </SheetGroup>
                    ) : null}
                    {/* The switches apply as they're flipped: nothing to undo, so the footer closes. */}
                    <SheetCancel label="Done" />
                </div>
            </DrawerContent>
        </Drawer>
        </>
    )
}
