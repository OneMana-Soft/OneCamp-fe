"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {TeamMemberContent} from "@/components/member/teamMemberContent";
import { Users } from "@/lib/icons";


interface EditTeamMemberDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    teamId: string
}

const EditTeamMemberDialog: React.FC<EditTeamMemberDialogProps> = ({
                                                                dialogOpenState,
                                                                setOpenState,
                                                                teamId
                                                            }) => {


    const closeModal = () => {
        setOpenState(false);
    };



    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[35vw] h-[80vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-5 pb-3 border-b border-border/60 space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Team members
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Manage your team members.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden p-5 pt-3 flex flex-col">
                    <TeamMemberContent teamId={teamId} />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditTeamMemberDialog;
