"use client"


import {TeamDesktop} from "@/components/team/TeamDesktop";
import {useParams} from "next/navigation";
import {useMedia} from "@/context/MediaQueryContext";
import {TeamListTabContent} from "@/components/team/TeamListTabContent";

export default function Page() {

    const params = useParams()
    const teamId = params?.["team-id"] as string
    const {isMobile, isDesktop} = useMedia()


    return (
        <div className="flex-1 min-h-0 flex flex-col h-full w-full overflow-hidden">
            {isDesktop && <TeamDesktop teamId={teamId} />}

            {isMobile && <TeamListTabContent teamId={teamId} />}
        </div>
    )
}
