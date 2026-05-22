import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { TeamDeleteOrUndeleteInterface, TeamListResponseInterface, TeamInfoInterface } from "@/types/team";
import { usePost } from "@/hooks/usePost";
import { AdminTeamList } from "./AdminTeamList";
import { Users } from "@/lib/icons";

const TeamsCard = () => {
    const [pageIndex, setPageIndex] = React.useState(0)
    const [allTeams, setAllTeams] = React.useState<TeamInfoInterface[]>([])
    const [hasMore, setHasMore] = React.useState(true)

    const teamList = useFetch<TeamListResponseInterface>(
        `${GetEndpointUrl.GetAdminTeamList}?pageIndex=${pageIndex}&pageSize=20`
    )
    const post = usePost()
    const { t } = useTranslation()

    React.useEffect(() => {
        if (teamList.data?.data) {
            if (pageIndex === 0) {
                setAllTeams(teamList.data.data)
            } else {
                setAllTeams(prev => {
                    const newTeams = teamList.data!.data.filter(
                        nt => !prev.some(pt => pt.team_uuid === nt.team_uuid)
                    )
                    return [...prev, ...newTeams]
                })
            }
            setHasMore(teamList.data.has_more)
        }
    }, [teamList.data, pageIndex])

    const handleLoadMore = () => {
        if (!teamList.isLoading && hasMore) {
            setPageIndex(prev => prev + 1)
        }
    }

    const handleDelete = (uuid: string) => {
        if (!uuid || post.isSubmitting) return

        // Optimistic Update
        const previousTeams = [...allTeams]
        setAllTeams(prev => prev.map(t => 
            t.team_uuid === uuid ? { ...t, team_deleted_at: new Date().toISOString() } : t
        ))

        post.makeRequest<TeamDeleteOrUndeleteInterface>({
            apiEndpoint: PostEndpointUrl.RemoveTeam,
            payload: {
                team_uuid: uuid
            }
        }).catch(() => {
            setAllTeams(previousTeams)
        })
    }

    const handleUnDelete = async (uuid: string) => {
        if (!uuid || post.isSubmitting) return

        // Optimistic Update
        const previousTeams = [...allTeams]
        setAllTeams(prev => prev.map(t => 
            t.team_uuid === uuid ? { ...t, team_deleted_at: "0001-01-01T00:00:00Z" } : t
        ))

        post.makeRequest<TeamDeleteOrUndeleteInterface>({
            apiEndpoint: PostEndpointUrl.UnDeletedTeam,
            payload: {
                team_uuid: uuid
            }
        }).catch(() => {
            setAllTeams(previousTeams)
        })
    }

    return (
        <Card className="w-full border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 pb-6">
                <div className="flex items-center gap-2 mb-1">
                    <div className="bg-primary/10 p-1.5 rounded-md">
                        <Users className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold tracking-tight">
                        Team Management
                    </CardTitle>
                </div>
                <CardDescription className="text-sm text-muted-foreground">
                    View and manage all organization teams and their lifecycle.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
                <AdminTeamList 
                    teams={allTeams} 
                    onDelete={handleDelete} 
                    onUnDelete={handleUnDelete}
                    isSubmitting={post.isSubmitting}
                    onLoadMore={handleLoadMore}
                    hasMore={hasMore}
                    isLoading={teamList.isLoading}
                />
            </CardContent>
        </Card>
    );
};

export default TeamsCard;