"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {ProjectTaskDesktop} from "@/components/project/projectTaskDesktop";
import {useParams} from "next/navigation";
import {ProjectListTabs} from "@/components/project/projectListTabs";

export default function Page() {

    const { isMobile, isDesktop } = useMedia();

    const params = useParams()
    const projectId = params?.['project-id'] as string

    if(!projectId)return

    return (
        <>
            {isMobile && <ProjectListTabs projectId={projectId}/>}
            {isDesktop && <ProjectTaskDesktop projectId={projectId}/>}
        </>
    )
}
