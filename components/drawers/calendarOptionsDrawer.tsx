"use client"

import * as React from "react"
import { Link2, Loader2, Plus } from "@/lib/icons"
import { Link2Off } from "lucide-react"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { Switch } from "@/components/ui/switch"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useSWRConfig } from "swr"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface CalendarOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

export function CalendarOptionsDrawer({ drawerOpenState, setOpenState }: CalendarOptionsDrawerProps) {
    const post = usePost()
    const dispatch = useDispatch()
    const { mutate: globalMutate } = useSWRConfig()

    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean } }>(
        GetEndpointUrl.GoogleCalendarStatus,
    )

    const isConnected = gcalStatus?.data?.isConnected ?? false
    const [isToggling, setIsToggling] = React.useState(false)

    function closeDrawer() {
        setOpenState(false)
    }

    const handleGCalToggle = async () => {
        setIsToggling(true)
        try {
            if (isConnected) {
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

    const handleCreateEvent = () => {
        closeDrawer()
        dispatch(openUI({ key: "createCalendarEvent" }))
    }

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Calendar options</DrawerTitle>
                    <DrawerDescription>Calendar event and integration controls.</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    <DrawerItem icon={Plus} label="Create event" onClick={handleCreateEvent} />
                    <DrawerItem
                        icon={isConnected ? Link2Off : Link2}
                        label="Google Calendar"
                        onClick={handleGCalToggle}
                        trailing={
                            isToggling ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <Switch
                                    checked={isConnected}
                                    onCheckedChange={handleGCalToggle}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Toggle Google Calendar"
                                />
                            )
                        }
                    />
                </div>
            </DrawerContent>
        </Drawer>
    )
}
