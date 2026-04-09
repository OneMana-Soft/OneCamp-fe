"use client"


import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import DmMemberContent from "@/components/member/dmMemberContent";


interface EditDmDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    grpId: string
}

const EditDmMemberDialog: React.FC<EditDmDialogProps> = ({
                                                              dialogOpenState,
                                                              setOpenState,
                                                              grpId
                                                          }) => {


    const closeModal = () => {
        setOpenState(false);
    };



    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState} >
            <DialogContent className="max-w-[95vw] md:max-w-[30vw] h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-start">Group members</DialogTitle>
                    <DialogDescription className="hidden">
                        Group members
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden p-6 pt-2">
                    <DmMemberContent grpId={grpId} />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditDmMemberDialog;