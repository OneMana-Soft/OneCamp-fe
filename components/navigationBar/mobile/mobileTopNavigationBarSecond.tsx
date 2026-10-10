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
import {MobileTopNavigationBarSecondBoard} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondBoard";
import { settingsSection } from "@/lib/settingsSections";

export function MobileTopNavigationBarSecond() {
    const path = usePathname().split('/');


    const renderPageName = () => {
        switch (path[2]) {
            case "home":
                return "Home";
                break;
            case "admin":
                return "Admin"
            case "team":
                if (path.length < 4)
                    return "Teams";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondTeam teamId={path[3]}/>
                break;
            case "ai":
                if (path[3] === "memory")
                    return "Memory";
                // Its name everywhere else: the top bar's button, the panel,
                // Home's "Ask OneCamp AI".
                return "OneCamp AI"
            case "calendar":
                if (path.length < 4)
                    return "Calendar";
                if (path.length < 6)
                    return "Event";
                break;
            case "profile":
                return "Your profile";
            case "activity":
                return "Activity";
            case "later":
                return "Later";
            case "inbox":
                return "Inbox";
            case "create":

                // Sentence case: "New task", not "Create Task".
                if (path.length < 5)
                    return `New ${path[3]}`
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
            case "settings":
                // Each section by the name its page and the list of sections
                // give it (lib/settingsSections), so the bar can't drift from
                // them: it said "Agents & skills" over "Agents and skills", and
                // "Settings" over "Your AI assistants", which had no case.
                return (path[3] && settingsSection(`/app/settings/${path[3]}`)?.label) || "Settings";

            case "tables":
                if (path.length < 4)
                    return "Tables";
                return "Table";

            case "templates":
                return "Templates";

            case "goals":
                return path.length < 4 ? "Goals" : "Goal";

            case "posts":
                return "Your posts"

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
                    return "My tasks";
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
            case "board":
                if (path.length < 4)
                    return "Boards";
                if (path.length < 5)
                    return <MobileTopNavigationBarSecondBoard boardId={path[3]}/>;
                break;
            case "calls":
                return "Calls"

            case "user":
                if (path.length > 4)
                    return <MobileTopNavigationBarSecondGroupChat grpId={path[4]}/>
                // Without this, the case fell through to "chat" below, which asked
                // the chat lookup to name a conversation using a user id. It found
                // nothing, so a profile arrived with an empty title bar.
                return "Profile";
            case "chat":
                if (path.length < 4)
                    return "Direct messages";

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
        // Semibold, as the bar titles a channel, a person or a project.
        <div className='font-semibold text-base text-center min-w-0 truncate'>
            {renderPageName()}
        </div>
    );
}