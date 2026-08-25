import axiosInstance from "@/lib/axiosInstance"

// Where one person's data lives, for answering a subject access or erasure
// request. Read-only: the endpoint counts rows and never deletes.

export interface PersonalDataLocation {
    table: string
    column: string
    rows: number
}

export interface PersonalDataInventory {
    user_id: string
    locations: PersonalDataLocation[]
    total_rows: number
    // The backend states plainly that counts are not an Article 15 answer. Carried
    // through to the UI rather than dropped, because the person reading it is the
    // person who would otherwise assume it was one.
    note?: string
}

// One definition of the path, so the SWR cache key and the request target cannot
// drift apart.
export const personalDataInventoryUrl = (userUUID: string) =>
    `/admin/data-subject/${encodeURIComponent(userUUID)}/inventory`

export async function getPersonalDataInventory(userUUID: string): Promise<PersonalDataInventory | undefined> {
    const res = await axiosInstance.get(personalDataInventoryUrl(userUUID))
    return (res.data as { data?: PersonalDataInventory })?.data
}
