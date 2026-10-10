"use client"

import ConnectorsCard from "@/components/connectors/ConnectorsCard"
import { SectionHeader } from "../SectionHeader"

export default function ConnectorsSettingsPage() {
    return (
        <div className="space-y-10">
            <SectionHeader href="/app/settings/connectors">
                Connect your accounts so the AI can help across your tools. It only ever uses your own connections,
                and actions like sending email always ask you first.
            </SectionHeader>
            <ConnectorsCard />
        </div>
    )
}
