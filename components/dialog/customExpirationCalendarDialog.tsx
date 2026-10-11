"use client"

import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {useCallback, useState} from "react";
import { DateTimePicker } from "@/components/ui/date-time-picker";



interface CreateTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    initialDate: Date
    onChange: (date: Date) => void
}

const CustomExpirationCalendarDialog: React.FC<CreateTeamDialogProps> = ({
                                                               dialogOpenState,
                                                               setOpenState,
                                                                 initialDate,
                                                                 onChange
                                                           }) => {



    const [date, setDate] = useState<Date>(initialDate)


    const onSelectExpiration = (date: Date) => {
        onChange(date)
        closeModal()
    }

    const closeModal = useCallback(() => {
        if (dialogOpenState) {
            setOpenState(false);
        }
    }, [dialogOpenState, setOpenState]);


    return (
        <Dialog  onOpenChange={(open) => {
            if (!open) {
                closeModal();
            }
        }} open={dialogOpenState}  >
            <DialogContent className="w-fit">
                <DialogHeader>
                    <DialogTitle className="text-start"></DialogTitle>
                    <DialogDescription>

                    </DialogDescription>
                </DialogHeader>
                <div className='flex h-full w-full flex-col gap-3'>
                    <DateTimePicker value={date} onChange={setDate} aria-label="Expires" />

                </div>
                <DialogFooter>
                    <Button
                        disabled={date < new Date()}
                        className='py-1'
                        onClick={(e) => {
                            e.preventDefault()
                            onSelectExpiration(date)
                        }}
                        aria-hidden={false}
                    >
                        {date < new Date() ? 'Select future time' : 'Set expiration'}
                    </Button>
                </DialogFooter>

        </DialogContent>
</Dialog>
)
    ;
};

export default CustomExpirationCalendarDialog;