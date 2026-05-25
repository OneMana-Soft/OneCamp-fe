"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { TeamDeleteOrUndeleteInterface, TeamListResponseInterface, TeamInfoInterface } from "@/types/team"
import { usePost } from "@/hooks/usePost"
import { AdminTeamList } from "./AdminTeamList"
import { Users, Search } from "@/lib/icons"

const TeamsCard = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [allTeams, setAllTeams] = useState<TeamInfoInterface[]>([])
    const [hasMore, setHasMore] = useState(true)
    const [search, setSearch] = useState("")

    const teamList = useFetch<TeamListResponseInterface>(
        `${GetEndpointUrl.GetAdminTeamList}?pageIndex=${pageIndex}&pageSize=20`
    )
    const post = usePost()

    useEffect(() => {
        if (teamList.data?.data) {
            if (pageIndex === 0) {
                setAllTeams(teamList.data.data)
            } else {
                setAllTeams((prev) => {
                    const newTeams = teamList.data!.data.filter(
                        (nt) => !prev.some((pt) => pt.team_uuid === nt.team_uuid)
                    )
                    return [...prev, ...newTeams]
                })
            }
            setHasMore(teamList.data.has_more)
        }
    }, [teamList.data, pageIndex])

    const handleLoadMore = () => {
        if (!teamList.isLoading && hasMore) {
            setPageIndex((prev) => prev + 1)
        }
    }

    const handleDelete = (uuid: string) => {
        if (!uuid || post.isSubmitting) return
        const previous = allTeams
        setAllTeams((prev) =>
            prev.map((t) =>
                t.team_uuid === uuid ? { ...t, team_deleted_at: new Date().toISOString() } : t
            )
        )
        post.makeRequest<TeamDeleteOrUndeleteInterface>({
            apiEndpoint: PostEndpointUrl.RemoveTeam,
            payload: { team_uuid: uuid },
        }).catch(() => setAllTeams(previous))
    }

    const handleUnDelete = (uuid: string) => {
        if (!uuid || post.isSubmitting) return
        const previous = allTeams
        setAllTeams((prev) =>
            prev.map((t) =>
                t.team_uuid === uuid ? { ...t, team_deleted_at: "0001-01-01T00:00:00Z" } : t
            )
        )
        post.makeRequest<TeamDeleteOrUndeleteInterface>({
            apiEndpoint: PostEndpointUrl.UnDeletedTeam,
            payload: { team_uuid: uuid },
        }).catch(() => setAllTeams(previous))
    }

    const normalisedSearch = search.trim().toLowerCase()
    const filteredTeams = useMemo(() => {
        if (!normalisedSearch) return allTeams
        return allTeams.filter((t) =>
            (t.team_name || "").toLowerCase().includes(normalisedSearch)
        )
    }, [allTeams, normalisedSearch])

    return (
        <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 pb-4 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="bg-primary/10 p-1.5 rounded-md">
                                <Users className="h-4 w-4 text-primary" />
                            </div>
                            <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                                Team Management
                            </CardTitle>
                            <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                                {allTeams.length}
                                {hasMore ? "+" : ""}
                            </span>
                        </div>
                        <CardDescription className="text-sm text-muted-foreground">
                            View and manage all organization teams and their lifecycle.
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-72 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            type="search"
                            placeholder="Search teams..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-background/50"
                            aria-label="Search teams"
                        />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="px-0 flex-1 min-h-0 flex flex-col">
                <AdminTeamList
                    teams={filteredTeams}
                    onDelete={handleDelete}
                    onUnDelete={handleUnDelete}
                    isSubmitting={post.isSubmitting}
                    onLoadMore={handleLoadMore}
                    hasMore={hasMore && !normalisedSearch}
                    isLoading={teamList.isLoading}
                    isFiltered={!!normalisedSearch}
                    totalLoaded={allTeams.length}
                />
            </CardContent>
        </Card>
    )
}

export default TeamsCard
