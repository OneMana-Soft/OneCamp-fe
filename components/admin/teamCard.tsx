"use client"

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { openUI } from "@/store/slice/uiSlice"
import type { RootState } from "@/store/store"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { TeamDeleteOrUndeleteInterface, TeamListResponseInterface, TeamInfoInterface } from "@/types/team"
import { usePost } from "@/hooks/usePost"
import { useConfirm } from "@/hooks/useConfirm"
import { AdminTeamList } from "./AdminTeamList"
import { Plus, Users } from "@/lib/icons"
import { PeopleAction, PeopleFirstRun, PeopleFrame, PeopleNoMatch, peopleCount, quoted } from "./PeopleFrame"

const TeamsCard = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [allTeams, setAllTeams] = useState<TeamInfoInterface[]>([])
    const [hasMore, setHasMore] = useState(true)
    const [search, setSearch] = useState("")

    const teamList = useFetch<TeamListResponseInterface>(
        `${GetEndpointUrl.GetAdminTeamList}?pageIndex=${pageIndex}&pageSize=20`
    )
    const post = usePost()
    const dispatch = useDispatch()
    const newTeam = () => dispatch(openUI({ key: "createTeam" }))

    // The app's create dialog adds the team elsewhere (the sidebar), so this
    // list is fetched again once the dialog closes; the new team appeared
    // here only after a reload.
    const createOpen = useSelector((state: RootState) => state.ui.createTeam.isOpen)
    const wasOpen = useRef(createOpen)
    useEffect(() => {
        if (wasOpen.current && !createOpen) {
            setPageIndex(0)
            void teamList.mutate()
        }
        wasOpen.current = createOpen
    }, [createOpen, teamList])

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

    // Confirmed, because this is a one-click, optimistic delete of a whole team: the
    // row disappears the instant the cursor lands, so an accidental click looks
    // exactly like an intentional one and there is no undo in the UI. Naming the
    // team in the prompt is the point — "are you sure?" is not a question anyone
    // can answer, "Delete Design?" is.
    const confirm = useConfirm()
    const handleDelete = (uuid: string) => {
        if (!uuid || post.isSubmitting) return
        const team = allTeams.find((t) => t.team_uuid === uuid)
        confirm({
            title: team?.team_name ? `Delete the team ${team.team_name}?` : "Delete this team?",
            description:
                "Its channels and projects stay, but the team is removed from the workspace. You can restore it from this list afterwards.",
            confirmText: "Delete team",
            destructive: true,
            onConfirm: () => deleteTeam(uuid),
        })
    }

    const deleteTeam = (uuid: string) => {
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

    const loaded = allTeams.length > 0 || !teamList.isLoading
    let state: ReactNode = undefined
    // Before the empty branch: a failed request leaves the list empty too.
    if (allTeams.length === 0 && teamList.isError) {
        state = <ErrorState subject="the teams" onRetry={() => void teamList.mutate()} />
    } else if (loaded && filteredTeams.length === 0) {
        state = normalisedSearch ? (
            <PeopleNoMatch
                icon={Users}
                title={`No teams match ${quoted(search)}`}
                hint="Check the spelling, or try part of the name."
                onClear={() => setSearch("")}
            />
        ) : (
            // No teams at all is a first run, so it is welcomed, with the one
            // thing to do about it.
            <PeopleFirstRun
                title="No teams yet"
                description="Teams group the people who work together, with their own channels and projects."
                action={
                    <Button variant="outline" size="sm" onClick={newTeam}>
                        New team
                    </Button>
                }
            />
        )
    }

    return (
        <PeopleFrame
            title="Teams"
            count={peopleCount({ shown: filteredTeams.length, total: allTeams.length, more: hasMore, filtering: !!normalisedSearch, loaded })}
            description="The groups people work in here."
            search={{ value: search, onChange: setSearch, placeholder: "Search teams…", label: "Search teams", name: "team-search" }}
            // The tab's one action. There was no way to make a team from here,
            // though the app has the dialog for it.
            action={
                <PeopleAction icon={Plus} onClick={newTeam}>
                    New team
                </PeopleAction>
            }
            loading={allTeams.length === 0 && teamList.isLoading && !teamList.isError}
            loadingLabel="Loading teams"
            leading="tile"
            state={state}
        >
            <AdminTeamList
                teams={filteredTeams}
                onDelete={handleDelete}
                onUnDelete={handleUnDelete}
                isSubmitting={post.isSubmitting}
                onLoadMore={handleLoadMore}
                hasMore={hasMore && !normalisedSearch}
                isLoading={teamList.isLoading}
            />
        </PeopleFrame>
    )
}

export default TeamsCard
