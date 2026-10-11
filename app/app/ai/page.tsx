"use client";

import { useEffect, useState } from "react";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { takeAskParam } from "@/lib/search/askAI";

export default function AiPage() {
    // "Ask OneCamp AI" and "Ask a follow-up" from search land here with
    // ?ask=<question>. Read once on load and taken out of the address first,
    // so the question is asked once and a reload does not ask it again.
    const [ask, setAsk] = useState<string | undefined>();
    useEffect(() => {
        setAsk(takeAskParam(window));
    }, []);
    return (
        <div className="h-full w-full">
            <AiChatPanel variant="page" initialAsk={ask} />
        </div>
    );
}
