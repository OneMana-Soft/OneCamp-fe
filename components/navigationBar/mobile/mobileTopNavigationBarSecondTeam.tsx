"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { TeamInfoRawInterface } from "@/types/team"
import { ColorIcon } from "@/components/colorIcon/colorIcon"

export function MobileTopNavigationBarSecondTeam({ teamId }: { teamId: string }) {
    const teamInfo = useFetch<TeamInfoRawInterface>(
        teamId ? GetEndpointUrl.GetTeamInfo + "/" + teamId : "",
    )

    const teamName = teamInfo.data?.data.team_name || "Team"

    return (
        <div className="flex justify-center items-center gap-2 min-w-0 px-2">
            <ColorIcon name={teamId} size="xs" />
            <span className="text-base font-semibold text-foreground truncate">
                {teamName}
            </span>
        </div>
    )
}
