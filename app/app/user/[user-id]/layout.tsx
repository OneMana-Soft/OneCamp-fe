"use client"

import { ReactNode } from "react";

/**
 * Layout for the /app/user/[user-id] route: a person's profile page, on a
 * phone and on a wide screen alike. A wide screen used to go home and float
 * the profile card there, with no title and no way to close it, and once left
 * a blank sheet behind it (QA SH-06, 14 Oct 2026). A name pressed in the app
 * still opens the card in place; a link to someone opens their page.
 */
export default function UserProfileLayout({
    children
}: Readonly<{
    children: ReactNode
}>) {
    return <>{children}</>;
}
