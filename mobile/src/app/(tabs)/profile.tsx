import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getFriends } from "@/lib/friend-service";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/");
        return;
      }
      setEmail(user.email ?? "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      setProfile(data as Profile | null);
      const friends = await getFriends().catch(() => []);
      setFriendCount(friends.length);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Couldn't load profile", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Couldn't sign out", message);
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={COLORS.purple} />
      </SafeAreaView>
    );
  }

  const displayName = profile?.display_name?.trim() || "Blinksy user";
  const username = profile?.username
    ? `@${profile.username}`
    : "Add a username";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>My Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.profileCard}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>{username}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{friendCount}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push("/edit-profile")}
          >
            <Text style={styles.primaryButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Email address</Text>
          <Text style={styles.infoValue}>{email || "Not available"}</Text>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/friends")}
        >
          <Text style={styles.secondaryButtonText}>Manage Friends</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.logoutButton}
          onPress={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FF7373" />
          ) : (
            <Text style={styles.logoutText}>Sign Out</Text>
          )}
        </Pressable>
        <Text style={styles.footer}>Make every moment yours. ✦</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const COLORS = {
  background: "#100D18",
  card: "#1B1726",
  purple: "#9B7BFF",
  text: "#FFFFFF",
  muted: "#A7A1B5",
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  container: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 36 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: COLORS.text, fontSize: 32, lineHeight: 36, marginTop: -3 },
  headerTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  headerSpacer: { width: 42 },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30283F",
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#30283F",
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#3A2B5B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 3,
    borderColor: COLORS.purple,
  },
  avatarInitial: { color: COLORS.text, fontSize: 42, fontWeight: "800" },
  name: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  username: { color: COLORS.muted, fontSize: 14, marginTop: 6 },
  statsRow: { flexDirection: "row", marginTop: 22, marginBottom: 20 },
  statBox: { minWidth: 100, alignItems: "center" },
  statNumber: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  statLabel: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  primaryButton: {
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    width: "100%",
    alignItems: "center",
  },
  primaryButtonText: { color: "#171020", fontSize: 15, fontWeight: "800" },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 28,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#30283F",
  },
  infoLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 7 },
  infoValue: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 17,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#30283F",
  },
  secondaryButtonText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  chevron: { color: COLORS.muted, fontSize: 25, marginTop: -3 },
  logoutButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginTop: 22,
    borderWidth: 1,
    borderColor: "#63313B",
    backgroundColor: "#291821",
  },
  logoutText: { color: "#FF7373", fontSize: 14, fontWeight: "800" },
  footer: {
    color: "#756D85",
    fontSize: 11,
    textAlign: "center",
    marginTop: 26,
  },
});
