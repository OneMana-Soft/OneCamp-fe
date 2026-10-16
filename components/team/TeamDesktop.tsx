import { Pencil } from "@/lib/icons";
import { PageHeader } from "@/components/ui/pageHeader"
import {useDispatch} from "react-redux";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {TeamInfoRawInterface} from "@/types/team";
import {Button} from "@/components/ui/button";
import {TeamProjectCard} from "@/components/team/TeamProjectCard";
import {openUI} from "@/store/slice/uiSlice";
import {TeamMemberCard} from "@/components/team/TeamMemberCard";
import dynamic from "next/dynamic";
import { SpaceDocsCardFallback } from "@/components/docTree/SpaceDocsCard";

// The team's docs: the pages made in its space (docs programme B5), a chunk
// of their own. Its card's heading stands in while it arrives.
const SpaceDocs = dynamic(() => import("@/components/docTree/SpaceDocs"), { loading: () => <SpaceDocsCardFallback /> });

export const TeamDesktop = ({teamId}:{teamId: string})=> {

    const teamInfo = useFetch<TeamInfoRawInterface>(teamId ? GetEndpointUrl.GetTeamInfo + '/' + teamId :'')

    const dispatch = useDispatch()

    return (
        <div className="flex-1 min-h-0 flex flex-col h-full w-full">
            {/* Header */}
            <PageHeader
                eyebrow="Team"
                className="px-8 pt-8"
                title={teamInfo.data?.data.team_name || "\u00a0"}
                actions={teamInfo.data?.data.team_is_admin && (
                                <Button aria-label="Rename team" 
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
            />

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden px-8 pb-8 pt-6 flex flex-col">
                <div className="flex flex-col lg:flex-row gap-8 h-full min-h-0 max-w-7xl mx-auto w-full">
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        <TeamProjectCard teamId={teamId} />
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col" data-team-docs="">
                        <SpaceDocs space={`team:${teamId}` as const} name={teamInfo.data?.data.team_name} variant="card" />
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                        <TeamMemberCard teamId={teamId} />
                    </div>
                </div>
            </div>
        </div>
    );


}