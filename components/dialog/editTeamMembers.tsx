"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {TeamMemberContent} from "@/components/member/teamMemberContent";
import {Users} from "lucide-react";


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
        <Dialog onOpenChange={closeModal} open={dialogOpenState} >
            <DialogContent className="max-w-[95vw] md:max-w-[35vw] h-[80vh] flex flex-col p-0 overflow-hidden bg-background backdrop-blur-xl border-border/50 shadow-2xl">
                <DialogHeader className="p-6 pb-2 border-b border-border/50">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
                        <div className="bg-primary/10 p-1.5 rounded-md">
                            <Users className="h-5 w-5 text-primary" />
                        </div>
                        Team members
                    </DialogTitle>
                    <DialogDescription className="hidden">
                        Manage your team members
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden p-6 pt-2 flex flex-col">
                    <TeamMemberContent teamId={teamId} />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditTeamMemberDialog;
