"use client"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmAlertDialogProps {
    title: string
    description: string
    onConfirm?: () => void
    confirmText?: string
    cancelText?: string
    open: boolean;
    onOpenChange: (open: boolean) => void;

}

export function ConfirmAlertDialog({
                                       title,
    open,
    onOpenChange,
                                       description,
                                       onConfirm,
                                       confirmText = "Continue",
                                       cancelText = "Cancel",
                                   }: ConfirmAlertDialogProps) {


    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel >{cancelText}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
