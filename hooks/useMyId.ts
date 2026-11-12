"use client"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/** The signed-in person's id ("" until their profile comes). A guest's page passes signedIn false: there is no profile to ask for. */
export const useMyId = (signedIn = true) => useFetchOnlyOnce<UserProfileInterface>(signedIn ? GetEndpointUrl.SelfProfile : "").data?.data?.user_uuid ?? ""

/** Whether the signed-in person is a workspace admin (false until their profile comes): only they may import. */
export const useWorkspaceAdmin = () => !!useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_is_admin
