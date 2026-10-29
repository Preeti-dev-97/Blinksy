import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  getCurrentNotificationUserId,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotificationSubscription,
  subscribeToNotifications,
  type BlinksyNotification,
} from "@/lib/notification-service";

const COLORS = {
  background: "#0B0B12",
  card: "#171722",
  border: "#2B2B3A",
  text: "#FFFFFF",
  muted: "#A7A7B8",
  purple: "#B58CFF",
  unread: "#221A36",
};

function notificationIcon(type: BlinksyNotification["type"]) {
  if (type === "friend_request") return "👋";
  if (type === "friend_request_accepted") return "💜";
  return "💬";
}

function relativeTime(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<BlinksyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const rows = await getNotifications();
      setItems(rows);
    } catch (error) {
      Alert.alert(
        "Notifications",
        error instanceof Error ? error.message : "Couldn't load notifications.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    let active = true;
    let channel: { topic?: string } | null = null;

    const setup = async () => {
      try {
        const userId = await getCurrentNotificationUserId();
        if (!active) return;
        channel = await subscribeToNotifications(userId, () => {
          if (active) void load(false);
        });
      } catch (error) {
        console.warn("Notification realtime subscription failed:", error);
      }
    };

    void setup();
    return () => {
      active = false;
      if (channel) void removeNotificationSubscription(channel);
    };
  }, [load]);

  const unreadCount = items.filter((item) => !item.read_at).length;

  const handleMarkAllRead = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    } catch (error) {
      Alert.alert(
        "Couldn't mark notifications read",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const openNotification = async (item: BlinksyNotification) => {
    try {
      if (!item.read_at) {
        await markNotificationRead(item.id);
        setItems((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
          ),
        );
      }

      if (item.type === "new_message") {
        const conversationId = item.data?.conversation_id;
        // Chats is the existing route. The conversation-specific deep link can
        // be added once the chat list route consumes a conversationId parameter.
        router.push(conversationId
          ? ({ pathname: "/chats", params: { conversationId: String(conversationId) } } as never)
          : "/chats");
      } else {
        router.push("/friends");
      }
    } catch (error) {
      Alert.alert(
        "Notification",
        error instanceof Error ? error.message : "Couldn't open this notification.",
      );
    }
  };

  const renderItem = ({ item }: { item: BlinksyNotification }) => {
    const actorName =
      item.actor?.display_name?.trim() ||
      (item.actor?.username ? `@${item.actor.username}` : "Someone");

    let description = item.body;
    if (item.type === "friend_request") description = `${actorName} sent you a friend request.`;
    if (item.type === "friend_request_accepted") description = `${actorName} accepted your friend request.`;
    if (item.type === "new_message") description = `${actorName}: ${item.body}`;

    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => void openNotification(item)}
        style={[styles.notification, !item.read_at && styles.unreadNotification]}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>{notificationIcon(item.type)}</Text>
        </View>
        <View style={styles.notificationContent}>
          <View style={styles.titleRow}>
            <Text style={styles.notificationTitle} numberOfLines={1}>{item.title}</Text>
            {!item.read_at ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.notificationBody}>{description}</Text>
          <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.subheading}>
            {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
          </Text>
        </View>
        <Pressable
          onPress={() => void handleMarkAllRead()}
          disabled={!unreadCount || markingAll}
          style={styles.readAllButton}
          accessibilityRole="button"
        >
          <Text style={[styles.readAllText, !unreadCount && styles.disabledText]}>
            {markingAll ? "Saving…" : "Read all"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Loading notifications…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(false);
              }}
              tintColor={COLORS.purple}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>Nothing new yet</Text>
              <Text style={styles.emptyBody}>
                Friend requests and new messages will show up here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  backText: { color: COLORS.text, fontSize: 30, lineHeight: 34, marginTop: -3 },
  headerText: { flex: 1 },
  heading: { color: COLORS.text, fontSize: 23, fontWeight: "800" },
  subheading: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  readAllButton: { paddingVertical: 9, paddingLeft: 10 },
  readAllText: { color: COLORS.purple, fontWeight: "700", fontSize: 13 },
  disabledText: { color: "#626274" },
  list: { padding: 14, paddingBottom: 30 },
  notification: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
  },
  unreadNotification: {
    backgroundColor: COLORS.unread,
    borderColor: "#60468A",
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#2B2140",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: { fontSize: 21 },
  notificationContent: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  notificationTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", flex: 1 },
  notificationBody: { color: "#D2D0DE", fontSize: 13, lineHeight: 19, marginTop: 4 },
  time: { color: COLORS.muted, fontSize: 11, marginTop: 7 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple, marginLeft: 8 },
  chevron: { color: COLORS.muted, fontSize: 27, marginLeft: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  emptyList: { flexGrow: 1, padding: 24 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 70 },
  emptyIcon: { fontSize: 45, marginBottom: 16 },
  emptyTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  emptyBody: { color: COLORS.muted, fontSize: 13, textAlign: "center", lineHeight: 20, marginTop: 8, maxWidth: 270 },
});
