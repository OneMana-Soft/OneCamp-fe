"use client"

import {usePathname} from "next/navigation";
import {Ellipsis, Star} from "lucide-react";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {useFetch} from "@/hooks/useFetch";
import {getStaticPaths} from "next/dist/build/templates/pages";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ChannelInfoInterfaceResp} from "@/types/channel";
import {Button} from "@/components/ui/button";
import {useEffect, useState} from "react";
import {usePost} from "@/hooks/usePost";
import {ProjectInfoRawInterface} from "@/types/project";
import {ColorIcon} from "@/components/colorIcon/colorIcon";

export function MobileTopNavigationBarSecondProject({projectUUID}:{projectUUID: string}) {

    const projectInfo = useFetch<ProjectInfoRawInterface>(GetEndpointUrl.GetProjectInfo + '/' + projectUUID)


    return (
        <div className='flex justify-center items-center space-x-3'>

            <ColorIcon name={projectInfo.data?.data.project_uuid || ''} size={'sm'}/>
            <div className='font-bold text-lg text-center truncate overflow-auto overflow-ellipsis'>
                {projectInfo.data?.data.project_name}
            </div>
        </div>

    );
}