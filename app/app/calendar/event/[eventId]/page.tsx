"use client";

import { useParams, useRouter } from "next/navigation";
import EventInfoPanel from "@/components/rightPanel/eventInfoPanel";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MobileEventPage() {
    const params = useParams();
    const router = useRouter();
    const eventId = params.eventId as string;

    if (!eventId) return null;

    const handleClose = () => {
        router.push("/app/calendar");
    };

    return (
        <div className="flex flex-col h-full bg-background">

            <main className="flex-1 overflow-y-auto">
                <EventInfoPanel eventUUID={eventId} onClose={handleClose} />
            </main>
        </div>
    );
}
