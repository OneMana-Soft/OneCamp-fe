"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {ProjectTaskDesktop} from "@/components/project/projectTaskDesktop";
import dynamic from "next/dynamic";
import { TabLoading } from "@/components/task/TabLoading";

// The phone's project page is its own chunk: a desktop never loads it.
const ProjectListTabs = dynamic(() => import("@/components/project/projectListTabs").then((m) => m.ProjectListTabs), { loading: () => <TabLoading kind="list" /> });

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
