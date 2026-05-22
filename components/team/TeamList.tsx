import { SearchField } from "@/components/search/searchField";
import { useEffect, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { app_team_path } from "@/types/paths";
import Link from "next/link";
import { TeamInfoInterface, TeamListResponseInterface } from "@/types/team";
import { TeamInfo } from "@/components/team/TeamInfo";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder";
import { LoadingStateCircle } from "@/components/loading/loadingStateCircle";
import { ListSkeleton } from "@/components/ui/ListSkeleton";

export const TeamList = () => {
    const teamList = useFetch<TeamListResponseInterface>(GetEndpointUrl.GetUserTeamList)

    const [teamSearchText, setTeamSearchText] = useState('')
    const [searchTeamList, setSearchTeamList] = useState<TeamInfoInterface[] | null>(null)
    const [sortedTeamList, setSortedTeamList] = useState<TeamInfoInterface[] | null>(null)

    useEffect(() => {
        if (teamSearchText.trim().length === 0) return

        const filteredTeam = teamList.data?.data?.filter((team) =>
            team.team_name
                .toLowerCase()
                .replace(/\s+/g, '')
                .includes(teamSearchText.toLowerCase().replace(/\s+/g, ''))
        ) || []

        setSearchTeamList(filteredTeam)
    }, [teamSearchText, teamList.data?.data])

    const renderTeamList = teamSearchText && searchTeamList ? searchTeamList : teamList.data?.data

    useEffect(() => {
        if (renderTeamList) {
            setSortedTeamList(renderTeamList)
        }
    }, [renderTeamList])

    const handleSearchChange = (q: string) => {
        setTeamSearchText(q)
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <SearchField
                onChange={handleSearchChange}
                value={teamSearchText}
                placeholder={"Search teams..."}
            />

            <div className="flex-1 overflow-y-auto px-1 py-1.5 sidebar-extended-channels">
                {teamList.isLoading && !sortedTeamList && (
                    <ListSkeleton rows={8} />
                )}

                {sortedTeamList?.map((teamData) => (
                    <Link
                        key={teamData.team_uuid}
                        href={`${app_team_path}/${teamData.team_uuid}`}
                        className="block focus:outline-none"
                    >
                        <TeamInfo teamInfo={teamData} />
                    </Link>
                ))}

                {!teamList.isLoading && !teamSearchText && sortedTeamList && sortedTeamList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder
                            type="empty"
                            title="No teams yet"
                            description="You haven't joined any teams. Create or join a team to get started."
                        />
                    </div>
                )}

                {teamSearchText && searchTeamList && searchTeamList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder
                            type="search"
                            title="No teams found"
                            description="We couldn't find any teams matching your search."
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
