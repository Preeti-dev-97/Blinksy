import { supabase } from "@/lib/supabase";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: "text" | "image" | "video";
  /** For image/video messages, this is the private Storage object path, not a public URL. */
  media_url: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ChatConversation = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type ChatProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ChatMediaAsset = {
  uri: string;
  type?: "image" | "video" | string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

const CHAT_MEDIA_BUCKET = "chat-media";
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Please sign in to use Blinksy Chats.");
  return user;
}

/** Get the currently signed-in Blinksy user. */
export async function getCurrentChatUser() {
  return requireUser();
}

/** Load profiles for the user directory. */
export async function searchChatProfiles(searchText = "") {
  await requireUser();

  let query = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .order("display_name", { ascending: true })
    .limit(30);

  const search = searchText.trim();

  if (search) {
    const safeSearch = search.replace(/[,%()]/g, "");
    if (!safeSearch) return [];

    query = query.or(
      `username.ilike.%${safeSearch}%,display_name.ilike.%${safeSearch}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatProfile[];
}

/** Load conversations in which the current user is a member. */
export async function getConversations() {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("conversation_members")
    .select(
      `
      conversation_id,
      last_read_at,
      conversations!inner (
        id,
        type,
        title,
        created_by,
        created_at,
        updated_at,
        last_message_at
      )
    `,
    )
    .eq("user_id", user.id)
    .order("last_read_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row: any) => row.conversations)
    .filter(Boolean)
    .sort(
      (a: ChatConversation, b: ChatConversation) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime(),
    ) as ChatConversation[];
}

/** Load recent messages in chronological order. */
export async function getMessages(conversationId: string, limit = 50) {
  await requireUser();

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, message_type, media_url, created_at, edited_at, deleted_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function getLatestMessagesForConversations(
  conversationIds: string[],
): Promise<ChatMessage[]> {
  await requireUser();
  if (conversationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, message_type, media_url, created_at, edited_at, deleted_at",
    )
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const latestByConversation = new Map<string, ChatMessage>();
  for (const message of (data ?? []) as ChatMessage[]) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }
  return Array.from(latestByConversation.values());
}

/** Send a text message to an existing conversation. */
export async function sendTextMessage(
  conversationId: string,
  messageText: string,
) {
  const user = await requireUser();
  const content = messageText.trim();
  if (!content) throw new Error("Message cannot be empty.");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      message_type: "text",
    })
    .select(
      "id, conversation_id, sender_id, content, message_type, media_url, created_at, edited_at, deleted_at",
    )
    .single();

  if (error) throw error;
  return data as ChatMessage;
}

/**
 * Upload an image/video selected with expo-image-picker.
 * Requires a PRIVATE Supabase Storage bucket named "chat-media".
 * Returns the Storage object path; do not store a public URL in messages.
 */
export async function uploadChatMedia(
  conversationId: string,
  asset: ChatMediaAsset,
  mediaType?: "image" | "video",
): Promise<{ path: string; messageType: "image" | "video" }> {
  const user = await requireUser();

  const detectedType =
    mediaType ??
    (asset.type === "video" || asset.mimeType?.startsWith("video/")
      ? "video"
      : "image");

  const extensionFromName = asset.fileName?.split(".").pop()?.toLowerCase();
  const extensionFromMime = asset.mimeType?.split("/")[1]?.toLowerCase();
  const fallbackExtension = detectedType === "video" ? "mp4" : "jpg";
  const extension =
    (extensionFromName || extensionFromMime || fallbackExtension)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || fallbackExtension;

  const contentType =
    asset.mimeType ||
    (detectedType === "video"
      ? extension === "mov"
        ? "video/quicktime"
        : "video/mp4"
      : extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

  // Fetching the local picker URI as a Blob works with Expo's native file URI.
  const response = await fetch(asset.uri);
  if (!response.ok) {
    throw new Error("Could not read the selected media from your device.");
  }
  const blob = await response.blob();

  if (asset.fileSize && asset.fileSize > 100 * 1024 * 1024) {
    throw new Error("Please choose a file smaller than 100 MB.");
  }

  const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`;

  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, blob, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });

  // Release Blob resources when supported by the runtime.
  if (typeof (blob as any).close === "function") {
    (blob as any).close();
  }

  if (error) throw error;
  return { path, messageType: detectedType };
}

/** Upload media and create the corresponding image/video chat message. */
export async function sendMediaMessage(
  conversationId: string,
  asset: ChatMediaAsset,
  mediaType?: "image" | "video",
  caption = "",
): Promise<ChatMessage> {
  const user = await requireUser();
  const { path, messageType } = await uploadChatMedia(
    conversationId,
    asset,
    mediaType,
  );

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: caption.trim() || null,
      message_type: messageType,
      media_url: path,
    })
    .select(
      "id, conversation_id, sender_id, content, message_type, media_url, created_at, edited_at, deleted_at",
    )
    .single();

  if (error) {
    // Avoid leaving an orphaned upload if message insertion fails.
    await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path]);
    throw error;
  }

  return data as ChatMessage;
}

/**
 * Turn a stored private-bucket object path into a temporary URL for Image/Video.
 * Cache this URL in the UI and refresh it after expiry or a failed media load.
 */
export async function getChatMediaUrl(
  storagePath: string,
  expiresInSeconds = SIGNED_URL_LIFETIME_SECONDS,
): Promise<string> {
  await requireUser();

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not open this chat media.");
  return data.signedUrl;
}

/** Mark the current user's conversation as read. */
export async function markConversationRead(conversationId: string) {
  const user = await requireUser();

  const { error } = await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  if (error) throw error;
}

/** Subscribe to new messages in one conversation. */
export async function subscribeToMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
) {
  await requireUser();

  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new as ChatMessage),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type ChatConversationWithProfile = ChatConversation & {
  otherUser: ChatProfile | null;
};

export async function getConversationsWithProfiles(): Promise<
  ChatConversationWithProfile[]
> {
  const user = await requireUser();

  const { data: memberships, error: membershipError } = await supabase
    .from("conversation_members")
    .select(
      `
      conversation_id,
      conversations!inner(
        id,
        type,
        title,
        created_by,
        created_at,
        updated_at,
        last_message_at
      )
    `,
    )
    .eq("user_id", user.id);

  if (membershipError) throw membershipError;

  const conversations = (memberships ?? [])
    .map((row: any) => row.conversations as ChatConversation)
    .filter(Boolean);

  if (conversations.length === 0) return [];

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: participants, error: participantsError } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds)
    .neq("user_id", user.id);

  if (participantsError) throw participantsError;

  const otherUserIds = [
    ...new Set((participants ?? []).map((participant) => participant.user_id)),
  ];

  let profiles: ChatProfile[] = [];
  if (otherUserIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherUserIds);

    if (error) throw error;
    profiles = (data ?? []) as ChatProfile[];
  }

  const result: ChatConversationWithProfile[] = conversations.map(
    (conversation) => {
      const participant = (participants ?? []).find(
        (item) => item.conversation_id === conversation.id,
      );
      const otherUser =
        profiles.find((profile) => profile.id === participant?.user_id) ?? null;

      return { ...conversation, otherUser };
    },
  );

  return result.sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime(),
  );
}

export async function createDirectConversation(
  targetUserId: string,
): Promise<string> {
  const user = await requireUser();
  if (targetUserId === user.id) {
    throw new Error("You cannot start a conversation with yourself.");
  }

  const { data, error } = await supabase.rpc("create_direct_conversation", {
    target_user_id: targetUserId,
  });

  if (error) throw error;
  if (!data) throw new Error("Could not create the conversation.");
  return data as string;
}
