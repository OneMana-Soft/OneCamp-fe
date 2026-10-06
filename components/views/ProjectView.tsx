"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {ProjectTaskDesktop} from "@/components/project/projectTaskDesktop";
import {ProjectListTabs} from "@/components/project/projectListTabs";

export function ProjectView({ projectId }: { projectId: string }) {

    const { isMobile, isDesktop } = useMedia();


    if(!projectId)return

    return (
        <>
            {isMobile && <ProjectListTabs projectId={projectId}/>}
            {isDesktop && <ProjectTaskDesktop projectId={projectId}/>}
        </>
    )
}
