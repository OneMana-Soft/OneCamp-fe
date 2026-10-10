"use client"

import { displayNameOf } from "@/lib/personName"
import {UserAvatarNav} from "@/components/navigationBar/userAvatarNav";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {useTheme} from "next-themes";
import {Button} from "@/components/ui/button";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {useLogout} from "@/hooks/useLogout";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {BellOff, CircleUser, LogOut, Settings, SmilePlus} from "@/lib/icons";
import {usePauseNotifications} from "@/hooks/usePauseNotifications";
import {PauseNotificationsDialog, pauseMenuLabel} from "@/components/notifications/PauseNotificationsDialog";

export default function DesktopNavigationUserProfile() {

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch();
    const router = useRouter();
    const { logout } = useLogout();
    const { theme, setTheme } = useTheme();
    const { pausedUntil, focusUntil } = usePauseNotifications();
    const [pauseOpen, setPauseOpen] = useState(false);


    return (
        <>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Profile and settings">
                    <UserAvatarNav
                        userName={displayNameOf(selfProfile.data?.data)}
                        userProfileObjKey={selfProfile.data?.data.user_profile_object_key}
                        toolTipString={"Profile and settings"}
                        userUUID={selfProfile.data?.data.user_uuid}
                    />
                    {(pausedUntil || focusUntil) && (
                        <span
                            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-muted-foreground"
                            title={pauseMenuLabel(pausedUntil, focusUntil)}
                        >
                            <BellOff className="h-2.5 w-2.5" aria-hidden />
                            <span className="sr-only">{pauseMenuLabel(pausedUntil, focusUntil)}</span>
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayNameOf(selfProfile.data?.data)}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {selfProfile.data?.data.user_email_id}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Every item has its icon in the one 16px slot, so every label,
                    the Appearance choices' included, starts on one line. Only
                    Pause had one (with a margin on top of the item's gap), so the
                    labels began at three different places. */}
                <DropdownMenuGroup>
                    <DropdownMenuItem
                        onClick={()=>{dispatch(openUI({ key: 'userStatusUpdate', data: { userUUID: '' } }))}}
                    >
                        <SmilePlus aria-hidden />
                        Set a status…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPauseOpen(true)}>
                        <BellOff aria-hidden />
                        {pauseMenuLabel(pausedUntil, focusUntil)}
                    </DropdownMenuItem>
                    {/* What it opens is "Your profile". It was called Settings,
                        and the settings page had no door here at all. */}
                    <DropdownMenuItem
                        onClick={()=>{dispatch(openUI({ key: 'selfUserProfile' }))}}
                    >
                        <CircleUser aria-hidden />
                        Your profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/app/settings")}>
                        <Settings aria-hidden />
                        Settings
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {/* Moved from a button of its own in the top bar. */}
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">Match my device</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={logout}
                >
                    <LogOut aria-hidden />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        <PauseNotificationsDialog open={pauseOpen} onOpenChange={setPauseOpen} />
        </>
    )
}

