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
import { buttonVariants } from "@/components/ui/button"

interface ConfirmAlertDialogProps {
    title: string
    description: string
    onConfirm?: () => void
    confirmText?: string
    cancelText?: string
    /** The action loses something: its button is the danger colour, not the brand's. */
    destructive?: boolean
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
                                       destructive = false,
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
                    <AlertDialogAction onClick={onConfirm} className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}>
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
