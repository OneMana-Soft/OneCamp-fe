
import {Separator} from "@/components/ui/separator";
import * as React from "react";
import { app_project_path} from "@/types/paths";
import Link from "next/link";
import {TeamProjectInfoMobile} from "@/components/team/TeamProjectInfoMobile";
import {ProjectInfoInterface} from "@/types/project";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {useMedia} from "@/context/MediaQueryContext";

import {useToast} from "@/hooks/use-toast";
import {openUI} from "@/store/slice/uiSlice";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {useDispatch} from "react-redux";
import {useLongPress} from "@/hooks/useLongPress";

export const TeamProjectListResult = ({projectList, isAdmin, teamId, isUsersProject}: {projectList: ProjectInfoInterface[], isAdmin: boolean, teamId: string, isUsersProject: boolean}) => {

    const { isMobile, isDesktop } = useMedia();
    const { toast } = useToast();

    const handleClick = (e: React.MouseEvent, projectInfo: ProjectInfoInterface) => {
        if(!projectInfo.project_is_member && !isUsersProject) {
            e.preventDefault();
            toast({
                title: "Membership Required",
                description: "You are not a member of this project.",
                variant: "destructive",
            });
        }
    }




    return (
        <div className="w-full flex justify-center overflow-y-auto ">
            <div className=" w-full md:w-[40vw]  md:px-6">
                {
                    projectList.map((project: ProjectInfoInterface, i) => {
                        return (
                            <Link key = {project.project_uuid} href={`${app_project_path}/${project.project_uuid}`} className="block" onClick={(e) => handleClick(e, project)}>
                                {i!=0 && <Separator orientation="horizontal" className=" mx-6 w-[calc(100%-3rem)]" />}

                                {isMobile && <TouchableDiv rippleBrightness={0.8} rippleDuration={800} className="w-full">

                                    <TeamProjectInfoMobile projectInfo={project} isAdmin={isAdmin} teamId={teamId} isUsersProject={isUsersProject}/>
                                </TouchableDiv>}

                                {isDesktop &&

                                    <div className=' hover:bg-primary/5 hover:shadow-xl '>
                                    <TeamProjectInfoMobile projectInfo={project} isAdmin={isAdmin} teamId={teamId} isUsersProject={isUsersProject}/>
                                    </div>
                                }
                            </Link>
                        )
                    })

                }

                {
                    projectList.length && <Separator orientation="horizontal" className=" mx-6 w-[calc(100%-3rem)]" />
                }


            </div>
        </div>
    )
}