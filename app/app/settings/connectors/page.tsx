"use client"

import dynamic from "next/dynamic"
import ConnectorsCard from "@/components/connectors/ConnectorsCard"
import { SectionHeader } from "../SectionHeader"

// Bringing your Slack DMs shows once your team has imported Slack, and loads
// on its own: the page's first load stays what it was.
const SlackDMsCard = dynamic(() => import("@/components/connectors/SlackDMsCard"), { ssr: false })

export default function ConnectorsSettingsPage() {
    return (
        <div className="space-y-10">
            <SectionHeader href="/app/settings/connectors">
                Connect your accounts so the AI can help across your tools. It only ever uses your own connections,
                and actions like sending email always ask you first.
            </SectionHeader>
            <ConnectorsCard />
            <SlackDMsCard />
        </div>
    )
}
