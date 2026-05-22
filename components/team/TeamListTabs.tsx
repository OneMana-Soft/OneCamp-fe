"use client"


import { Circle, Hash } from "@/lib/icons";
import {ChannelListTabContent} from "@/components/channel/channelListTabContent";
import {useState} from "react";
import {useMedia} from "@/context/MediaQueryContext";
import {TeamListTabContent} from "@/components/team/TeamListTabContent";

export function TeamListTabs({teamId}: {teamId: string}) {

    const [selectedTab, setSelectedTab] = useState("projects");

    const handleChangeTab = (t: string) => {
        setSelectedTab(t);
    }

    return (
        <div className='flex flex-col h-full'>



            <TeamListTabContent  teamId={teamId}/>
        </div>
    )
}
