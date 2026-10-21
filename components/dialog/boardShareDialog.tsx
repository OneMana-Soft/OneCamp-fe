"use client"

import { displayNameOf } from "@/lib/personName"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { BoardsGet, BoardsPost } from "@/services/endpoints/boards";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { BoardInfoInterface, BoardInfoResponse } from "@/types/board";
import { GuestLinkSection } from "@/components/guest/GuestLinkSection";
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

type Role = "editor" | "viewer";

const ROLES: ShareRole[] = [
  { value: "editor", label: "Can edit" },
  { value: "viewer", label: "Can view" },
]
const LIST_OF: Record<Role, "board_editing_users" | "board_reading_users"> = { editor: "board_editing_users", viewer: "board_reading_users" }
const ADD_KEY: Record<Role, string> = { editor: "add_editors", viewer: "add_viewers" }
const REMOVE_KEY: Record<Role, string> = { editor: "remove_editors", viewer: "remove_viewers" }

const ACCESS_OPTIONS: { value: GeneralAccess; label: string; description: string }[] = [
  { value: "restricted", label: GENERAL_ACCESS_LABEL.restricted, description: "Only the people above can open it." },
  { value: "public", label: GENERAL_ACCESS_LABEL.public, description: "Everyone signed in can find it and look." },
]

interface BoardShareDialogProps {
  dialogOpenState: boolean;
  setOpenState: () => void;
  boardId: string;
}

/** Share a board: the doc's share dialog (D18), with edit and view as the roles. */
export function BoardShareDialog({ dialogOpenState, setOpenState, boardId }: BoardShareDialogProps) {
  const { data: permData } = useFetch<BoardInfoResponse>(
    dialogOpenState && boardId ? `${BoardsGet.GetBoardPermissions}?board_uuid=${boardId}` : ''
  );
  const [permissions, setPermissions] = useState<BoardInfoInterface | undefined>(undefined);
  useEffect(() => {
    if (permData?.data) setPermissions(permData.data);
  }, [permData]);

  const updatePermissions = usePost();
  const updateBoard = usePost();
  const searchUser = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  const currentUser = selfProfile?.data?.data;
  const isOwner = !!permissions && permissions.board_created_by?.user_uuid === currentUser?.user_uuid;
  // External sharing is for owners and editors; the backend says the same.
  const canShareExternally = isOwner || !!permissions?.board_editing_users?.some(u => u.user_uuid === currentUser?.user_uuid);
  const ownerId = permissions?.board_created_by?.user_uuid

  const placeIn = useCallback((user: UserProfileDataInterface, role: Role | null) => {
    setPermissions(prev => {
      if (!prev) return prev;
      const without = (l?: UserProfileDataInterface[]) => (l ?? []).filter(u => u.user_uuid !== user.user_uuid);
      const next = { ...prev, board_editing_users: without(prev.board_editing_users), board_reading_users: without(prev.board_reading_users) };
      if (role) next[LIST_OF[role]] = [...next[LIST_OF[role]], user];
      return next;
    });
  }, []);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    // It throws on failure; each caller says what didn't happen.
    await updatePermissions.makeRequest({ apiEndpoint: PostEndpointUrl.UpdateBoardPermissions, payload: { board_uuid: boardId, ...payload }, quiet: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- usePost's object changes each render
  }, [boardId]);

  const handleInvite = async (users: UserProfileDataInterface[], role: string) => {
    if (!isOwner || !boardId) return;
    const r = role as Role
    await send({ [ADD_KEY[r]]: users.map(u => u.user_uuid) })
    users.forEach(u => placeIn(u, r))
    toast({ title: users.length === 1 ? `${displayNameOf(users[0])} can open it now` : `${users.length} people can open it now` });
  };

  const handleRoleChange = async (user: UserProfileDataInterface, from: Role, to: Role) => {
    placeIn(user, to)
    try {
      await send({ [REMOVE_KEY[from]]: [user.user_uuid], [ADD_KEY[to]]: [user.user_uuid] })
    } catch {
      placeIn(user, from)
      toast({ title: "Couldn't change their access", variant: "destructive" })
    }
  };

  const handleRemove = async (user: UserProfileDataInterface, role: Role) => {
    placeIn(user, null)
    try {
      await send({ [REMOVE_KEY[role]]: [user.user_uuid] })
    } catch {
      placeIn(user, role)
      toast({ title: "Couldn't remove their access", variant: "destructive" })
    }
  };

  const handlePrivacyChange = async (val: string) => {
    if (!boardId || !isOwner) return;
    const isPrivate = val === "restricted";
    const before = permissions
    setPermissions(prev => (prev ? { ...prev, board_private: isPrivate } : prev));
    try {
      await updateBoard.makeRequest({ apiEndpoint: BoardsPost.UpdateBoard, payload: { board_uuid: boardId, board_private: isPrivate }, quiet: true });
    } catch {
      setPermissions(before)
      toast({ title: "Couldn't change who can open it", variant: "destructive" })
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
    const rows: { user: UserProfileDataInterface; role: Role }[] = []
    for (const role of ["editor", "viewer"] as Role[]) {
      for (const u of withoutOwner(permissions?.[LIST_OF[role]], ownerId)) rows.push({ user: u, role })
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
          <DialogDescription className="text-ui-sm text-ink-2">People you add get an email and a link.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(70dvh,560px)] flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
          {isOwner && boardId ? (
            <ShareTokenInvite search={search} roles={ROLES} defaultRole="editor" existing={existing} onInvite={handleInvite} />
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
                    roles={ROLES}
                    canEdit={isOwner}
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
              onChange={(v) => void handlePrivacyChange(v)}
              disabled={!isOwner}
            />
            {boardId && <GuestLinkSection card resourceType="board" resourceId={boardId} canShare={canShareExternally} />}
          </section>
        </div>
        <ShareFooter onDone={setOpenState} />
      </DialogContent>
    </Dialog>
  );
}
