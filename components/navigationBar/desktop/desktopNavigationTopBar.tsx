"use client"

import DesktopNavigationSearch from "@/components/navigationBar/desktop/desktopNavigationSearch";
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
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_AI } from "@/hooks/useClientConfig"
import { FocusPill } from "@/components/split/FocusPill"

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
        // Equal sides keep the search centred when something joins the right
        // (the focus pill), instead of sliding it over. 8px in at both ends:
        // the logo then centres on the sidebar's icon column (24px), and the
        // avatar ends on the sheet's right edge, where at 12px in they sat 4px
        // off both.
        <div className="w-full h-12 flex px-2 gap-3 items-center bg-canvas sticky top-0 z-[var(--z-sticky)]">
            <div className="flex flex-1 basis-0 items-center">
                <DesktopNavigationOrgProfile/>
            </div>
            <DesktopNavigationSearch/>
            <div className="flex flex-1 basis-0 items-center justify-end gap-1.5">
                <FocusPill />
                <FeatureGate feature={FEATURE_AI}>
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleAiToggle}
                            aria-label={isAiOpen ? "Close OneCamp AI" : "Open OneCamp AI"}
                            className={cn(
                                "h-9 w-9 flex items-center justify-center rounded-md transition duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                isAiOpen
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            <Sparkles className="h-[18px] w-[18px]" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        OneCamp AI
                    </TooltipContent>
                </Tooltip>
                </FeatureGate>

                {/* Quiet while all is well: the connection shows only when it is
                    lost, and the status only once one is set. Theme and "set a
                    status" live in the profile menu. Six controls in the top bar
                    became three. */}
                <ConnectionStatusIndicator compact quietWhenConnected />
                <UserStatusNav userUUID={selfProfile.data?.data.user_uuid || ''} hideWhenEmpty />

                <DesktopNavigationUserProfile/>
            </div>
        </div>
    )
}
