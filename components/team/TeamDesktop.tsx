import {Pencil, Users} from "lucide-react";
import {useDispatch} from "react-redux";
import {useFetch} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {TeamInfoInterface, TeamInfoRawInterface} from "@/types/team";
import {Button} from "@/components/ui/button";
import {TeamProjectCard} from "@/components/team/TeamProjectCard";
import {openUI} from "@/store/slice/uiSlice";
import {TeamMemberCard} from "@/components/team/TeamMemberCard";

export const TeamDesktop = ({teamId}:{teamId: string})=> {

    const teamInfo = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamInfo + '/' + teamId :'')

    const dispatch = useDispatch()

    return (
        <div className="flex-1 min-h-0 flex flex-col h-full w-full">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-border/50 bg-card/30">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-1.5 rounded-md">
                        <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {teamInfo.data?.data.team_name}
                            </h1>
                            {teamInfo.data?.data.team_is_admin && (
                                <Button 
                                    size='icon' 
                                    variant='ghost' 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => {
                                        dispatch(openUI({ key: 'editTeamName', data: { teamUUID: teamId || '' } }))
                                    }}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage your team's projects and members.
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden p-8 flex flex-col">
                <div className="flex flex-col lg:flex-row gap-8 h-full min-h-0 max-w-7xl mx-auto w-full">
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        <TeamProjectCard teamId={teamId} />
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        <TeamMemberCard teamId={teamId} />
                    </div>
                </div>
            </div>
        </div>
    );


}