import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { Lock, Globe, Copy, Check, User as UserIcon, X } from "lucide-react";
import { cn } from "@/lib/utils/helpers/cn";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { UserProfileDataInterface } from "@/types/user";
import { DocInfoInterface, DocInfoResponse } from "@/types/doc";
import AddDocMemberCombobox from "@/components/combobox/addDocMemberCombobox";

type Role = "editor" | "viewer" | "commenter";

interface DocShareDialogProps {
  dialogOpenState: boolean;
  setOpenState: () => void;
  docId?: string;
}

export function DocShareDialog({ dialogOpenState, setOpenState, docId: propDocId }: DocShareDialogProps) {
    const dispatch = useDispatch();
    const reduxDocId = useSelector((state: RootState) => state.ui.docShare.docId);
    const docId = propDocId || reduxDocId;
    console.log("DocShareDialog rendered, docId:", docId, "prop:", propDocId, "redux:", reduxDocId);
    
    // Fetch Permissions
    const { data: permData, mutate: refreshPermissions, isLoading } = useFetch<DocInfoResponse>(
        dialogOpenState && docId ? `${GetEndpointUrl.GetDocPermissions}?doc_uuid=${docId}` : ''
    );

    const [permissions, setPermissions] = useState<DocInfoInterface | undefined>(undefined);

    useEffect(() => {
        if (permData?.data) {
            setPermissions(permData.data);
        }
    }, [permData]);

    const [copied, setCopied] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const updatePermissions = usePost();
    const updateDoc = usePost();

    const handleClose = () => {
        setOpenState();
    };

    // Get Current User for Access Checks
    const selfProfile = useFetchOnlyOnce<any>(GetEndpointUrl.SelfProfile);
    const currentUser = selfProfile?.data?.data;
    const isOwner = permissions?.doc_created_by?.user_uuid === currentUser?.user_uuid;

    // Actions
    const handleInvite = async (user: UserProfileDataInterface, role: Role) => {
        if (!isOwner || !docId) return;
        
        setIsUpdating(true);
        const payload: any = { doc_uuid: docId };
        
        const roleKey = role === 'editor' ? 'doc_editing_users' : role === 'viewer' ? 'doc_reading_users' : 'doc_commenting_users';

        if (role === 'editor') payload.add_editors = [user.user_uuid];
        if (role === 'viewer') payload.add_viewers = [user.user_uuid];
        if (role === 'commenter') payload.add_commenters = [user.user_uuid];

        await updatePermissions.makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDocPermissions,
            payload,
            onSuccess: () => {
                setIsUpdating(false);
                
                // Update local state and enforce single role
                setPermissions(prev => {
                    if (!prev) return prev;
                    
                    // Remove from all other lists first
                    const removeFromList = (list: UserProfileDataInterface[] | undefined) => list?.filter(u => u.user_uuid !== user.user_uuid) || [];
                    
                    const newEditing = roleKey === 'doc_editing_users' ? [...(prev.doc_editing_users || []), user] : removeFromList(prev.doc_editing_users);
                    const newReading = roleKey === 'doc_reading_users' ? [...(prev.doc_reading_users || []), user] : removeFromList(prev.doc_reading_users);
                    const newCommenting = roleKey === 'doc_commenting_users' ? [...(prev.doc_commenting_users || []), user] : removeFromList(prev.doc_commenting_users);

                    return {
                        ...prev,
                        doc_editing_users: newEditing,
                        doc_reading_users: newReading,
                        doc_commenting_users: newCommenting
                    };
                });

                toast({ title: "Success", description: `Added ${user.user_name} as ${role}` });
            },
            showToast: true
        });
    };
    
    // Privacy Toggle
    const handlePrivacyChange = async (val: string) => {
        if (!docId || !isOwner) return;
        setIsUpdating(true);
        
        const isPrivate = val === "restricted";
        const isPublicComment = val === "public_comment";
        const isPublicView = val === "public";

        const payload = {
            doc_uuid: docId,
            doc_private: isPrivate,
            doc_public_comment: isPublicComment
        };

        await updateDoc.makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: payload,
            onSuccess: () => {
                setIsUpdating(false);
                setPermissions(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        doc_private: isPrivate,
                        doc_public_comment: isPublicComment
                    };
                });
            },
            showToast: true
        });
    };

    // Remove User Access
    const handleRemoveUser = async (userUuid: string, role: string) => {
        if (!docId || !isOwner) return;
        setIsUpdating(true);
        
        const payload: any = { doc_uuid: docId };
        const roleKey = role === 'editor' ? 'doc_editing_users' : role === 'viewer' ? 'doc_reading_users' : 'doc_commenting_users';

        if (role === 'editor') payload.remove_editors = [userUuid];
        if (role === 'viewer') payload.remove_viewers = [userUuid];
        if (role === 'commenter') payload.remove_commenters = [userUuid];

        await updatePermissions.makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDocPermissions,
            payload,
            onSuccess: () => {
                setIsUpdating(false);
                setPermissions(prev => {
                    if (!prev) return prev;
                    const currentList = prev[roleKey as keyof DocInfoInterface] as UserProfileDataInterface[] || [];
                    const updatedList = currentList.filter(u => u.user_uuid !== userUuid);
                    return {
                        ...prev,
                        [roleKey]: updatedList
                    };
                });
            },
            showToast: true
        });
    };
    
    // Determine current general access value
    let generalAccessValue = "restricted";
    if (permissions?.doc_private === false) {
        generalAccessValue = permissions.doc_public_comment ? "public_comment" : "public";
    }

    return (
        <Dialog open={dialogOpenState} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden bg-background border-border">
                <DialogHeader className="p-6 pb-4 text-start">
                    <DialogTitle className="text-xl font-semibold">Share Document</DialogTitle>
                    <DialogDescription className="text-muted-foreground mt-1">
                        Manage who can see and edit this document.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6 flex flex-col gap-6">
                    {/* Invite Section - Locked if not owner */}
                   {(isOwner && docId) && (
                    <div className="flex flex-col relative gap-2">
                        <AddDocMemberCombobox docId={docId} handleInvite={handleInvite} />
                    </div>
                   )}

                    {/* People with access */}
                    <div className="flex flex-col gap-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People with access</Label>
                        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                            {/* Owner */}
                            {permissions?.doc_created_by && (
                                <UserRow user={permissions.doc_created_by} role="owner" onRemove={() => {}} isOwner={false} />
                            )}

                            {/* Editors */}
                            {permissions?.doc_editing_users?.map(u => (
                                <UserRow key={u.user_uuid} user={u} role="editor" onRemove={() => handleRemoveUser(u.user_uuid, 'editor')} isOwner={isOwner} />
                            ))}
                            {/* Commenters */}
                            {permissions?.doc_commenting_users?.map(u => (
                                <UserRow key={u.user_uuid} user={u} role="commenter" onRemove={() => handleRemoveUser(u.user_uuid, 'commenter')} isOwner={isOwner}/>
                            ))}
                            {/* Viewers */}
                            {permissions?.doc_reading_users?.map(u => (
                                <UserRow key={u.user_uuid} user={u} role="viewer" onRemove={() => handleRemoveUser(u.user_uuid, 'viewer')} isOwner={isOwner} />
                            ))}
                        </div>
                    </div>

                    {/* General Access */}
                    <div className="flex flex-col gap-3 pt-4 border-t border-border">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General access</Label>
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-full transition-colors", permissions?.doc_private ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                                    {permissions?.doc_private ? <Lock className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                                </div>
                                <div className="flex flex-col">
                                    <Select 
                                        value={generalAccessValue} 
                                        onValueChange={handlePrivacyChange}
                                        disabled={isUpdating || !isOwner}
                                    >
                                        <SelectTrigger className="h-auto p-0 border-none shadow-none focus:ring-0 text-sm font-medium hover:text-primary transition-colors justify-start gap-1 w-auto">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="restricted">Restricted</SelectItem>
                                            <SelectItem value="public">Anyone with the link</SelectItem>
                                            <SelectItem value="public_comment">Anyone with link can comment</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground mt-0.5">
                                        {permissions?.doc_private 
                                            ? "Only added people can open with the link" 
                                            : "Anyone on the internet with the link can view"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-between items-center pt-2">
                         <Button 
                            variant="outline" 
                            size="sm"
                            className={cn("rounded-full gap-2 transition-all", copied ? "border-green-500 text-green-600 bg-green-50" : "text-primary border-primary/20 hover:bg-primary/5")}
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                        >
                             {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                             {copied ? "Copied" : "Copy Link"}
                        </Button>
                        <Button onClick={handleClose}>Done</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function UserRow({ user, role, onRemove, isOwner }: { user: UserProfileDataInterface, role: string, onRemove: () => void, isOwner: boolean }) {
    return (
        <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
            <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={user.user_profile_object_key} />
                    <AvatarFallback>{user.user_name?.charAt(0) || <UserIcon className="w-4 h-4"/>}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">{user.user_name}</span>
                    <span className="text-xs text-muted-foreground">{user.user_email_id}</span> 
                </div>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground capitalize">{role}</span>
                 {(isOwner && role !== 'owner') && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 md:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={onRemove}>
                        <X className="w-4 h-4" />
                    </Button>
                 )}
            </div>
        </div>
    )
}

