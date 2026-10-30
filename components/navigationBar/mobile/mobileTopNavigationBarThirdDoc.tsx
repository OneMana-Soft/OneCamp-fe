import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import {DocInfoResponse} from "@/types/doc";
import {GetEndpointUrl} from "@/services/endPoints";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import { Ellipsis, MessageCircle } from "@/lib/icons";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink";
import { app_doc_path} from "@/types/paths";
import {UserProfileInterface} from "@/types/user";
import { ConnectedTrigger } from "@/components/workGraph/ConnectedTrigger";
import { PHONE_CONNECTED } from "@/components/navigationBar/mobile/mobileTopNavigationBarThird";

export function MobileTopNavigationBarThirdDoc({docId}:{docId: string}) {
    const dispatch = useDispatch();
    const docCommentCount = useSelector((state: RootState) => state.createDocComment?.docCommentCount[docId]);
    // The page says why a doc didn't open (no access, the trash); the bar stays quiet.
    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '', undefined, undefined, OWN_ERRORS);
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    // Both known, and the same person: undefined == undefined made everyone
    // the owner while either was loading.
    const owner = docInfo.data?.data?.doc_created_by?.user_uuid
    const me = selfProfile.data?.data?.user_uuid
    const isOwner = !!owner && !!me && owner === me

    // A folder, file or link has its actions in its own view (docs F1b).
    if ((docInfo.data?.data as { doc_node_kind?: string } | undefined)?.doc_node_kind) return null;

    return (
        <div className='flex justify-end space-x-1'>
            {/* 44px, as the bar's other actions: a thumb at a phone's top is least accurate. Comments load on a touch, not with the doc (fluid-06). */}
            <Button variant='ghost' className="h-11 min-w-11" asChild><IntentLink href={`${app_doc_path}/${docId}/comment`} aria-label="Comments"><MessageCircle className='h-5'/>{docCommentCount || ''}</IntentLink></Button>
            <ConnectedTrigger kind="doc" id={docId} title={docInfo.data?.data?.doc_title} className={PHONE_CONNECTED} />
            <Button variant='ghost' size='icon' className="h-11 w-11" aria-label="Document options" onClick={() => dispatch(openUI({ key: 'docOptionsDrawer', data: { docId: docId, isOwner: isOwner } }))}><Ellipsis className='h-5'/></Button>
        </div>
    );
}
