import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useEffect, useState} from "react";
import {TeamProjectListResult} from "@/components/team/TeamProjectListResult";
import {TeamInfoRawInterface} from "@/types/team";
import {ProjectInfoInterface} from "@/types/project";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder"
import { ErrorState } from "@/components/ui/error-state";

export const TeamListTabProject = ({searchQuery,teamId}:{searchQuery: string, teamId:string}) => {

    const teamProjectList = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamProjectList + '/' + teamId :'')

    const [searchProjectList, setSearchProjectList] = useState<ProjectInfoInterface[]>([])

    const [sortedProjectList, setSortedProjectList] = useState<ProjectInfoInterface[]>([])


    useEffect(()=>{

        if(searchQuery.trim().length == 0) return

        const filteredProject =
            searchQuery === ''
                ? teamProjectList.data?.data.team_projects || [] as ProjectInfoInterface[]
                : teamProjectList.data?.data.team_projects?.filter((project) =>
                project.project_name
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(searchQuery.toLowerCase().replace(/\s+/g, ''))
            ) || [] as ProjectInfoInterface[]

        setSearchProjectList(filteredProject);

    }, [searchQuery])

    const renderChannelList =  searchQuery && searchProjectList ? searchProjectList: teamProjectList.data?.data.team_projects


    useEffect(() => {

        if(renderChannelList) {
            setSortedProjectList(renderChannelList)
        }


    }, [renderChannelList]);

    if(teamProjectList.isLoading) {
        return <LoadingStateCircle/>
    }

    return (
        <>
            { sortedProjectList.length > 0 ?
                <TeamProjectListResult projectList={sortedProjectList} isAdmin={teamProjectList.data?.data.team_is_admin || false} teamId={teamId} isUsersProject={false}/>:

                teamProjectList.isError ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <ErrorState subject="this team's projects" onRetry={() => void teamProjectList.mutate()} />
                    </div>
                ) :
                !searchQuery && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder
                            type="empty"
                            title="No projects yet"
                            description="This team doesn't have any projects. Create a project to get started."
                        />
                    </div>
                )
            }

            {searchQuery && searchProjectList && searchProjectList.length == 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                    <StatePlaceholder
                        type="search"
                        title="No projects found"
                        description="We couldn't find any projects matching your search."
                    />
                </div>
            )}
        </>
    )
}