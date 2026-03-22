"use client"


import {Circle, Hash} from "lucide-react";
import {ChannelListTabContent} from "@/components/channel/channelListTabContent";
import {useState} from "react";
import {useMedia} from "@/context/MediaQueryContext";
import {ProjectListTabContent} from "@/components/project/projectListTabContent";

export function ProjectListTabs({projectId}:{projectId: string}) {

    const [selectedTab, setSelectedTab] = useState("task");

    const handleChangeTab = (t: string) => {
        setSelectedTab(t);
    }


    return (
        <div className='flex flex-col h-full'>

            <div>
                <div
                    className='h-10 md:h-16 text-sm  flex w-full md:w-[25vw]   justify-around items-center p-1.5 space-x-3 md:p-4 md:ml-2'>

                    <div onClick={() => handleChangeTab('task')}
                         className={`hover:cursor-pointer md:h-8 flex justify-center items-center  md:w-fit md:px-8  h-full w-full text-center  rounded-md transition-all duration-200 hover:bg-muted/50 ${selectedTab == 'task' ? 'hover:text-muted-foreground bg-primary font-medium text-amber-50 shadow-sm' : "text-muted-foreground"}`}>
                        Tasks
                    </div>
                    <div onClick={() => handleChangeTab('attachment')}
                         className={`hover:cursor-pointer md:h-8 flex justify-center items-center  md:w-fit md:px-8  h-full w-full text-center  rounded-md transition-all duration-200 hover:bg-muted/50 ${selectedTab == 'attachment' ? 'hover:text-muted-foreground bg-primary font-medium text-amber-50 shadow-sm' : "text-muted-foreground"}`}>
                        Attachments
                    </div>
                </div>
            </div>

            <ProjectListTabContent selectedTab={selectedTab} projectId={projectId}/>
        </div>
    )
}
