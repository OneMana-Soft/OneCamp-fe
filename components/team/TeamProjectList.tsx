import { SearchInput } from "@/components/ui/search-input";
import {Separator} from "@/components/ui/separator";
import {ListSkeleton} from "@/components/ui/ListSkeleton";
import { Search } from "@/lib/icons";
import {useFetch} from "@/hooks/useFetch";
import {TeamInfoRawInterface} from "@/types/team";
import {GetEndpointUrl} from "@/services/endPoints";
import {ProjectInfoInterface} from "@/types/project";
import {useState} from "react";
import {useDispatch} from "react-redux";
import {TeamProjectInfo} from "@/components/team/TeamProjectInfo";
import {openUI} from "@/store/slice/uiSlice";
import {useArchiveProject} from "@/hooks/useArchiveProject";

export const TeamProjectList = ({teamId}:{teamId: string}) => {


    const dispatch = useDispatch()
    const { archive, restore } = useArchiveProject()
    const teamProjectList = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamProjectList + '/' + teamId :'')

    const handleProjectMembers = (id: string) => {
        dispatch(openUI({ key: 'editProjectMember', data: {projectUUID: id} }))
    }

    const [query, setQuery] = useState('')

    // One question, then the server (hooks/useArchiveProject).
    const nameOf = (id: string) => teamProjectList.data?.data.team_projects?.find((p) => p.project_uuid === id)?.project_name
    const handleDelete = (id: string) => {
        if (id) archive(id, { name: nameOf(id), done: () => void teamProjectList.mutate() })
    }
    const handleUnDelete = (id: string) => {
        if (id) restore(id, { name: nameOf(id), done: () => void teamProjectList.mutate() })
    }


    const filteredProject =
        query === ''
            ? teamProjectList.data?.data.team_projects || [] as ProjectInfoInterface[]
            : teamProjectList.data?.data.team_projects?.filter((project) =>
            project.project_name
                .toLowerCase()
                .replace(/\s+/g, '')
                .includes(query.toLowerCase().replace(/\s+/g, ''))
        ) || [] as ProjectInfoInterface[]


    return (

        <div className="flex-1 min-h-0 flex flex-col gap-y-4 w-full">
            <SearchInput placeholder="Search projects…" value={query} onValueChange={setQuery} className="mb-4 flex-shrink-0" />

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {teamProjectList.isLoading ? (
                    <ListSkeleton rows={4} showAvatar={false} className="px-0 py-2" />
                ) : (teamProjectList.data?.data.team_projects?.length || 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-primary/10 p-3 rounded-full mb-4">
                            <Search className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold">No projects yet</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                            Get started by creating a new project.
                        </p>
                    </div>
                ) : filteredProject.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm italic">
                        No projects match your search.
                    </div>
                ) : (filteredProject.map((project, i) => {


                    return (

                        <div key={(project.project_uuid)}>
                            <Separator orientation="horizontal" className={i ? 'invisible' : ''} />
                            <TeamProjectInfo projectInfo={project} handleDelete={handleDelete} handleUnDelete={handleUnDelete} isAdmin={teamProjectList.data?.data.team_is_admin||false} handleProjectMembers={handleProjectMembers}/>
                            <Separator orientation="horizontal" className="" />

                        </div>
                    )
                }))}
            </div>
        </div>

    );
}