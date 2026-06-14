"use client"

import DesktopNavigationSearch from "@/components/navigationBar/desktop/desktopNavigationSearch";
import {ThemeToggle} from "@/components/themeProvider/theme-toggle";
import {UserStatusNav} from "@/components/navigationBar/userStatusNav";
import DesktopNavigationUserProfile from "@/components/navigationBar/desktop/desktopNavigationUserProfile";
import DesktopNavigationOrgProfile from "@/components/navigationBar/desktop/desktopNavigationOrgProfile";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { ConnectionStatusIndicator } from "@/components/mqtt/ConnectionStatusIndicator";
import { cn } from "@/lib/utils/helpers/cn";
import { Sparkles } from "@/lib/icons";
import { useDispatch, useSelector } from "react-redux";
import { openRightPanel, closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { RootState } from "@/store/store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


export default function DesktopNavigationTopBar() {

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch();
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);
    const isAiOpen = rightPanelState.isOpen && rightPanelState.data.aiChatOpen;

    const handleAiToggle = () => {
        if (isAiOpen) {
            dispatch(closeRightPanel());
        } else {
            dispatch(openRightPanel({ aiChatOpen: true }));
        }
    };

    return (
        <div className="w-full h-14 flex px-4 justify-between items-center bg-background/80 backdrop-blur-xl border-b border-border/40 sticky top-0 z-[var(--z-sticky)]">
            <DesktopNavigationOrgProfile/>
            <DesktopNavigationSearch/>
            <div className="flex items-center gap-3">
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleAiToggle}
                            aria-label={isAiOpen ? "Close AI Assistant" : "Open AI Assistant"}
                            className={cn(
                                "h-9 w-9 flex items-center justify-center rounded-md transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                isAiOpen
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            <Sparkles className="h-[18px] w-[18px]" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        AI Assistant
                    </TooltipContent>
                </Tooltip>


                <div className="flex items-center gap-1.5">
                    <ConnectionStatusIndicator compact />
                    <UserStatusNav userUUID={selfProfile.data?.data.user_uuid || ''}/>
                    <ThemeToggle/>
                </div>

                <DesktopNavigationUserProfile/>
            </div>
        </div>
    )
}
