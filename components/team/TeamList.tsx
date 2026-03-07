import {SearchField} from "@/components/search/searchField";
import {useEffect, useMemo, useState} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";

import {
    USER_STATUS_ONLINE,
    UserDMSearchTextInterface,
    UserProfileDataInterface,
    UserProfileInterface
} from "@/types/user";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {usePost} from "@/hooks/usePost";
import {app_chat_path, app_team_path} from "@/types/paths";
import Link from "next/link";
import {RootState} from "@/store/store";
import {useDispatch, useSelector} from "react-redux";
import {CreateUserChatList} from "@/store/slice/chatSlice";
import {sortChatList} from "@/lib/utils/sortChatList";
import {TeamInfoInterface, TeamListResponseInterface} from "@/types/team";
import {ProjectInfoInterface} from "@/types/project";
import {TeamInfo} from "@/components/team/TeamInfo";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder";
import {Separator} from "@/components/ui/separator";
import {TeamProjectInfo} from "@/components/team/TeamProjectInfo";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";

export const TeamList = () => {

    const teamList = useFetch<TeamListResponseInterface>(GetEndpointUrl.GetUserTeamList)
    const [teamSearchText, setTeamSearchText] = useState('')

    const [searchTeamList, setSearchTeamList ] = useState<TeamInfoInterface[] | null>(null)

    const [sortedTeamList, setSortedTeamList ] = useState<TeamInfoInterface[] | null>(null)


    useEffect(()=>{

        if(teamSearchText.trim().length == 0) return

        const filteredTeam =
            teamSearchText === ''
                ? teamList.data?.data || [] as TeamInfoInterface[]
                : teamList.data?.data?.filter((team) =>
                team.team_name
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(teamSearchText.toLowerCase().replace(/\s+/g, ''))
            ) || [] as TeamInfoInterface[]

        setSearchTeamList(filteredTeam);

    }, [teamSearchText])

    const renderTeamList = teamSearchText && searchTeamList ? searchTeamList: teamList.data?.data


    useEffect(() => {

        if(renderTeamList) {
            setSortedTeamList(renderTeamList)
        }
    }, [renderTeamList]);

    const handleDmSearchOnChange = (dmName: string) => {
        setTeamSearchText(dmName);



        // if (dmName !== '') {
        //     debouncedSearch(dmName);
        // }

    }



    if(teamList.isLoading) {
        return <LoadingStateCircle/>
    }


    return (
        <div className="flex flex-col h-full overflow-hidden">
            <SearchField onChange={handleDmSearchOnChange} value={teamSearchText} placeholder={"Search teams..."}/>

            <div className="flex-1 overflow-y-auto sidebar-extended-channels">
                {sortedTeamList && sortedTeamList.map((teamData, index) => {

                    return (<div key={index}>
                        {index !== 0 && <hr className="h-px bg-gray-200 border-0 dark:bg-gray-700"/>}

                        <TouchableDiv rippleBrightness={0.8} rippleDuration={800} >

                            <Separator orientation="horizontal" className={index ? 'invisible' : ''} />
                            <Link href={`${app_team_path}/${teamData.team_uuid}`} className="block">
                                <TeamInfo
                                    teamInfo={teamData}
                                />
                            </Link>
                            <Separator orientation="horizontal" className="" />

                        </TouchableDiv>
                    </div>)

                })}

                {!teamList.isLoading && !teamSearchText && sortedTeamList && sortedTeamList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder type="empty" title="No teams yet" description="You haven't joined any teams. Create or join a team to get started." />
                    </div>
                )}

                {teamSearchText && searchTeamList && searchTeamList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder type="search" title="No teams found" description="We couldn't find any teams matching your search." />
                    </div>
                )}
            </div>

        </div>

    )
}