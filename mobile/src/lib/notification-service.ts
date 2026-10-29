import { supabase } from "@/lib/supabase";

export type NotificationType =
  | "friend_request"
  | "friend_request_accepted"
  | "new_message";

export type BlinksyNotification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export async function getCurrentNotificationUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in to view notifications.");
  return data.user.id;
}

export async function getNotifications(limit = 50): Promise<BlinksyNotification[]> {
  const userId = await getCurrentNotificationUserId();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, recipient_id, actor_id, type, title, body, data, read_at, created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as BlinksyNotification[];
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];

  if (!actorIds.length) return rows;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", actorIds);

  // Notification content remains usable even if profile lookup is unavailable.
  if (profilesError) {
    console.warn("Could not load notification actor profiles:", profilesError.message);
    return rows;
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    actor: row.actor_id ? profileById.get(row.actor_id) ?? null : null,
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await getCurrentNotificationUserId();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Subscribe only to INSERTs for this signed-in user's notifications.
 * Return the channel so callers can remove it during cleanup.
 */
export async function subscribeToNotifications(
  userId: string,
  onInsert: (notification: BlinksyNotification) => void,
) {
  const channel = supabase
    .channel(`notifications-${userId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as BlinksyNotification),
    )
    .subscribe();

  return channel;
}

export async function removeNotificationSubscription(channel: { topic?: string } | null) {
  if (channel) await supabase.removeChannel(channel as never);
}
