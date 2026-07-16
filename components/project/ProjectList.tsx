import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useEffect, useState} from "react";
import {TeamProjectListResult} from "@/components/team/TeamProjectListResult";
import {ProjectInfoInterface} from "@/types/project";
import {UserInfoRawInterface} from "@/types/user";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder";
import { Button } from "@/components/ui/button";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch } from "react-redux";

export const ProjectList = ({searchQuery}:{searchQuery: string}) => {

    const dispatch = useDispatch()
    const userInfo = useFetch<UserInfoRawInterface>(GetEndpointUrl.GetUserProjectList )

    const [searchProjectList, setSearchProjectList] = useState<ProjectInfoInterface[]>([])

    const [sortedProjectList, setSortedProjectList] = useState<ProjectInfoInterface[]>([])


    useEffect(()=>{

        if(searchQuery.trim().length == 0) return

        const filteredProject =
            searchQuery === ''
                ? userInfo.data?.data.user_projects || [] as ProjectInfoInterface[]
                : userInfo.data?.data.user_projects?.filter((project) =>
                project.project_name
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(searchQuery.toLowerCase().replace(/\s+/g, ''))
            ) || [] as ProjectInfoInterface[]

        setSearchProjectList(filteredProject);

    }, [searchQuery])

    const renderChannelList =  searchQuery && searchProjectList ? searchProjectList: userInfo.data?.data.user_projects


    useEffect(() => {

        if(renderChannelList) {
            setSortedProjectList(renderChannelList)
        }


    }, [renderChannelList]);


    return (
        <>
            { sortedProjectList.length > 0 ?
                <TeamProjectListResult projectList={sortedProjectList} isAdmin={false} teamId={''} isUsersProject={true}/> :

                !searchQuery && !userInfo.isLoading && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                        <StatePlaceholder
                            type="empty"
                            title="No projects yet"
                            description="Create a project to organize tasks and collaborate with your team."
                            action={
                                <Button
                                    onClick={() => dispatch(openUI({ key: "createProject" }))}
                                    variant="outline"
                                    size="sm"
                                >
                                    Create a project
                                </Button>
                            }
                        />
                    </div>
                )
            }

            {searchQuery && searchProjectList && searchProjectList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 w-full h-full min-h-[40vh]">
                    <StatePlaceholder type="search" title="No projects found" description="We couldn't find any projects matching your search." />
                </div>
            )}
        </>
    )
}