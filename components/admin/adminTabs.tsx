"use client"


import { Circle, Hash } from "@/lib/icons";
import {ChannelListTabContent} from "@/components/channel/channelListTabContent";
import {useCallback, useEffect, useState} from "react";
import {useMedia} from "@/context/MediaQueryContext";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

const VALID_TABS = ["active", "archived", "join"] as const
type TabValue = (typeof VALID_TABS)[number]

export function AdminTabs() {


    const {isDesktop} = useMedia()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()

    // Initialize tab state from URL with validation
    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "active"
    })

    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    useEffect(() => {
        if (pathname === "/app/channel" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [selectedTab, pathname, router, searchParams])


    return (
        <div className='flex flex-col h-full'>

            <div>
                <div
                    className='h-10 md:h-16 text-sm  flex w-full md:w-[40vw]  md:justify-start  justify-around items-center p-1.5 space-x-3 md:p-4 md:ml-2'>
                    {isDesktop && <div className='flex space-x-1 justify-center items-center mr-6'>
                        <div><Hash className='h-5 w-5 text-muted-foreground'/></div>
                        <div className="text-base font-medium">Channels</div>
                    </div>}

                    <div onClick={() => handleTabChange('active' )}
                         className={`hover:cursor-pointer md:h-8 flex justify-center items-center md:w-fit md:px-8 h-full w-full text-center rounded-md transition-all duration-200 hover:bg-muted/50 ${selectedTab == 'active' ? 'bg-primary font-medium text-foreground shadow-sm' : "text-muted-foreground"}`}>
                        Active
                    </div>
                    <div onClick={() => handleTabChange('archived')}
                         className={`hover:cursor-pointer md:h-8 flex justify-center items-center md:w-fit md:px-8 h-full w-full text-center  rounded-md transition-all duration-200 hover:bg-muted/50 ${selectedTab == 'archived' ? 'bg-primary font-medium text-foreground shadow-sm' : "text-muted-foreground"}`}>
                        Archived
                    </div>
                    <div onClick={() => handleTabChange('join')}
                         className={`hover:cursor-pointer md:h-8 flex justify-center items-center md:w-fit md:px-8 h-full w-full text-center  rounded-md transition-all duration-200 hover:bg-muted/50 ${selectedTab == 'join' ? 'bg-primary font-medium text-foreground shadow-sm' : "text-muted-foreground"}`}>
                        Join
                    </div>
                </div>
            </div>

            <ChannelListTabContent selectedTab={selectedTab}/>
        </div>
    )
}
