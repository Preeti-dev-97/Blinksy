import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";

import { supabase } from "@/lib/supabase";

import {
  getConversationsWithProfiles,
  createDirectConversation,
  getMessages,
  sendTextMessage,
  sendMediaMessage,
  getChatMediaUrl,
  markConversationRead,
  subscribeToMessages,
  searchChatProfiles,
  getLatestMessagesForConversations,
  type ChatMessage,
  type ChatProfile,
} from "@/lib/chat-service";

type Chat = {
  id: string;
  name: string;
  username: string;
  message: string;
  time: string;
  avatar: string;
  color: string;
  unread: number;
  online: boolean;
  sentByMe?: boolean;
  otherUserId: string | null;
  lastMessageAt?: string | null;
};

type Message = {
  id: string;
  text: string;
  fromMe: boolean;
  time: string;
  messageType: "text" | "image" | "video";
  mediaPath: string | null;
  mediaUri?: string | null;
};

function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.mediaVideo}
      nativeControls
      contentFit="contain"
    />
  );
}

type FilterType = "All" | "Unread";

export default function ChatsScreen() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [chats, setChats] = useState<Chat[]>([]);
  const [, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newChatMode, setNewChatMode] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChatProfile[]>([]);
  const [creatingChat, setCreatingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);

  const [messagesByChat, setMessagesByChat] = useState<
    Record<string, Message[]>
  >({});

  const [draft, setDraft] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const subscriptionGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const selectedChatIdRef = useRef<string | null>(null);
  const handledMessageIds = useRef<Set<string>>(new Set());
  const resolvingMedia = useRef<Set<string>>(new Set());

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id ?? null;
  }, [selectedChat?.id]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();

    return chats.filter((chat) => {
      const matchesSearch =
        chat.name.toLowerCase().includes(query) ||
        chat.username.toLowerCase().includes(query) ||
        chat.message.toLowerCase().includes(query);

      const matchesFilter = activeFilter === "All" || chat.unread > 0;

      return matchesSearch && matchesFilter;
    });
  }, [chats, search, activeFilter]);

  const renderChat = ({ item }: { item: Chat }) => (
    <Pressable
      style={({ pressed }) => [styles.chatItem, pressed && styles.pressed]}
      onPress={() => {
        selectedChatIdRef.current = item.id;
        setSelectedChat(item);
        setDraft("");
      }}
    >
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: item.color }]}>
          <Text style={styles.avatarText}>{item.avatar}</Text>
        </View>

        {item.online && <View style={styles.onlineIndicator} />}
      </View>

      <View style={styles.chatDetails}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.chatName, item.unread > 0 && styles.unreadText]}
            numberOfLines={1}
          >
            {item.name}
          </Text>

          <Text style={[styles.time, item.unread > 0 && styles.unreadTime]}>
            {item.time}
          </Text>
        </View>

        <View style={styles.messageRow}>
          <Text
            style={[
              styles.lastMessage,
              item.unread > 0 && styles.unreadMessage,
            ]}
            numberOfLines={1}
          >
            {item.sentByMe ? "✓ " : ""}
            {item.message}
          </Text>

          {item.unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const conversations = await getConversationsWithProfiles();

      const conversationIds = conversations.map(
        (conversation) => conversation.id,
      );
      const latestMessages =
        await getLatestMessagesForConversations(conversationIds);

      // Read receipts are stored per user and conversation.
      const { data: memberships, error: membershipsError } = await supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at")
        .eq("user_id", currentUserId);

      if (membershipsError) throw membershipsError;

      const lastReadByConversation = new Map<string, string | null>(
        (memberships ?? []).map((membership) => [
          membership.conversation_id as string,
          (membership.last_read_at as string | null) ?? null,
        ]),
      );

      // Count incoming messages newer than this user's last-read timestamp.
      // Run counts in parallel so each conversation's unread badge is accurate.
      const unreadEntries = await Promise.all(
        conversationIds.map(async (conversationId) => {
          const lastReadAt = lastReadByConversation.get(conversationId);
          let query = supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", currentUserId);

          if (lastReadAt) query = query.gt("created_at", lastReadAt);

          const { count, error } = await query;
          if (error) throw error;
          return [conversationId, count ?? 0] as const;
        }),
      );
      const unreadByConversation = new Map<string, number>(unreadEntries);

      const latestByConversation = new Map<string, ChatMessage>(
        latestMessages.map(
          (message) => [message.conversation_id, message] as const,
        ),
      );

      const mappedChats: Chat[] = conversations.map((conversation) => {
        const profile = conversation.otherUser;

        const name =
          profile?.display_name ||
          profile?.username ||
          conversation.title ||
          "Blinksy User";

        const latest = latestByConversation.get(conversation.id);

        return {
          id: conversation.id,
          name,
          username: profile?.username ? `@${profile.username}` : "",
          message: latest
            ? latest.deleted_at
              ? "Message deleted"
              : latest.message_type === "image"
                ? "📷 Photo"
                : latest.message_type === "video"
                  ? "🎥 Video"
                  : (latest.content ?? "")
            : "Start a conversation",
          time: latest
            ? new Date(latest.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          avatar: name.charAt(0).toUpperCase(),
          color: "#C7A4FF",
          unread: unreadByConversation.get(conversation.id) ?? 0,
          online: false,
          sentByMe: latest?.sender_id === currentUserId,
          otherUserId: profile?.id ?? null,

          // Used to sort conversations by latest activity.
          lastMessageAt:
            latest?.created_at ??
            (
              conversation as typeof conversation & {
                last_message_at?: string | null;
              }
            ).last_message_at ??
            null,
        };
      });

      mappedChats.sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;

        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;

        return timeB - timeA;
      });

      setChats(mappedChats);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const { getCurrentChatUser } = await import("@/lib/chat-service");
        const user = await getCurrentChatUser();

        if (active) {
          setCurrentUserId(user.id);
        }
      } catch (error) {
        if (active) {
          Alert.alert(
            "Chats",
            error instanceof Error
              ? error.message
              : "Unable to initialize Chats.",
          );
          setLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    let active = true;

    const load = async () => {
      setLoading(true);

      try {
        await loadConversations();
      } catch (error) {
        if (active) {
          Alert.alert(
            "Chats",
            error instanceof Error
              ? error.message
              : "Unable to load conversations.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [currentUserId, loadConversations]);

  const mapMessage = useCallback(
    (message: ChatMessage): Message => ({
      id: message.id,
      text: message.deleted_at ? "Message deleted" : (message.content ?? ""),
      fromMe: message.sender_id === currentUserId,
      time: new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      messageType: message.deleted_at ? "text" : message.message_type,
      mediaPath: message.deleted_at ? null : message.media_url,
      mediaUri: null,
    }),
    [currentUserId],
  );

  const addMessage = useCallback(
    (conversationId: string, incoming: ChatMessage) => {
      // The list-level and open-thread subscriptions can receive the same event.
      // Handle each message ID only once so previews and unread counts don't double.
      if (handledMessageIds.current.has(incoming.id)) return;
      handledMessageIds.current.add(incoming.id);

      const isIncoming = incoming.sender_id !== currentUserId;
      const isOpenConversation = selectedChatIdRef.current === conversationId;

      // Incoming messages in the currently open thread are immediately marked read.
      if (isIncoming && isOpenConversation) {
        void markConversationRead(conversationId).catch((error) => {
          console.error("Failed to mark incoming message as read:", error);
        });
      }

      const mapped = mapMessage(incoming);

      // Add the message without duplicating realtime events.
      setMessagesByChat((previous) => {
        const existing = previous[conversationId] ?? [];

        if (existing.some((message) => message.id === mapped.id)) {
          return previous;
        }

        return {
          ...previous,
          [conversationId]: [...existing, mapped],
        };
      });

      // Update the preview, timestamp, and conversation order.
      setChats((previous) => {
        const chatIndex = previous.findIndex(
          (chat) => chat.id === conversationId,
        );

        if (chatIndex === -1) {
          return previous;
        }

        const existingChat = previous[chatIndex];

        const updatedChat: Chat = {
          ...existingChat,
          message: incoming.deleted_at
            ? "Message deleted"
            : incoming.message_type === "image"
              ? "📷 Photo"
              : incoming.message_type === "video"
                ? "🎥 Video"
                : (incoming.content ?? ""),
          time: new Date(incoming.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          lastMessageAt: incoming.created_at,
          sentByMe: incoming.sender_id === currentUserId,
          unread: isIncoming
            ? isOpenConversation
              ? 0
              : existingChat.unread + 1
            : existingChat.unread,
        };

        return [
          updatedChat,
          ...previous.filter((chat) => chat.id !== conversationId),
        ].sort((a, b) => {
          const timeA = a.lastMessageAt
            ? new Date(a.lastMessageAt).getTime()
            : 0;
          const timeB = b.lastMessageAt
            ? new Date(b.lastMessageAt).getTime()
            : 0;

          return timeB - timeA;
        });
      });
    },
    [currentUserId, mapMessage],
  );

  // Resolve private Storage paths to temporary URLs for image/video rendering.
  useEffect(() => {
    const pending: Array<{
      conversationId: string;
      messageId: string;
      path: string;
    }> = [];
    for (const [conversationId, messages] of Object.entries(messagesByChat)) {
      for (const message of messages) {
        if (
          message.mediaPath &&
          !message.mediaUri &&
          !resolvingMedia.current.has(message.id)
        ) {
          resolvingMedia.current.add(message.id);
          pending.push({
            conversationId,
            messageId: message.id,
            path: message.mediaPath,
          });
        }
      }
    }

    for (const item of pending) {
      void getChatMediaUrl(item.path)
        .then((uri) => {
          setMessagesByChat((previous) => ({
            ...previous,
            [item.conversationId]: (previous[item.conversationId] ?? []).map(
              (message) =>
                message.id === item.messageId
                  ? { ...message, mediaUri: uri }
                  : message,
            ),
          }));
        })
        .catch((error) => {
          console.error("Unable to load chat media:", error);
        })
        .finally(() => resolvingMedia.current.delete(item.messageId));
    }
  }, [messagesByChat]);

  // Keep the main conversation list live even when no chat is open.
  // The per-conversation subscription below is for the open message thread;
  // this subscription updates the list preview and latest-activity ordering.
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`chat-list-messages-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          if (!incoming?.conversation_id || !incoming?.created_at) return;
          addMessage(incoming.conversation_id, incoming);
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Chat list realtime subscription status:", status);
          console.error("Chat list realtime error details:", err);
        } else if (status === "SUBSCRIBED") {
          console.log("Chat list realtime subscription connected.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, addMessage]);

  useEffect(() => {
    if (!selectedChat || !currentUserId) return;

    const conversationId = selectedChat.id;
    const generation = ++subscriptionGeneration.current;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    setLoadingMessages(true);
    setMessageError(null);

    const initializeConversation = async () => {
      try {
        const history = await getMessages(conversationId, 100);

        if (!active || generation !== subscriptionGeneration.current) return;

        setMessagesByChat((previous) => ({
          ...previous,
          [conversationId]: history.map(mapMessage),
        }));

        await markConversationRead(conversationId);

        if (!active || generation !== subscriptionGeneration.current) return;

        // Subscribe after history has loaded.
        unsubscribe = await subscribeToMessages(conversationId, (incoming) => {
          if (!active || generation !== subscriptionGeneration.current) return;

          addMessage(conversationId, incoming);
        });

        if (!active || generation !== subscriptionGeneration.current) {
          unsubscribe();
          return;
        }

        await loadConversations();
      } catch (error) {
        if (active) {
          setMessageError(
            error instanceof Error
              ? error.message
              : "Unable to load conversation messages.",
          );
        }
      } finally {
        if (active) setLoadingMessages(false);
      }
    };

    void initializeConversation();

    return () => {
      active = false;
      unsubscribe?.();

      if (subscriptionGeneration.current === generation) {
        subscriptionGeneration.current++;
      }
    };
  }, [
    selectedChat?.id,
    currentUserId,
    mapMessage,
    addMessage,
    loadConversations,
  ]);

  useEffect(() => {
    if (!newChatMode) return;

    const query = userSearch.trim();
    const generation = ++searchGeneration.current;

    if (!query) {
      setSearchResults([]);
      setNewChatLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setNewChatLoading(true);

      try {
        const results = await searchChatProfiles(query);

        if (generation !== searchGeneration.current) return;

        setSearchResults(
          results.filter((profile) => profile.id !== currentUserId),
        );
      } catch (error) {
        if (generation === searchGeneration.current) {
          setUserSearchError(
            error instanceof Error ? error.message : "Search failed.",
          );
        }
      } finally {
        if (generation === searchGeneration.current) {
          setNewChatLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newChatMode, userSearch, currentUserId]);

  const startDirectConversation = async (profile: ChatProfile) => {
    if (creatingChat) return;

    setCreatingChat(true);

    try {
      const conversationId = await createDirectConversation(profile.id);

      await loadConversations();

      const existing = chats.find((chat) => chat.id === conversationId);

      const name = profile.display_name || profile.username || "Blinksy User";

      const chat: Chat = existing ?? {
        id: conversationId,
        name,
        username: profile.username ? `@${profile.username}` : "",
        message: "Start a conversation",
        time: "",
        avatar: name.charAt(0).toUpperCase(),
        color: "#C7A4FF",
        unread: 0,
        online: false,
        otherUserId: profile.id,
        lastMessageAt: null,
      };

      setChats((previous) =>
        previous.some((item) => item.id === conversationId)
          ? previous
          : [chat, ...previous],
      );

      setMessagesByChat((previous) => ({
        ...previous,
        [conversationId]: previous[conversationId] ?? [],
      }));

      selectedChatIdRef.current = chat.id;
      setSelectedChat(chat);
      setNewChatMode(false);
      setUserSearch("");
      setSearchResults([]);
    } catch (error) {
      Alert.alert(
        "New conversation",
        error instanceof Error
          ? error.message
          : "Unable to start the conversation.",
      );
    } finally {
      setCreatingChat(false);
    }
  };

  if (selectedChat) {
    const messages = messagesByChat[selectedChat.id] ?? [];

    const sendMessage = async () => {
      const text = draft.trim();

      if (!text || sending || !selectedChat) return;

      setSending(true);
      setMessageError(null);

      try {
        const savedMessage = await sendTextMessage(selectedChat.id, text);

        addMessage(selectedChat.id, savedMessage);

        setDraft("");

        // Refresh the conversation list and latest-message previews.
        await loadConversations();
      } catch (error) {
        setMessageError(
          error instanceof Error ? error.message : "Please try again.",
        );

        Alert.alert(
          "Message not sent",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setSending(false);
      }
    };

    const chooseAndSendMedia = async () => {
      if (sending || !selectedChat) return;

      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Gallery permission needed",
            "Allow Blinksy to access your photos and videos to share them in chat.",
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images", "videos"],
          allowsEditing: false,
          allowsMultipleSelection: false,
          quality: 0.8,
          videoMaxDuration: 120,
        });

        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        setSending(true);
        setMessageError(null);

        const type = asset.type === "video" ? "video" : "image";
        const savedMessage = await sendMediaMessage(
          selectedChat.id,
          {
            uri: asset.uri,
            type,
            mimeType: asset.mimeType,
            fileName: asset.fileName,
            fileSize: asset.fileSize,
          },
          type,
          draft,
        );

        addMessage(selectedChat.id, savedMessage);
        setDraft("");
        await loadConversations();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Please try again.";
        setMessageError(message);
        Alert.alert("Media not sent", message);
      } finally {
        setSending(false);
      }
    };

    return (
      <KeyboardAvoidingView
        style={styles.conversationContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar barStyle="light-content" />

        {/* Conversation header */}
        <View style={styles.conversationHeader}>
          <Pressable
            onPress={() => {
              selectedChatIdRef.current = null;
              setSelectedChat(null);
            }}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>

          <View
            style={[
              styles.conversationAvatar,
              { backgroundColor: selectedChat.color },
            ]}
          >
            <Text style={styles.conversationAvatarText}>
              {selectedChat.avatar}
            </Text>
          </View>

          <View style={styles.conversationUser}>
            <Text style={styles.conversationName}>{selectedChat.name}</Text>

            <Text style={styles.conversationStatus}>
              {selectedChat.online ? "Online" : selectedChat.username}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          style={styles.messagesArea}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.conversationEmpty}>
              <View
                style={[
                  styles.largeAvatar,
                  { backgroundColor: selectedChat.color },
                ]}
              >
                <Text style={styles.largeAvatarText}>
                  {selectedChat.avatar}
                </Text>
              </View>

              <Text style={styles.conversationEmptyName}>
                {selectedChat.name}
              </Text>

              <Text style={styles.conversationEmptyText}>
                You're connected on Blinksy. Say hello! 👋
              </Text>
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageRowBubble,
                  message.fromMe ? styles.myMessageRow : styles.theirMessageRow,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    message.fromMe
                      ? styles.myMessageBubble
                      : styles.theirMessageBubble,
                  ]}
                >
                  {message.messageType === "image" && message.mediaUri ? (
                    <Image
                      source={{ uri: message.mediaUri }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                      accessibilityLabel="Shared photo"
                    />
                  ) : message.messageType === "video" && message.mediaUri ? (
                    <ChatVideo uri={message.mediaUri} />
                  ) : message.messageType !== "text" && message.mediaPath ? (
                    <View style={styles.mediaLoading}>
                      <ActivityIndicator
                        color={message.fromMe ? "#171522" : "#A7A0FF"}
                      />
                      <Text
                        style={[
                          styles.mediaLoadingText,
                          message.fromMe
                            ? styles.myMessageText
                            : styles.theirMessageText,
                        ]}
                      >
                        Loading media…
                      </Text>
                    </View>
                  ) : null}

                  {!!message.text && (
                    <Text
                      style={[
                        styles.messageText,
                        message.fromMe
                          ? styles.myMessageText
                          : styles.theirMessageText,
                      ]}
                    >
                      {message.text}
                    </Text>
                  )}

                  <Text
                    style={[
                      styles.messageTime,
                      message.fromMe
                        ? styles.myMessageTime
                        : styles.theirMessageTime,
                    ]}
                  >
                    {message.time}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Message composer */}
        <View style={styles.composer}>
          <Pressable
            onPress={chooseAndSendMedia}
            disabled={sending}
            style={[styles.attachButton, sending && styles.sendButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Attach photo or video"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#A7A0FF" />
            ) : (
              <Text style={styles.attachButtonText}>＋</Text>
            )}
          </Pressable>

          <TextInput
            style={styles.messageInput}
            placeholder="Message..."
            placeholderTextColor="#85858F"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
          />

          <Pressable
            onPress={sendMessage}
            disabled={!draft.trim() || sending}
            style={[
              styles.sendButton,
              !draft.trim() && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STAY CONNECTED</Text>
          <Text style={styles.title}>Chats</Text>
        </View>

        {/* Right-side actions */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            style={{
              backgroundColor: "#7C3AED",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
            onPress={() => router.push("/friends")}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
              Friends
            </Text>
          </Pressable>

          {/* Existing New Chat button */}
          <Pressable
            style={styles.newChatButton}
            onPress={() => {
              setNewChatMode(true);
              setUserSearch("");
              setSearchResults([]);
              setUserSearchError(null);
            }}
          >
            <Text style={styles.newChatIcon}>＋</Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search friends or messages"
          placeholderTextColor="#777780"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      {/* Filters */}
      <View style={styles.filterRow}>
        {(["All", "Unread"] as FilterType[]).map((filter) => {
          const selected = activeFilter === filter;

          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[
                styles.filterButton,
                selected && styles.activeFilterButton,
              ]}
            >
              <Text
                style={[styles.filterText, selected && styles.activeFilterText]}
              >
                {filter}
              </Text>

              {filter === "Unread" && (
                <View style={styles.filterCount}>
                  <Text style={styles.filterCountText}>
                    {chats.filter((chat) => chat.unread > 0).length}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {/* Conversations */}
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={styles.sectionTitle}>MESSAGES</Text>}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>

            <Text style={styles.emptyTitle}>No conversations found</Text>

            <Text style={styles.emptyDescription}>
              Try another search or check back later.
            </Text>
          </View>
        }
      />
      <Modal
        visible={newChatMode}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setNewChatMode(false);
          setUserSearch("");
          setSearchResults([]);
          setUserSearchError(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.newChatModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Chat</Text>

              <Pressable
                onPress={() => {
                  setNewChatMode(false);
                  setUserSearch("");
                  setSearchResults([]);
                  setUserSearchError(null);
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.userSearchInput}
              placeholder="Search by username or name"
              placeholderTextColor="#777780"
              value={userSearch}
              onChangeText={(text) => {
                setUserSearch(text);
                setUserSearchError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            {newChatLoading && (
              <ActivityIndicator
                size="small"
                color="#A7A0FF"
                style={styles.searchLoader}
              />
            )}

            {userSearchError && (
              <Text style={styles.userSearchError}>{userSearchError}</Text>
            )}

            {!newChatLoading &&
              !userSearchError &&
              userSearch.trim().length > 0 &&
              searchResults.length === 0 && (
                <Text style={styles.noUsersText}>
                  No users found. Try another name or username.
                </Text>
              )}

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const name =
                  item.display_name || item.username || "Blinksy User";

                return (
                  <Pressable
                    style={styles.userResult}
                    disabled={creatingChat}
                    onPress={() => {
                      void startDirectConversation(item);
                    }}
                  >
                    <View style={styles.userResultAvatar}>
                      <Text style={styles.userResultAvatarText}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.userResultDetails}>
                      <Text style={styles.userResultName}>{name}</Text>

                      <Text style={styles.userResultUsername}>
                        @{item.username}
                      </Text>
                    </View>

                    {creatingChat ? (
                      <ActivityIndicator size="small" color="#A7A0FF" />
                    ) : (
                      <Text style={styles.startChatIcon}>›</Text>
                    )}
                  </Pressable>
                );
              }}
            />

            <Text style={styles.searchHint}>
              Search for someone on Blinksy to start a conversation.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#101014",
    paddingTop: 12,
    paddingBottom: 0,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 22,
  },
  eyebrow: {
    color: "#A7A0FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
  },
  newChatButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#A7A0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  newChatIcon: {
    color: "#101014",
    fontSize: 30,
    fontWeight: "400",
    marginTop: -3,
  },
  searchContainer: {
    height: 50,
    marginHorizontal: 22,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 15,
    backgroundColor: "#1D1D24",
    flexDirection: "row",
    alignItems: "center",
  },
  searchIcon: {
    color: "#A7A0FF",
    fontSize: 25,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 22,
    gap: 10,
    marginBottom: 24,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 19,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#1D1D24",
    gap: 7,
  },
  activeFilterButton: {
    backgroundColor: "#A7A0FF",
  },
  filterText: {
    color: "#B8B8C2",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterText: {
    color: "#101014",
  },
  filterCount: {
    backgroundColor: "#101014",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  sectionTitle: {
    color: "#777780",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginHorizontal: 23,
    marginBottom: 8,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 15,
  },
  pressed: {
    opacity: 0.7,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#191921",
    fontSize: 22,
    fontWeight: "800",
  },
  onlineIndicator: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#55E6A5",
    borderWidth: 3,
    borderColor: "#101014",
  },
  chatDetails: {
    flex: 1,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#24242B",
    paddingBottom: 15,
    minHeight: 54,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
    gap: 8,
  },
  chatName: {
    color: "#E4E4EB",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  unreadText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  time: {
    color: "#777780",
    fontSize: 11,
  },
  unreadTime: {
    color: "#A7A0FF",
    fontWeight: "700",
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  lastMessage: {
    color: "#898993",
    fontSize: 12,
    flex: 1,
  },
  unreadMessage: {
    color: "#C4C4CF",
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: "#A7A0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#101014",
    fontSize: 10,
    fontWeight: "800",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
    paddingTop: 75,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyDescription: {
    color: "#898993",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  conversationContainer: {
    flex: 1,
    backgroundColor: "#101014",
    width: "100%",
  },

  conversationHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#292930",
    gap: 12,
  },

  backButton: {
    width: 34,
    height: 42,
    justifyContent: "center",
  },

  backButtonText: {
    color: "#FFFFFF",
    fontSize: 38,
    lineHeight: 42,
  },

  conversationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  conversationAvatarText: {
    color: "#191921",
    fontSize: 19,
    fontWeight: "800",
  },

  conversationUser: {
    flex: 1,
  },

  conversationName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  conversationStatus: {
    color: "#55E6A5",
    fontSize: 12,
    marginTop: 4,
  },

  messagesArea: {
    flex: 1,
  },

  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexGrow: 1,
  },

  conversationEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },

  largeAvatar: {
    width: 76,
    height: 76,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  largeAvatarText: {
    color: "#191921",
    fontSize: 32,
    fontWeight: "800",
  },

  conversationEmptyName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },

  conversationEmptyText: {
    color: "#92929D",
    fontSize: 13,
    textAlign: "center",
  },

  messageRowBubble: {
    width: "100%",
    flexDirection: "row",
    marginBottom: 12,
  },

  myMessageRow: {
    justifyContent: "flex-end",
  },

  theirMessageRow: {
    justifyContent: "flex-start",
  },

  messageBubble: {
    maxWidth: "82%",
    minWidth: 65,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 7,
    borderRadius: 18,
  },

  myMessageBubble: {
    backgroundColor: "#A7A0FF",
    borderBottomRightRadius: 5,
  },

  theirMessageBubble: {
    backgroundColor: "#25252E",
    borderBottomLeftRadius: 5,
  },

  mediaImage: {
    width: 220,
    height: 240,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: "#18181F",
  },

  mediaVideo: {
    width: 240,
    height: 300,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: "#000000",
  },

  mediaLoading: {
    minWidth: 160,
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  mediaLoadingText: {
    fontSize: 12,
  },

  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },

  myMessageText: {
    color: "#171522",
  },

  theirMessageText: {
    color: "#FFFFFF",
  },

  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },

  myMessageTime: {
    color: "#48416F",
  },

  theirMessageTime: {
    color: "#9999A5",
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#292930",
    gap: 10,
  },

  attachButton: {
    width: 42,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25252E",
    borderWidth: 1,
    borderColor: "#383842",
  },

  attachButtonText: {
    color: "#A7A0FF",
    fontSize: 27,
    lineHeight: 30,
    fontWeight: "500",
  },

  messageInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: "#25252E",
    borderRadius: 22,
    paddingHorizontal: 17,
    paddingTop: 13,
    paddingBottom: 12,
    color: "#FFFFFF",
    fontSize: 14,
  },

  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A7A0FF",
  },

  sendButtonDisabled: {
    opacity: 0.4,
  },

  sendButtonText: {
    color: "#171522",
    fontSize: 21,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },

  newChatModal: {
    height: "78%",
    backgroundColor: "#101014",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#25252E",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 17,
  },

  userSearchInput: {
    height: 50,
    borderRadius: 15,
    backgroundColor: "#1D1D24",
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 14,
  },

  searchLoader: {
    marginVertical: 16,
  },

  userSearchError: {
    color: "#FF8585",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },

  noUsersText: {
    color: "#92929D",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },

  userResult: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#24242B",
  },

  userResultAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#C7A4FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  userResultAvatarText: {
    color: "#191921",
    fontSize: 20,
    fontWeight: "800",
  },

  userResultDetails: {
    flex: 1,
  },

  userResultName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  userResultUsername: {
    color: "#92929D",
    fontSize: 12,
    marginTop: 4,
  },

  startChatIcon: {
    color: "#A7A0FF",
    fontSize: 30,
  },

  searchHint: {
    color: "#777780",
    fontSize: 12,
    textAlign: "center",
    paddingTop: 14,
  },
});
