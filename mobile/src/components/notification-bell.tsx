import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async (userId: string) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);

    if (error) {
      console.warn("Failed to load notification count:", error.message);
      return;
    }

    setUnreadCount(count ?? 0);
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let authSubscription: { unsubscribe: () => void } | null = null;

    let currentUserId: string | null = null;
    let initializing = false;

    const cleanupChannel = async () => {
      const oldChannel = channel;
      channel = null;

      if (oldChannel) {
        await supabase.removeChannel(oldChannel);
      }
    };

    const setupNotifications = async (userId: string) => {
      if (!active || initializing || currentUserId === userId) {
        return;
      }

      initializing = true;

      try {
        await cleanupChannel();

        if (!active) return;

        currentUserId = userId;

        await loadUnreadCount(userId);

        if (!active) return;

        // Register the callback BEFORE subscribing.
        const newChannel = supabase
          .channel(
            `home-notification-bell-${userId}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `recipient_id=eq.${userId}`,
            },
            () => {
              if (active) {
                void loadUnreadCount(userId);
              }
            },
          );

        channel = newChannel;

        // Subscribe only after all callbacks have been registered.
        newChannel.subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            console.warn("Notification Realtime subscription failed.");
          }
        });
      } catch (error) {
        console.error("Notification setup failed:", error);
      } finally {
        initializing = false;
      }
    };

    const initialize = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.error("Unable to get auth session:", error);
        return;
      }

      if (session?.user) {
        await setupNotifications(session.user.id);
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT") {
        currentUserId = null;
        setUnreadCount(0);
        void cleanupChannel();
        return;
      }

      if (session?.user && session.user.id !== currentUserId) {
        // Defer setup so it doesn't run inside the auth callback.
        setTimeout(() => {
          if (active && session.user) {
            void setupNotifications(session.user.id);
          }
        }, 0);
      }
    });

    authSubscription = subscription;

    return () => {
      active = false;
      authSubscription?.unsubscribe();
      void cleanupChannel();
    };
  }, []);

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push("/notifications")}
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
    >
      <Text style={styles.bell}>🔔</Text>

      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#1D1D24",
    borderWidth: 1,
    borderColor: "#30283F",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bell: {
    color: "#FFFFFF",
    fontSize: 25,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#101014",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
