import {useDispatch} from "react-redux";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useCallback} from "react";
import mqttService, {MqttActionType} from "@/services/mqttService";
import {clearUserEmojiStatus, updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {undefined} from "zod";

interface UseUserMessageHandlersProps {
    userUuid?: string
}

export const useUserMessageHandlers = ({ userUuid }: UseUserMessageHandlersProps) => {
    const dispatch = useDispatch()

    const handleUserEmojiMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttUserEmoji = mqttService.parseUserEmojiStatusMsg(messageStr)

                // Multi-device sync: don't skip self. The reducer is a
                // pure overwrite by userUUID, so applying our own emoji
                // status update on a second device just mirrors what we
                // set on the originating device.


                switch (mqttUserEmoji.data.type) {

                    case MqttActionType.Update:

                        dispatch(updateUserEmojiStatus({
                            userUUID: mqttUserEmoji.data.user_uuid,
                            status: mqttUserEmoji.data.user_emoji_status
                        }))

                        break

                    case MqttActionType.Delete:

                        dispatch(clearUserEmojiStatus({
                            userUUID: mqttUserEmoji.data.user_uuid,
                        }))

                        break

                    default:
                        console.warn("[MQTT] Unknown user emoji action type:", mqttUserEmoji.data.type)
                }


            } catch (error) {
                console.error("[MQTT] User emoji message handling error:", error)
            }

        },
        [dispatch, userUuid],
    )

    const handleUserStatusMessage = useCallback(

        (messageStr: string) => {

            const mqttUserEmoji = mqttService.parseUserStatusMsg(messageStr)

            // Multi-device sync: don't skip self. The reducer is a pure
            // overwrite, so applying our own status update on a second
            // device mirrors what we set elsewhere.

            try {

                switch (mqttUserEmoji.data.type) {

                    case MqttActionType.Update:

                        dispatch(updateUserStatus({
                            userUUID: mqttUserEmoji.data.user_uuid,
                            status: mqttUserEmoji.data.user_status
                        }))

                        break


                    default:
                        console.warn("[MQTT] Unknown user status action type:", mqttUserEmoji.data.type)

                }

                } catch (error) {
                console.error("[MQTT] User status handling error:", error)
            }

        },
        [dispatch, userUuid],

    )

    const handleUserDeviceConnectedMessage = useCallback(
        (messageStr: string) => {

            try {

                const mqttUserDevice = mqttService.parseUserDeviceMsg(messageStr)

                // Multi-device sync: don't skip self. The reducer is a
                // pure overwrite. Each device update broadcasts the new
                // total to all devices for the same user; mirroring it
                // here keeps the count consistent across tabs / phones.

                switch (mqttUserDevice.data.type) {

                    case MqttActionType.Update:

                        dispatch(updateUserConnectedDeviceCount({
                            userUUID: mqttUserDevice.data.user_uuid,
                            deviceConnected: mqttUserDevice.data.user_device_connected
                        }))

                        break

                    default:
                        console.warn("[MQTT] Unknown user device connected action type:", mqttUserDevice.data.type)

                }

            }  catch (error) {
                console.error("[MQTT] User device connected handling error:", error)
            }
        },
        [dispatch, userUuid],
    )

    return {
        handleUserEmojiMessage,
        handleUserStatusMessage,
        handleUserDeviceConnectedMessage
    }
}