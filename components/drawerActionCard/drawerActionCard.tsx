import { LucideIcon } from "lucide-react";
import * as React from "react";
import {Card, CardContent} from "@/components/ui/card";

interface ActionCardPropInterface {
    onCardClick: () => void
    Icon: LucideIcon
    cardText: string

}

export const DrawerActionCard = ({onCardClick, Icon, cardText}: ActionCardPropInterface) => {

    return (
        <Card
            className="flex-1 h-24 p-0 cursor-pointer bg-muted/30 hover:bg-muted/60 transition-colors border-none shadow-none rounded-2xl flex flex-col justify-center items-center"
            onClick={onCardClick}
        >
            <CardContent
                className="text-sm flex flex-col items-center justify-center space-y-2 p-0">
                <div className="flex justify-center">
                    <Icon className="h-6 w-6 text-muted-foreground"/>
                </div>
                <div className="text-sm font-medium">{cardText}</div>
            </CardContent>
        </Card>
    )
}