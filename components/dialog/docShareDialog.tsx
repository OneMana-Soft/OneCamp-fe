import { displayNameOf } from "@/lib/personName"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useMemo } from "react";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { UserProfileDataInterface } from "@/types/user";
import { DocInfoInterface, DocInfoResponse } from "@/types/doc";
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

type Role = "editor" | "viewer" | "commenter";

const ROLES: ShareRole[] = [
    { value: "editor", label: "Can edit" },
    { value: "commenter", label: "Can comment" },
    { value: "viewer", label: "Can view" },
]

const LIST_OF: Record<Role, "doc_editing_users" | "doc_commenting_users" | "doc_reading_users"> = {
    editor: "doc_editing_users",
    commenter: "doc_commenting_users",
    viewer: "doc_reading_users",
}
const ADD_KEY: Record<Role, string> = { editor: "add_editors", commenter: "add_commenters", viewer: "add_viewers" }
const REMOVE_KEY: Record<Role, string> = { editor: "remove_editors", commenter: "remove_commenters", viewer: "remove_viewers" }

const ACCESS_OPTIONS: { value: GeneralAccess; label: string; description: string }[] = [
    { value: "restricted", label: GENERAL_ACCESS_LABEL.restricted, description: "Only the people above can open it." },
    { value: "public", label: GENERAL_ACCESS_LABEL.public, description: "Everyone signed in can find it and read it." },
    { value: "public_comment", label: GENERAL_ACCESS_LABEL.public_comment, description: "Everyone signed in can read it and comment." },
]

interface DocShareDialogProps {
  dialogOpenState: boolean;
  setOpenState: () => void;
  docId?: string;
}

/**
 * Share a doc (content.md D18): one token input with the role inside it, the
 * people with access as 44 px rows whose role is a menu (Remove access is in
 * it), general access and "Anyone with the link" as two cards, and a footer
 * with Copy link and Done. Only Invite is primary, and only while someone is
 * picked.
 */
export function DocShareDialog({ dialogOpenState, setOpenState, docId: propDocId }: DocShareDialogProps) {
    const reduxDocId = useSelector((state: RootState) => state.ui.docShare.docId);
    const docId = propDocId || reduxDocId;

    const { data: permData } = useFetch<DocInfoResponse>(
        dialogOpenState && docId ? `${GetEndpointUrl.GetDocPermissions}?doc_uuid=${docId}` : ''
    );
    // The title, from the doc itself: the permissions answer doesn't carry it.
    // The same key the doc page asks for, so SWR answers from its cache.
    const { data: docInfo } = useFetch<DocInfoResponse>(dialogOpenState && docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    const [permissions, setPermissions] = useState<DocInfoInterface | undefined>(undefined);
    useEffect(() => {
        if (permData?.data) setPermissions(permData.data);
    }, [permData]);

    const updatePermissions = usePost();
    const updateDoc = usePost();
    const searchUser = usePost();

    const selfProfile = useFetchOnlyOnce<{ data?: UserProfileDataInterface }>(GetEndpointUrl.SelfProfile);
    const currentUser = selfProfile?.data?.data;
    const isOwner = !!permissions && permissions.doc_created_by?.user_uuid === currentUser?.user_uuid;
    // Sharing externally is for owners and editors; the backend says the same.
    const canShareExternally = isOwner || !!permissions?.doc_editing_users?.some(u => u.user_uuid === currentUser?.user_uuid);
    const ownerId = permissions?.doc_created_by?.user_uuid

    /** Puts a person in one role list (or none), in the dialog's copy. */
    const placeIn = useCallback((user: UserProfileDataInterface, role: Role | null) => {
        setPermissions(prev => {
            if (!prev) return prev;
            const without = (l?: UserProfileDataInterface[]) => (l ?? []).filter(u => u.user_uuid !== user.user_uuid);
            const next = { ...prev, doc_editing_users: without(prev.doc_editing_users), doc_commenting_users: without(prev.doc_commenting_users), doc_reading_users: without(prev.doc_reading_users) };
            if (role) next[LIST_OF[role]] = [...next[LIST_OF[role]], user];
            return next;
        });
    }, []);

    const send = useCallback(async (payload: Record<string, unknown>) => {
        // It throws on failure; each caller says what didn't happen.
        await updatePermissions.makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDocPermissions,
            payload: { doc_uuid: docId, ...payload },
            quiet: true,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usePost's object changes each render
    }, [docId]);

    const handleInvite = async (users: UserProfileDataInterface[], role: string) => {
        if (!isOwner || !docId) return;
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
        if (!docId || !isOwner) return;
        const isPrivate = val === "restricted";
        const isPublicComment = val === "public_comment";
        const before = permissions
        setPermissions(prev => prev ? { ...prev, doc_private: isPrivate, doc_public_comment: isPublicComment } : prev);
        try {
            await updateDoc.makeRequest({
                apiEndpoint: PostEndpointUrl.UpdateDoc,
                payload: { doc_uuid: docId, doc_private: isPrivate, doc_public_comment: isPublicComment },
                quiet: true,
            });
        } catch {
            setPermissions(before)
            toast({ title: "Couldn't change who can open it", variant: "destructive" })
        }
    };

    const search = useCallback(async (q: string) => {
        const res = await searchUser.makeRequest<{ searchText: string }, UserProfileDataInterface[]>({
            apiEndpoint: PostEndpointUrl.SearchUserForDoc,
            payload: { searchText: q },
            quiet: true,
        });
        return Array.isArray(res) ? res : []
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usePost's object changes each render
    }, []);

    const people = useMemo(() => {
        const rows: { user: UserProfileDataInterface; role: Role }[] = []
        for (const role of ["editor", "commenter", "viewer"] as Role[]) {
            for (const u of withoutOwner(permissions?.[LIST_OF[role]], ownerId)) rows.push({ user: u, role })
        }
        return rows
    }, [permissions, ownerId])
    const existing = useMemo(() => new Set([ownerId, ...people.map(p => p.user.user_uuid)].filter(Boolean) as string[]), [ownerId, people])

    const generalAccess: GeneralAccess = permissions?.doc_private === false ? (permissions.doc_public_comment ? "public_comment" : "public") : "restricted";
    const title = (docInfo?.data?.doc_title || permissions?.doc_title)?.trim()

    return (
        <Dialog open={dialogOpenState} onOpenChange={(open) => !open && setOpenState()}>
            <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[480px]" data-share-dialog="doc">
                <DialogHeader className="px-5 pb-0 pt-5 pr-12 text-start">
                    <DialogTitle className="truncate text-title-3 text-ink">{title ? `Share “${title}”` : "Share doc"}</DialogTitle>
                    <DialogDescription className="text-ui-sm text-ink-2">People you add get an email and a link.</DialogDescription>
                </DialogHeader>

                <div className="flex max-h-[min(70dvh,560px)] flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
                    {isOwner && docId ? (
                        <ShareTokenInvite search={search} roles={ROLES} defaultRole="editor" existing={existing} onInvite={handleInvite} />
                    ) : null}

                    <section className="flex flex-col gap-1.5">
                        <ShareHeading>People with access</ShareHeading>
                        <div className="flex flex-col">
                            {permissions?.doc_created_by && (
                                <ShareUserRow user={permissions.doc_created_by} role="owner" roles={ROLES} canEdit={false} />
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
                            description={generalAccessLine(generalAccess, "doc")}
                            options={ACCESS_OPTIONS}
                            value={generalAccess}
                            onChange={(v) => void handlePrivacyChange(v)}
                            disabled={!isOwner}
                        />
                        {docId && <GuestLinkSection card resourceType="doc" resourceId={docId} canShare={canShareExternally} />}
                    </section>
                </div>
                <ShareFooter onDone={setOpenState} />
            </DialogContent>
        </Dialog>
    );
}
