"use client"

import * as React from "react"
import { Link2, Link2Off, Loader2, Plus } from "lucide-react"

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
import { openUI, closeUI } from "@/store/slice/uiSlice"
import { useSWRConfig } from "swr"

interface CalendarOptionsDrawerProps {
    drawerOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

export function CalendarOptionsDrawer({ drawerOpenState, setOpenState }: CalendarOptionsDrawerProps) {
    const post = usePost();
    const dispatch = useDispatch();
    const { mutate: globalMutate } = useSWRConfig();

    const { data: gcalStatus, mutate: mutateGcalStatus } = useFetch<{ data: { isConnected: boolean } }>(
        GetEndpointUrl.GoogleCalendarStatus
    );

    const isConnected = gcalStatus?.data?.isConnected ?? false;
    const [isToggling, setIsToggling] = React.useState(false);

    function closeDrawer() {
        setOpenState(false);
    }

    const handleGCalToggle = async () => {
        setIsToggling(true);
        try {
            if (isConnected) {
                await post.makeRequest({
                    apiEndpoint: PostEndpointUrl.GoogleCalendarUnlink
                });
                await mutateGcalStatus();
                // Revalidate calendar events so the calendar page reflects the change
                globalMutate(
                    (key) => typeof key === 'string' && key.startsWith(GetEndpointUrl.GoogleCalendarEvents),
                    undefined,
                    { revalidate: true }
                );
            } else {
                const res = await post.makeRequest<any, { url: string }>({
                    method: "GET",
                    apiEndpoint: GetEndpointUrl.GoogleCalendarAuthUrl as any
                });
                if (res && res.url) {
                    window.location.href = res.url;
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to toggle Google Calendar", e);
        } finally {
            setIsToggling(false);
        }
    };

    const handleCreateEvent = () => {
        closeDrawer();
        dispatch(openUI({ key: 'createCalendarEvent' }));
    };

    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle></DrawerTitle>
                        <DrawerDescription></DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 pb-6">
                        <div className="flex flex-col items-center justify-start space-y-1">

                            {/* Create Event */}
                            <div
                                className='w-full h-14 flex space-x-4 items-center cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={handleCreateEvent}
                            >
                                <Plus className="h-5 w-5 text-muted-foreground"/>
                                <span className="text-base font-medium">Create Event</span>
                            </div>

                            {/* Google Calendar Toggle */}
                            <div
                                className='w-full h-14 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/50 rounded-xl px-4'
                                onClick={handleGCalToggle}
                            >
                                <div className="flex items-center space-x-4">
                                    {isConnected ? (
                                        <Link2Off className="h-5 w-5 text-muted-foreground"/>
                                    ) : (
                                        <Link2 className="h-5 w-5 text-muted-foreground"/>
                                    )}
                                    <span className="text-base font-medium">Google Calendar</span>
                                </div>
                                {isToggling ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                    <Switch checked={isConnected} onCheckedChange={handleGCalToggle} />
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
