import {ProjectInfoInterface} from "@/types/project";
import {Button} from "@/components/ui/button";
import {List, Trash, Users, RotateCcw} from "lucide-react";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import Link from "next/link";
import {app_channel_path, app_project_path} from "@/types/paths";
import {ColorIcon} from "@/components/colorIcon/colorIcon";

interface ProjectsInfoInterface {
    projectInfo: ProjectInfoInterface
    handleDelete: (id: string)=>void
    handleUnDelete: (id: string) => void
    handleProjectMembers:(id: string) => void
    isAdmin: boolean
}

export const TeamProjectInfo = ({projectInfo, handleDelete, handleUnDelete, isAdmin, handleProjectMembers}: ProjectsInfoInterface) => {



    return (

        <div className='flex justify-between h-16 items-center '>
            <div className='flex justify-center items-center space-x-2'>
                <ColorIcon name={projectInfo.project_uuid} size={'sm'}/>
                <div className="flex flex-col">
                    {projectInfo.project_is_member ? (
                        <Link href={`${app_project_path}/${projectInfo.project_uuid}`} className="max-w-sm overflow-hidden whitespace-nowrap overflow-ellipsis hover:underline cursor-pointer">
                            {projectInfo.project_name}
                        </Link>
                    ) : (
                        <div className="max-w-sm overflow-hidden whitespace-nowrap overflow-ellipsis">
                            {projectInfo.project_name}
                        </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {projectInfo.project_member_count || 0} Members
                        </span>
                    </div>
                </div>
            </div>
            <div className='flex items-center space-x-3.5'>
                <div>
                    <Button size='icon' variant='ghost' onClick={() => {
                        handleProjectMembers(projectInfo.project_uuid)
                    }}>

                        <Users/>
                    </Button>
                </div>
                <div>
                    {
                        isAdmin && (isZeroEpoch(projectInfo.project_deleted_at || '') ?
                            <Trash className='size-4 text-destructive cursor-pointer hover:opacity-80 transition-opacity' onClick={() => {
                                handleDelete(projectInfo.project_uuid)
                            }}/> :
                            <RotateCcw className='size-4 text-green-600 cursor-pointer hover:opacity-80 transition-opacity' onClick={() => {
                                handleUnDelete(projectInfo.project_uuid)
                            }}/>)
                    }
                </div>

            </div>
        </div>

    );
}