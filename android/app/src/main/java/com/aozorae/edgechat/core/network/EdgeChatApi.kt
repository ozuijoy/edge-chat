package com.aozorae.edgechat.core.network

import com.aozorae.edgechat.core.network.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface EdgeChatApi {
    @GET("api/v1/capabilities")
    suspend fun capabilities(): Response<CapabilitiesResponse>

    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<MobileAuthResponse>

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body request: RefreshRequest): Response<MobileAuthResponse>

    @POST("api/v1/auth/logout")
    suspend fun logout(): Response<OkResponse>

    @GET("api/v1/auth/session")
    suspend fun session(): Response<SessionResponse>

    @GET("api/v1/bootstrap")
    suspend fun bootstrap(): Response<BootstrapResponse>

    @GET("api/v1/rooms/{kind}/{id}/messages")
    suspend fun messages(
        @Path("kind") kind: String,
        @Path("id") roomId: Long,
        @Query("before") before: Long? = null,
        @Query("limit") limit: Int = 50,
    ): Response<RoomMessagesResponse>

    @GET("api/v1/rooms/{kind}/{id}/sync")
    suspend fun sync(
        @Path("kind") kind: String,
        @Path("id") roomId: Long,
        @Query("cursor") cursor: Long,
        @Query("limit") limit: Int = 100,
    ): Response<RoomSyncResponse>

    @POST("api/v1/rooms/{kind}/{id}/messages")
    suspend fun sendMessage(
        @Path("kind") kind: String,
        @Path("id") roomId: Long,
        @Body request: SendMessageRequest,
    ): Response<SendMessageResponse>

    @DELETE("api/v1/rooms/{kind}/{id}/messages/{messageId}")
    suspend fun deleteMessage(
        @Path("kind") kind: String,
        @Path("id") roomId: Long,
        @Path("messageId") messageId: Long,
    ): Response<OkResponse>

    @POST("api/v1/rooms/{kind}/{id}/read")
    suspend fun markRead(
        @Path("kind") kind: String,
        @Path("id") roomId: Long,
        @Body request: ReadRequest,
    ): Response<ReadResponse>

    @POST("api/v1/realtime/tickets")
    suspend fun realtimeTicket(@Body request: TicketRequest): Response<TicketResponse>

    @Multipart
    @POST("api/v1/uploads")
    suspend fun upload(
        @Part file: MultipartBody.Part,
        @Part("clientUploadId") clientUploadId: RequestBody,
    ): Response<UploadResponse>

    @GET("api/v1/channels")
    suspend fun channels(): Response<ChannelsResponse>

    @POST("api/v1/channels")
    suspend fun createGroup(@Body request: CreateGroupRequest): Response<ChannelResponse>

    @POST("api/v1/channels/{id}/join")
    suspend fun joinChannel(@Path("id") channelId: Long): Response<OkResponse>

    @GET("api/v1/channels/{id}/members")
    suspend fun members(@Path("id") channelId: Long): Response<MembersResponse>

    @POST("api/v1/channels/{id}/invite")
    suspend fun inviteMembers(
        @Path("id") channelId: Long,
        @Body request: InviteMembersRequest,
    ): Response<MembersMutationResponse>

    @DELETE("api/v1/channels/{channelId}/members/{userId}")
    suspend fun removeMember(
        @Path("channelId") channelId: Long,
        @Path("userId") userId: Long,
    ): Response<MembersMutationResponse>

    @PATCH("api/v1/channels/{id}")
    suspend fun updateChannel(
        @Path("id") channelId: Long,
        @Body request: UpdateChannelRequest,
    ): Response<ChannelUpdateResponse>

    @DELETE("api/v1/channels/{id}")
    suspend fun deleteChannel(@Path("id") channelId: Long): Response<OkResponse>

    @POST("api/v1/dm/open")
    suspend fun openDm(@Body request: OpenDmRequest): Response<DmResponse>

    @PATCH("api/v1/me/profile")
    suspend fun updateProfile(@Body request: UpdateProfileRequest): Response<SessionResponse>

    @POST("api/v1/auth/change-password")
    suspend fun changePassword(@Body request: ChangePasswordRequest): Response<OkResponse>
}
