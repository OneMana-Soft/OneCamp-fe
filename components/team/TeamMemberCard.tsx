import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {TeamProjectList} from "@/components/team/TeamProjectList";
import {TeamMemberContent} from "@/components/member/teamMemberContent";
import {Users} from "lucide-react";

export const TeamMemberCard = ({teamId}:{teamId: string}) => {


    return (
        <Card className="w-full h-full min-h-0 border-none shadow-none bg-transparent flex flex-col">
            <CardHeader className="px-0 pt-0 pb-6">
                <div className="flex items-center gap-2 mb-1">
                    <div className="bg-primary/10 p-1.5 rounded-md">
                        <Users className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold tracking-tight">
                        Members
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
                <TeamMemberContent teamId={teamId} />
            </CardContent>
        </Card>
    )
}