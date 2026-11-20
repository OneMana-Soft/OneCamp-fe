"use client"

import { displayNameOf } from "@/lib/personName"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch"
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { BoardsGet, BoardsPost } from "@/services/endpoints/boards";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { saidHere } from "@/lib/http/saidHere"
import { ACCESS_LEVEL_LABEL } from "@/lib/docAccess"
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { BoardInfoInterface } from "@/types/board";
import { GuestLinkSection } from "@/components/guest/GuestLinkSection";
import { BoardEmbedRow } from "@/components/guest/BoardEmbedRow";
import {
  AccessCard,
  GENERAL_ACCESS_LABEL,
  GeneralAccessMark,
  ShareFooter,
  ShareHeading,
  ShareTokenInvite,
  ShareUserRow,
  generalAccessLine,
  withoutOwner,
  type GeneralAccess,
  type ShareRole,
} from "@/components/dialog/shareParts";

// A board's roles (miro-32), one each: co-owners (each an editor too, so listed
// first and once), Can edit, Can comment, Can view.
type Role = "co_owner" | "editor" | "commenter" | "viewer"

const ROLES: (ShareRole & { value: Role })[] = [
  { value: "co_owner", label: "Co-owner" },
  { value: "editor", label: ACCESS_LEVEL_LABEL.edit },
  { value: "commenter", label: ACCESS_LEVEL_LABEL.comment },
  { value: "viewer", label: ACCESS_LEVEL_LABEL.view },
]
/** The roles below co-owner: what a co-owner gives, and what an editor invites at (up to Can edit). */
const BELOW = ROLES.slice(1)
type RoleList = "board_owning_users" | "board_editing_users" | "board_commenting_users" | "board_reading_users"
const LIST_OF: Record<Role, RoleList> = { co_owner: "board_owning_users", editor: "board_editing_users", commenter: "board_commenting_users", viewer: "board_reading_users" }
/** updateBoardPermissions's add_<key> and remove_<key>. */
const KEY: Record<Role, string> = { co_owner: "co_owners", editor: "editors", commenter: "commenters", viewer: "viewers" }

/** getBoardPermissions's answer: the people in each role, and the editors-may-share switch (absent is on). */
interface BoardSharing extends BoardInfoInterface {
  board_owning_users?: UserProfileDataInterface[]
  board_editors_share?: boolean
}
/** What getBoardInfo offers the reader: sharing it, and its owner's and co-owners' settings. The server checks both. */
interface BoardOffers {
  board_can_share?: boolean
  board_can_manage?: boolean
}

const ACCESS_OPTIONS: { value: GeneralAccess; label: string; description: string }[] = [
  { value: "restricted", label: GENERAL_ACCESS_LABEL.restricted, description: "Only the people above can open it." },
  { value: "public", label: GENERAL_ACCESS_LABEL.public, description: "Everyone signed in can find it and look." },
]

/** What didn't happen, and why in the server's words (a refusal's 403), never a bare "couldn't". */
const failed = (title: string, e: unknown) => toast({ title, description: saidHere(e, "Try again in a moment."), variant: "destructive" })

interface BoardShareDialogProps {
  dialogOpenState: boolean;
  setOpenState: () => void;
  boardId: string;
}

/**
 * Share a board: the doc's share dialog (D18) on the board's roles (miro-32).
 * Its owner gives every role and makes co-owners; a co-owner gives the roles
 * below co-owner and sets general access and the editors-may-share switch; an
 * editor invites, up to Can edit, while the switch is on, and otherwise only
 * sees who has it. The server checks every change.
 */
export function BoardShareDialog({ dialogOpenState, setOpenState, boardId }: BoardShareDialogProps) {
  const { data: permData } = useFetch<{ data?: BoardSharing }>(
    dialogOpenState && boardId ? `${BoardsGet.GetBoardPermissions}?board_uuid=${boardId}` : ''
  );
  // The board page's own read: what it offers this reader.
  const offers = useFetch<{ data?: BoardOffers }>(dialogOpenState && boardId ? `${GetEndpointUrl.GetBoardInfo}/${boardId}` : "").data?.data
  const [permissions, setPermissions] = useState<BoardSharing | undefined>(undefined);
  useEffect(() => {
    if (permData?.data) setPermissions(permData.data);
  }, [permData]);

  const updatePermissions = usePost();
  const updateBoard = usePost();
  const searchUser = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  const currentUser = selfProfile?.data?.data;
  const ownerId = permissions?.board_created_by?.user_uuid
  const isOwner = !!ownerId && ownerId === currentUser?.user_uuid;
  const canManage = isOwner || !!offers?.board_can_manage
  const canShare = canManage || !!offers?.board_can_share
  const editorsShare = permissions?.board_editors_share !== false
  // The owner changes anyone's role; a co-owner, anyone's below co-owner.
  const mayChange = (role: Role) => isOwner || (canManage && role !== "co_owner")

  const placeIn = useCallback((user: UserProfileDataInterface, role: Role | null) => {
    setPermissions(prev => {
      if (!prev) return prev;
      const next = { ...prev }
      for (const r of ROLES) next[LIST_OF[r.value]] = (prev[LIST_OF[r.value]] ?? []).filter(u => u.user_uuid !== user.user_uuid)
      if (role) next[LIST_OF[role]] = [...(next[LIST_OF[role]] ?? []), user]
      return next;
    });
  }, []);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    // It throws on failure; each caller says what didn't happen.
    await updatePermissions.makeRequest({ apiEndpoint: PostEndpointUrl.UpdateBoardPermissions, payload: { board_uuid: boardId, ...payload }, quiet: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- usePost's object changes each render
  }, [boardId]);

  // An invite's failure is said in the invite's own row (ShareTokenInvite).
  const handleInvite = async (users: UserProfileDataInterface[], role: string) => {
    if (!canShare || !boardId) return;
    const r = role as Role
    await send({ [`add_${KEY[r]}`]: users.map(u => u.user_uuid) })
    users.forEach(u => placeIn(u, r))
    toast({ title: users.length === 1 ? `${displayNameOf(users[0])} can open it now` : `${users.length} people can open it now` });
  };

  // One role each: the server takes them out of their other role (a co-owner given another stops being one).
  const handleRoleChange = async (user: UserProfileDataInterface, from: Role, to: Role) => {
    placeIn(user, to)
    try {
      await send({ [`add_${KEY[to]}`]: [user.user_uuid] })
    } catch (e) {
      placeIn(user, from)
      failed("Couldn't change their access", e)
    }
  };

  const handleRemove = async (user: UserProfileDataInterface, role: Role) => {
    placeIn(user, null)
    try {
      // A co-owner is an editor too: taking their access away takes both.
      await send(role === "co_owner" ? { remove_co_owners: [user.user_uuid], remove_editors: [user.user_uuid] } : { [`remove_${KEY[role]}`]: [user.user_uuid] })
    } catch (e) {
      placeIn(user, role)
      failed("Couldn't remove their access", e)
    }
  };

  const setBoard = async (change: Partial<BoardSharing>, what: string) => {
    if (!boardId || !canManage) return;
    const before = permissions
    setPermissions(prev => (prev ? { ...prev, ...change } : prev));
    try {
      await updateBoard.makeRequest({ apiEndpoint: BoardsPost.UpdateBoard, payload: { board_uuid: boardId, ...change }, quiet: true });
    } catch (e) {
      setPermissions(before)
      failed(what, e)
    }
  };

  const search = useCallback(async (q: string) => {
    const res = await searchUser.makeRequest<{ searchText: string }, UserProfileDataInterface[]>({
      apiEndpoint: BoardsPost.SearchUserForBoard,
      payload: { searchText: q },
      quiet: true,
    });
    return Array.isArray(res) ? res : []
  // eslint-disable-next-line react-hooks/exhaustive-deps -- usePost's object changes each render
  }, []);

  const people = useMemo(() => {
    // A co-owner is in the editors' list too: each person once, in their highest role.
    const rows: { user: UserProfileDataInterface; role: Role }[] = []
    const seen = new Set<string>()
    for (const { value: role } of ROLES) {
      for (const u of withoutOwner(permissions?.[LIST_OF[role]], ownerId)) {
        if (seen.has(u.user_uuid)) continue
        seen.add(u.user_uuid)
        rows.push({ user: u, role })
      }
    }
    return rows
  }, [permissions, ownerId])
  const existing = useMemo(() => new Set([ownerId, ...people.map(p => p.user.user_uuid)].filter(Boolean) as string[]), [ownerId, people])

  const generalAccess: GeneralAccess = permissions?.board_private === false ? "public" : "restricted";
  const title = permissions?.board_title?.trim()

  return (
    <Dialog open={dialogOpenState} onOpenChange={(open) => !open && setOpenState()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[480px]" data-share-dialog="board">
        <DialogHeader className="px-5 pb-0 pt-5 pr-12 text-start">
          <DialogTitle className="truncate text-title-3 text-ink">{title ? `Share “${title}”` : "Share board"}</DialogTitle>
          <DialogDescription className="text-ui-sm text-ink-2">{canManage ? "People you add get an email and a link." : canShare ? "You can invite people, up to Can edit." : "Only its owner and co-owners change who has it."}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(70dvh,560px)] flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
          {canShare && boardId ? (
            <ShareTokenInvite search={search} roles={isOwner ? ROLES : BELOW} defaultRole="editor" existing={existing} onInvite={handleInvite} />
          ) : permissions && !editorsShare ? (
            <p className="text-ui-sm text-ink-2" data-share-off="">The board&apos;s owner has turned off sharing by editors.</p>
          ) : null}

          <section className="flex flex-col gap-1.5">
            <ShareHeading>People with access</ShareHeading>
            <div className="flex flex-col">
              {permissions?.board_created_by && (
                <ShareUserRow user={permissions.board_created_by} role="owner" roles={ROLES} canEdit={false} />
              )}
              {people.map(({ user, role }) => (
                <div key={user.user_uuid} className="content-row-in">
                  <ShareUserRow
                    user={user}
                    role={role}
                    roles={mayChange(role) && !isOwner ? BELOW : ROLES}
                    canEdit={mayChange(role)}
                    onRoleChange={(to) => void handleRoleChange(user, role, to as Role)}
                    onRemove={() => void handleRemove(user, role)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <ShareHeading>General access</ShareHeading>
            <AccessCard
              tile={<GeneralAccessMark value={generalAccess} />}
              label={GENERAL_ACCESS_LABEL[generalAccess]}
              description={generalAccessLine(generalAccess, "board")}
              options={ACCESS_OPTIONS}
              value={generalAccess}
              onChange={(v) => void setBoard({ board_private: v === "restricted" }, "Couldn't change who can open it")}
              disabled={!canManage}
            />
            {canManage ? (
              <label className="flex items-center gap-3 rounded-xl px-1 py-1.5" data-editors-share="">
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-sm text-ink">Editors can share</span>
                  <span className="block text-meta text-ink-3">They can invite people, up to Can edit.</span>
                </span>
                <Switch checked={editorsShare} onCheckedChange={(on) => void setBoard({ board_editors_share: on }, "Couldn't change who can share it")} aria-label="Editors can share" />
              </label>
            ) : null}
            {/* A board's links are its owner's and co-owners' alone (miro-33 M-4): the server refuses an editor's. */}
            {boardId && canManage && <GuestLinkSection card resourceType="board" resourceId={boardId} canShare extra={(link, password) => <BoardEmbedRow link={link} name={title} password={password} />} />}
          </section>
        </div>
        <ShareFooter onDone={setOpenState} />
      </DialogContent>
    </Dialog>
  );
}
