import {Input} from "@/components/ui/input";
import {Separator} from "@/components/ui/separator";
import {ListSkeleton} from "@/components/ui/ListSkeleton";
import {Search} from "lucide-react";
import {useFetch} from "@/hooks/useFetch";
import {TeamInfoInterface, TeamInfoRawInterface} from "@/types/team";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ProjectAddOrRemoveInterface, ProjectInfoInterface} from "@/types/project";
import {useState} from "react";
import {useDispatch} from "react-redux";
import {usePost} from "@/hooks/usePost";
import {TeamProjectInfo} from "@/components/team/TeamProjectInfo";
import {openUI} from "@/store/slice/uiSlice";

export const TeamProjectList = ({teamId}:{teamId: string}) => {


    const dispatch = useDispatch()
    const post = usePost()
    const teamProjectList = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamProjectList + '/' + teamId :'')

    const handleProjectMembers = (id: string) => {
        dispatch(openUI({ key: 'editProjectMember', data: {projectUUID: id} }))
    }

    const [query, setQuery] = useState('')

    const execDelete = (id: string) => {
        post.makeRequest<ProjectAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.DeleteProject,
            payload: {
                project_uuid: id
            }
        }).then(()=>{
            teamProjectList.mutate()
        })
    }

    const handleDelete = (id: string) => {
        if(!id) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Archiving project",
                    description: "Are you sure you want to proceed archiving the project",
                    confirmText: "Archive project",
                    onConfirm: ()=>{execDelete(id)}
                }
            }));
        }, 500);


    }

    const execUndelete = (id: string) => {
        post.makeRequest<ProjectAddOrRemoveInterface>({
            apiEndpoint: PostEndpointUrl.UndeleteProject,
            payload: {
                project_uuid: id
            }
        }).then(()=>{
            teamProjectList.mutate()
        })
    }

    const handleUnDelete = async (id: string) => {
        if(!id) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "UnArchiving project",
                    description: "Are you sure you want to proceed unarchiving the project",
                    confirmText: "UnArchive project",
                    onConfirm: ()=>{execUndelete(id)}
                }
            }));
        }, 500);


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
            <div className="relative mb-4 flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search projects..."
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-9 bg-muted/30 border-border/50 focus-visible:ring-primary/20"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {teamProjectList.isLoading ? (
                    <ListSkeleton rows={4} showAvatar={false} className="px-0 py-2" />
                ) : (teamProjectList.data?.data.team_projects?.length || 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-primary/10 p-3 rounded-full mb-4">
                            <Search className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight">No projects yet</h3>
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