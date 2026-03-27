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
import { Sparkles } from "lucide-react";
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
        <div className="w-full h-16 flex p-4 justify-between items-center glass sticky top-0 z-50">
            <DesktopNavigationOrgProfile/>
            <DesktopNavigationSearch/>
            <div className='flex space-x-6 justify-center items-center'>
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleAiToggle}
                            className={`p-2 rounded-lg transition-all duration-200 ${
                                isAiOpen
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                        >
                            <Sparkles className="h-[18px] w-[18px]" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        AI Assistant
                    </TooltipContent>
                </Tooltip>
                <ConnectionStatusIndicator />
                <UserStatusNav userUUID={selfProfile.data?.data.user_uuid || ''}/>
                <DesktopNavigationUserProfile/>
                <ThemeToggle/>
            </div>


        </div>
    )
}

