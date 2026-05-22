import type { UserProfileDataInterface } from "@/types/user";

/**
 * Filters out external/ghost users from a user list.
 * External users should not appear in:
 * - DM creation
 * - Group chat creation
 * - Member addition (channel/project/team)
 * - @mention autocomplete
 * - User search
 */
export function filterExternalUsers(users?: UserProfileDataInterface[]): UserProfileDataInterface[] {
    if (!users) return [];
    return users.filter(u => !u.is_external);
}

/**
 * Checks if a user is external.
 */
export function isExternalUser(user?: UserProfileDataInterface): boolean {
    return !!user?.is_external;
}
