
import {Separator} from "@/components/ui/separator";
import * as React from "react";
import { app_project_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import {TeamProjectInfoMobile} from "@/components/team/TeamProjectInfoMobile";
import {ProjectInfoInterface} from "@/types/project";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {UserInfo} from "node:os";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import MemberInfoMobile from "@/components/member/memberInfoMobile";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";

export const TeamMemberListResult = ({userList, isAdmin}: {userList: UserProfileDataInterface[], isAdmin: boolean}) => {


    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    
    const handleClick = (projectUUID: string) => {
        
    }
    
    const handleLongPress = () => {}


    return (
        <div className="w-full flex justify-center overflow-y-auto ">
            <div className=" w-full md:w-[40vw]  md:px-6">
                {
                    userList.map((user: UserProfileDataInterface, i) => {
                        return (
                            <div key = {user.user_uuid}  onClick={()=>handleClick(user.user_uuid)}>
                                {i!=0 && <Separator orientation="horizontal" className=" mx-6 w-[calc(100%-3rem)]" />}
                                <TouchableDiv rippleBrightness={0.8} rippleDuration={800} className="w-full">

                                    <MemberInfoMobile  isAdmin={isAdmin} isSelf={selfProfile.data?.data.user_uuid == user.user_uuid} longPressAction={handleLongPress} userInfo={user}/>
                                </TouchableDiv>
                            </div>
                        )
                    })

                }

                {
                    userList.length > 0 && <Separator orientation="horizontal" className=" mx-6 w-[calc(100%-3rem)]" />
                }


            </div>
        </div>
    )
}