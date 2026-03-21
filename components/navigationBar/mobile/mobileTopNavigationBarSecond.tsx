"use client"

import {usePathname} from "next/navigation";
import {
    MobileTopNavigationBarSecondChannel,
} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondChannel";
import {MobileTopNavigationBarSecondChat} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondChat";
import {MobileTopNavigationBarSecondTeam} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondTeam";
import {
    MobileTopNavigationBarSecondProject
} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondProject";
import {
    MobileTopNavigationBarSecondGroupChat
} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondGroupChat";
import {MobileTopNavigationBarSecondDoc} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondDoc";

export function MobileTopNavigationBarSecond() {
    const path = usePathname().split('/');


    const renderPageName = () => {
        switch (path[2]) {
            case "home":
                return "Home";
                break;
            case "team":
                if (path.length < 4)
                    return "Team";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondTeam teamId={path[3]}/>
                break;
            case "calendar":
                if (path.length < 4)
                    return "My Calendar";
                if (path.length < 6)
                    return "Event Detail";
                break;
            case "profile":
                return "My Profile";
            case "activity":
                return "Activity";
            case "create":

                if (path.length < 5)
                    return <span className='capitalize'>Create {path[3]}</span>
                break
            case "meet":
                switch (path[3]) {
                    case "ch":
                        return <MobileTopNavigationBarSecondChannel channelUUID={path[4]}/>
                        break;
                    case "chat":
                        return <MobileTopNavigationBarSecondChat chatUUID={path[4]}/>
                        break;
                    case "grp":
                        return <MobileTopNavigationBarSecondGroupChat grpId={path[4]}/>
                        break;

                }
                break
            case "posts":
                return "Your Posts"

            case "recordings":
                return "Recordings"
            case "search":
                return "Search";
                break;
            case "project":
                if (path.length < 4)
                    return "Projects";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondProject projectUUID={path[3]}/>
                break
            case "channel":
                if (path.length < 4)
                    return "Channels";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondChannel channelUUID={path[3]}/>
                if (path.length < 6) {

                    if(path[4] == "recording") {
                        return "Recordings"
                    }

                    return "Thread"
                }
                break;
            case "myTask":
                if (path.length < 4)
                    return "My Tasks";
                if (path.length < 5)
                    return
                break;
            case "task":
                return "Task"


            case "doc":
                if (path.length < 4)
                    return "Docs";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondDoc docId={path[3]}/>;
                if (path.length < 6)
                    return "Comment";
                break;
            case "calls":
                return "Calls"

            case "user":
                if (path.length > 4)
                    return <MobileTopNavigationBarSecondGroupChat grpId={path[4]}/>
            case "chat":
                if (path.length < 4)
                    return "Chat";

                if (path[3] == 'group') {

                    if (path.length < 6)
                        return <MobileTopNavigationBarSecondGroupChat grpId={path[4]}/>
                    if (path.length < 7){
                        if(path[5] == "recording") {
                            return "Recordings"
                        }
                        return "Thread"

                    }
                }
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondChat chatUUID={path[3]}/>
                if (path.length < 6) {

                    if(path[4] == "recording") {
                        return "Recordings"
                    }
                    return "Thread"
                }
                break;

            case "forward":
                return "Forward message";


            default:
                return <></>;
        }
    };

    return (
        <div className='font-bold capitalize text-lg text-center'>
            {renderPageName()}
        </div>
    );
}