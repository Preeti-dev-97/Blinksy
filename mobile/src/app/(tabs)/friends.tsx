import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import {
  acceptFriendRequest,
  cancelFriendRequest,
  getFriendship,
  getFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  rejectFriendRequest,
  sendFriendRequest,
  subscribeToFriendRequests,
  type FriendProfile,
  type FriendRequest,
} from "@/lib/friend-service";

import {
  createDirectConversation,
  searchChatProfiles,
  type ChatProfile,
} from "@/lib/chat-service";

type TabKey = "add" | "received" | "sent" | "friends";
type Person = FriendProfile | ChatProfile | null | undefined;

type FriendshipStatus = {
  requester_id: string;
  addressee_id: string;
  status: FriendRequest["status"];
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "add", label: "Add Friends" },
  { key: "received", label: "Received" },
  { key: "sent", label: "Sent" },
  { key: "friends", label: "Friends" },
];

const COLORS = {
  background: "#0D0B16",
  panel: "#171323",
  panelLight: "#211A32",
  purple: "#A78BFA",
  purpleDeep: "#7C3AED",
  text: "#F7F4FF",
  muted: "#A49BB8",
  border: "#302641",
};

function displayName(person: Person): string {
  return (
    person?.display_name?.trim() || person?.username?.trim() || "Blinksy user"
  );
}

function username(person: Person): string {
  return person?.username?.trim() ? `@${person.username.trim()}` : "";
}

function Avatar({ person }: { person: Person }) {
  const name = displayName(person);

  if (person?.avatar_url) {
    return <Image source={{ uri: person.avatar_url }} style={styles.avatar} />;
  }

  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>♡</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export default function FriendsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("add");
  const [search, setSearch] = useState("");

  const [searchResults, setSearchResults] = useState<ChatProfile[]>([]);
  const [friendships, setFriendships] = useState<
    Record<string, FriendshipStatus | null>
  >({});

  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  );

  const refreshLists = useCallback(async () => {
    try {
      const [received, sent, friendProfiles] = await Promise.all([
        getIncomingFriendRequests(),
        getOutgoingFriendRequests(),
        getFriends(),
      ]);

      setIncoming(received);
      setOutgoing(sent);
      setFriends(friendProfiles);
    } catch (error) {
      console.error("Failed to load friend data:", error);

      Alert.alert(
        "Couldn't load friends",
        "Please check your connection and try again.",
      );
    } finally {
      setLoadingLists(false);
    }
  }, []);

  // FIX 1:
  // subscribeToFriendRequests returns a Promise containing the
  // unsubscribe function, so we must await it before using cleanup.
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      await refreshLists();

      try {
        const cleanup = await subscribeToFriendRequests(() => {
          if (mounted) {
            void refreshLists();
          }
        });

        if (mounted) {
          unsubscribe = cleanup;
        } else {
          cleanup();
        }
      } catch (error) {
        console.error("Failed to subscribe to friend requests:", error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [refreshLists]);

  // Search users and load their current friendship/request status.
  useEffect(() => {
    let cancelled = false;
    const query = search.trim();

    if (activeTab !== "add" || query.length < 2) {
      setSearchResults([]);
      setFriendships({});
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchChatProfiles(query);

        if (cancelled) return;

        setSearchResults(results);

        const entries = await Promise.all(
          results.map(async (profile) => {
            try {
              const relation = await getFriendship(profile.id);

              return [
                profile.id,
                relation
                  ? {
                      requester_id: relation.requester_id,
                      addressee_id: relation.addressee_id,
                      status: relation.status,
                    }
                  : null,
              ] as const;
            } catch (error) {
              console.error("Failed to load friendship status:", error);

              return [profile.id, null] as const;
            }
          }),
        );

        if (!cancelled) {
          setFriendships(Object.fromEntries(entries));
        }
      } catch (error) {
        console.error("User search failed:", error);

        if (!cancelled) {
          setSearchResults([]);
          setFriendships({});
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, search]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>) => {
      setBusyIds((current) => ({
        ...current,
        [key]: true,
      }));

      try {
        await action();
        await refreshLists();

        // Refresh friendship statuses after sending/accepting requests.
        if (activeTab === "add" && search.trim().length >= 2) {
          const results = await searchChatProfiles(search.trim());

          const entries = await Promise.all(
            results.map(async (profile) => {
              const relation = await getFriendship(profile.id).catch(
                () => null,
              );

              return [
                profile.id,
                relation
                  ? {
                      requester_id: relation.requester_id,
                      addressee_id: relation.addressee_id,
                      status: relation.status,
                    }
                  : null,
              ] as const;
            }),
          );

          setSearchResults(results);
          setFriendships(Object.fromEntries(entries));
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Please try again in a moment.";

        Alert.alert("Action failed", message);
      } finally {
        setBusyIds((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    },
    [activeTab, refreshLists, search],
  );
  const sendRequest = (person: ChatProfile) => {
    void runAction(person.id, () => sendFriendRequest(person.id));
  };

  const acceptRequest = (request: FriendRequest) => {
     void runAction(`accept-${request.id}`, () =>
       acceptFriendRequest(request.id),
     );
  };

  const rejectRequest = (request: FriendRequest) => {
    void runAction(`reject-${request.id}`, () =>
      rejectFriendRequest(request.id),
    );
  };

  const cancelRequest = (request: FriendRequest) => {
    void runAction(request.id, () => cancelFriendRequest(request.id));
  };

  const messageFriend = async (person: FriendProfile) => {
    const key = `chat-${person.id}`;

    setBusyIds((current) => ({
      ...current,
      [key]: true,
    }));

    try {
      await createDirectConversation(person.id);
      router.push("/chats");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't open this conversation.";

      Alert.alert("Couldn't open chat", message);
    } finally {
      setBusyIds((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const renderSearchResult = ({ item }: { item: ChatProfile }) => {
    const relation = friendships[item.id];
    const busy = !!busyIds[item.id];

    let label = "Add";
    let disabled = false;
    let onPress = () => sendRequest(item);

    if (relation?.status === "accepted") {
      label = "Friends";
      disabled = true;
    } else if (
      relation?.status === "pending" &&
      relation.requester_id === item.id
    ) {
      label = "Accept";

      onPress = () => {
        const request = incoming.find(
          (entry) => entry.requester_id === item.id,
        );

        if (request) {
          acceptRequest(request);
        } else {
          void refreshLists();
        }
      };
    } else if (relation?.status === "pending") {
      label = "Requested";
      disabled = true;
    }

    return (
      <View style={styles.personRow}>
        <Avatar person={item} />

        <View style={styles.personInfo}>
          <Text style={styles.personName}>{displayName(item)}</Text>

          {!!username(item) && (
            <Text style={styles.username}>{username(item)}</Text>
          )}
        </View>

        <Pressable
          disabled={disabled || busy}
          onPress={onPress}
          style={[
            styles.actionButton,
            (disabled || busy) && styles.actionButtonDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.actionButtonText}>{label}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderIncoming = ({ item }: { item: FriendRequest }) => {
    const person = item.requester ?? null;

    const acceptBusy = !!busyIds[`accept-${item.id}`];
    const declineBusy = !!busyIds[`reject-${item.id}`];

    // Prevent both actions from running simultaneously.
    const busy = acceptBusy || declineBusy;

    return (
      <View style={styles.personRow}>
        <Avatar person={person} />

        <View style={styles.personInfo}>
          <Text style={styles.personName}>{displayName(person)}</Text>

          {!!username(person) && (
            <Text style={styles.username}>{username(person)}</Text>
          )}

          <Text style={styles.rowHint}>Wants to be your friend</Text>
        </View>

        <View style={styles.inlineActions}>
          {/* Accept */}
          <Pressable
            disabled={busy}
            onPress={() => acceptRequest(item)}
            style={[styles.actionButton, busy && styles.actionButtonDisabled]}
          >
            {acceptBusy ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.actionButtonText}>Accept</Text>
            )}
          </Pressable>

          {/* Decline */}
          <Pressable
            disabled={busy}
            onPress={() => rejectRequest(item)}
            style={[
              styles.secondaryButton,
              busy && styles.actionButtonDisabled,
            ]}
          >
            {declineBusy ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.secondaryButtonText}>Decline</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const renderOutgoing = ({ item }: { item: FriendRequest }) => {
    // FIX 3: addressee can be null if the related profile is unavailable.
    const person = item.addressee ?? null;
    const busy = !!busyIds[item.id];

    return (
      <View style={styles.personRow}>
        <Avatar person={person} />

        <View style={styles.personInfo}>
          <Text style={styles.personName}>{displayName(person)}</Text>

          {!!username(person) && (
            <Text style={styles.username}>{username(person)}</Text>
          )}

          <Text style={styles.rowHint}>Friend request pending</Text>
        </View>

        <Pressable
          disabled={busy}
          onPress={() => cancelRequest(item)}
          style={styles.secondaryButton}
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderFriend = ({ item }: { item: FriendProfile }) => {
    const busy = !!busyIds[`chat-${item.id}`];

    return (
      <View style={styles.personRow}>
        <Avatar person={item} />

        <View style={styles.personInfo}>
          <Text style={styles.personName}>{displayName(item)}</Text>

          {!!username(item) && (
            <Text style={styles.username}>{username(item)}</Text>
          )}
        </View>

        <Pressable
          disabled={busy}
          onPress={() => void messageFriend(item)}
          style={styles.actionButton}
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.actionButtonText}>Message</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderContent = () => {
    if (activeTab !== "add" && loadingLists) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.purple} size="large" />
        </View>
      );
    }

    if (activeTab === "add") {
      if (search.trim().length < 2) {
        return (
          <EmptyState
            title="Find your people"
            message="Search by username or display name to add friends."
          />
        );
      }

      if (searching) {
        return (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.purple} size="large" />
          </View>
        );
      }

      if (searchResults.length === 0) {
        return (
          <EmptyState
            title="No users found"
            message="Try another name or username."
          />
        );
      }

      return (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchResult}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
        />
      );
    }

    if (activeTab === "received") {
      return incoming.length ? (
        <FlatList
          data={incoming}
          keyExtractor={(item) => item.id}
          renderItem={renderIncoming}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No friend requests"
          message="New requests will appear here."
        />
      );
    }

    if (activeTab === "sent") {
      return outgoing.length ? (
        <FlatList
          data={outgoing}
          keyExtractor={(item) => item.id}
          renderItem={renderOutgoing}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState
          title="No pending requests"
          message="Friend requests you send will appear here."
        />
      );
    }

    return friends.length ? (
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        renderItem={renderFriend}
        contentContainerStyle={styles.listContent}
      />
    ) : (
      <EmptyState
        title="No friends yet"
        message="Search for people and send a friend request."
      />
    );
  };

  const tabTitle =
    TABS.find((tab) => tab.key === activeTab)?.label ?? "Friends";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Friends</Text>
          <Text style={styles.headerSubtitle}>Your Blinksy circle</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "add" && (
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search people..."
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
          />

          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text style={styles.clearSearch}>×</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{tabTitle}</Text>

        {activeTab === "received" && incoming.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{incoming.length}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
    marginRight: 12,
  },
  backText: {
    color: COLORS.text,
    fontSize: 32,
    lineHeight: 34,
    marginTop: -4,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 4,
    borderRadius: 15,
    backgroundColor: COLORS.panel,
  },
  tab: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 3,
  },
  activeTab: {
    backgroundColor: COLORS.purpleDeep,
  },
  tabText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.panel,
  },
  searchIcon: {
    color: COLORS.muted,
    fontSize: 24,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingVertical: 10,
  },
  clearSearch: {
    color: COLORS.muted,
    fontSize: 25,
    paddingLeft: 8,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  countBadge: {
    marginLeft: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: COLORS.purpleDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.panelLight,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarLetter: {
    color: COLORS.purple,
    fontSize: 18,
    fontWeight: "800",
  },
  personInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  personName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  username: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  rowHint: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  actionButton: {
    minWidth: 72,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.purpleDeep,
  },
  actionButtonDisabled: {
    backgroundColor: COLORS.panelLight,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    minWidth: 65,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panelLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  inlineActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingBottom: 48,
  },
  emptyIcon: {
    color: COLORS.purple,
    fontSize: 42,
    marginBottom: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
});
