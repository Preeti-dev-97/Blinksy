import { supabase } from "@/lib/supabase";

export type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type FriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  responded_at: string | null;
  requester: FriendProfile | null;
  addressee: FriendProfile | null;
};

export type FriendRequestAction = "send" | "accept" | "reject" | "cancel";

const REQUEST_SELECT = `
  id,
  requester_id,
  addressee_id,
  status,
  created_at,
  responded_at,
  requester:profiles!friend_requests_requester_id_fkey (
    id,
    username,
    display_name,
    avatar_url
  ),
  addressee:profiles!friend_requests_addressee_id_fkey (
    id,
    username,
    display_name,
    avatar_url
  )
`;

/**
 * Require an authenticated Supabase user.
 */
async function requireUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) throw error;

  if (!data.user) {
    throw new Error("Please log in to use friend features.");
  }

  return data.user;
}

/**
 * Send a friend request to another profile.
 */
export async function sendFriendRequest(targetUserId: string): Promise<string> {
  const user = await requireUser();

  if (!targetUserId || targetUserId === user.id) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  const { data, error } = await supabase.rpc("send_friend_request", {
    target_user_id: targetUserId,
  });

  if (error) throw error;

  if (!data) {
    throw new Error("The friend request could not be created.");
  }

  return data as string;
}

/**
 * Accept an incoming friend request.
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  await requireUser();

  const { error } = await supabase.rpc("accept_friend_request", {
    request_id: requestId,
  });

  if (error) throw error;
}

/**
 * Reject an incoming friend request.
 */
export async function rejectFriendRequest(requestId: string): Promise<void> {
  await requireUser();

  const { error } = await supabase.rpc("reject_friend_request", {
    request_id: requestId,
  });

  if (error) throw error;
}

/**
 * Cancel a request sent by the current user.
 */
export async function cancelFriendRequest(requestId: string): Promise<void> {
  await requireUser();

  const { error } = await supabase.rpc("cancel_friend_request", {
    request_id: requestId,
  });

  if (error) throw error;
}

/**
 * Load incoming pending requests.
 */
export async function getIncomingFriendRequests(): Promise<FriendRequest[]> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("friend_requests")
    .select(REQUEST_SELECT)
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as unknown as FriendRequest[];
}

/**
 * Load outgoing pending requests.
 */
export async function getOutgoingFriendRequests(): Promise<FriendRequest[]> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("friend_requests")
    .select(REQUEST_SELECT)
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as unknown as FriendRequest[];
}

/**
 * Load accepted friendships, regardless of who sent the request.
 */
export async function getFriends(): Promise<FriendProfile[]> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("friend_requests")
    .select(REQUEST_SELECT)
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order("responded_at", { ascending: false });

  if (error) throw error;

  const requests = (data ?? []) as unknown as FriendRequest[];

  return requests
    .map((request) =>
      request.requester_id === user.id ? request.addressee : request.requester,
    )
    .filter((profile): profile is FriendProfile => profile !== null);
}

/**
 * Find the existing relationship with another user.
 *
 * Returns null when there is no previous request or friendship.
 */
export async function getFriendship(
  targetUserId: string,
): Promise<FriendRequest | null> {
  const user = await requireUser();

  if (!targetUserId || targetUserId === user.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .select(REQUEST_SELECT)
    .or(
      [
        `and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId})`,
        `and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`,
      ].join(","),
    )
    .maybeSingle();

  if (error) throw error;

  return data as unknown as FriendRequest | null;
}

/**
 * Subscribe to changes involving the current user's relationships.
 * Call the returned cleanup function when leaving the screen.
 */
export async function subscribeToFriendRequests(
  onChange: () => void,
): Promise<() => void> {
  const user = await requireUser();

  const channel = supabase
    .channel(
      `friend-requests-${user.id}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_requests",
        filter: `requester_id=eq.${user.id}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_requests",
        filter: `addressee_id=eq.${user.id}`,
      },
      onChange,
    );

  channel.subscribe((status, err) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error("Friend request subscription:", status, err);
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}
