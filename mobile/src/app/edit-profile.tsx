import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function EditProfileScreen() {
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
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
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!mounted) return;
        setUserId(user.id);
        const profile = data as Profile | null;
        setDisplayName(profile?.display_name ?? "");
        setUsername(profile?.username ?? "");
        setAvatarUrl(profile?.avatar_url ?? null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Please try again.";
        Alert.alert("Couldn't load profile", message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo permission needed",
        "Allow photo library access to choose a profile picture.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri)
      setAvatarUri(result.assets[0].uri);
  };

  const saveProfile = async () => {
    const cleanName = displayName.trim();
    const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();

    // Required-field validation
    if (!cleanName) {
      showAlert(
        "Display Name Required",
        "Please enter your display name before saving.",
      );
      return;
    }

    if (!cleanUsername) {
      showAlert("Username Required", "Please enter a username before saving.");
      return;
    }

    if (
      cleanUsername.length < 3 ||
      cleanUsername.length > 20 ||
      !/^[a-z0-9_]+$/.test(cleanUsername)
    ) {
      showAlert(
        "Invalid Username",
        "Your username must contain 3–20 characters using only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    if (!userId) {
      showAlert(
        "Profile Not Ready",
        "Your profile could not be loaded. Please try again.",
      );
      return;
    }

    setSaving(true);

    try {
      // Check whether another user already owns this username.
      const { data: existing, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", userId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        showAlert(
          "Username Already Taken",
          "Please choose a different username.",
        );
        return;
      }

      let finalAvatarUrl = avatarUrl;

      // Upload a newly selected profile picture, if provided.
      if (avatarUri) {
        const response = await fetch(avatarUri);
        const blob = await response.blob();

        const extension = (
          avatarUri.split(".").pop()?.split("?")[0] || "jpg"
        ).toLowerCase();

        const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension)
          ? extension
          : "jpg";

        const path = `${userId}/${Date.now()}.${safeExtension}`;

        const contentType =
          safeExtension === "png"
            ? "image/png"
            : safeExtension === "webp"
              ? "image/webp"
              : "image/jpeg";

        const { error: uploadError } = await supabase.storage
          .from("profile-avatars")
          .upload(path, blob, {
            contentType,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("profile-avatars")
          .getPublicUrl(path);

        finalAvatarUrl = data.publicUrl;
      }

      // Save profile information.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: cleanName,
          username: cleanUsername,
          avatar_url: finalAvatarUrl,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Show success alert, then return to Profile.
      showAlert(
        "Profile Updated",
        "Your Blinksy profile has been saved successfully.",
        () => router.replace("/profile"),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";

      showAlert("Couldn't Save Profile", message);
    } finally {
      setSaving(false);
    }
  };

  const showAlert = (
    title: string,
    message: string,
    onConfirm?: () => void,
  ) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
      onConfirm?.();
      return;
    }

    Alert.alert(title, message, [
      {
        text: "OK",
        onPress: onConfirm,
      },
    ]);
  };

  if (loading)
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.purple} />
      </SafeAreaView>
    );
  const imageSource = avatarUri || avatarUrl;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Pressable
            onPress={() => void chooseAvatar()}
            style={styles.avatarWrap}
            accessibilityRole="button"
          >
            {imageSource ? (
              <Image source={{ uri: imageSource }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarEmoji}>👤</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraBadgeText}>＋</Text>
            </View>
            <Text style={styles.changePhoto}>Change profile photo</Text>
          </Pressable>

          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your display name"
            placeholderTextColor={COLORS.muted}
            maxLength={40}
            style={styles.input}
            returnKeyType="next"
          />

          <Text style={styles.label}>Username</Text>
          <View style={styles.usernameInputWrap}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              value={username}
              onChangeText={(value) =>
                setUsername(
                  value.replace(/\s/g, "").replace(/^@/, "").toLowerCase(),
                )
              }
              placeholder="your_username"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              style={styles.usernameInput}
              returnKeyType="done"
            />
          </View>
          <Text style={styles.helper}>
            3–20 characters. Letters, numbers, and underscores.
          </Text>

          <Pressable
            onPress={() => void saveProfile()}
            disabled={saving}
            style={[styles.saveButton, saving && styles.disabledButton]}
          >
            {saving ? (
              <ActivityIndicator color="#171020" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: { flex: 1 },
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
    marginBottom: 30,
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
  avatarWrap: { alignItems: "center", marginBottom: 34 },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: COLORS.card,
  },
  avatarPlaceholder: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "#3A2B5B",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 42 },
  cameraBadge: {
    position: "absolute",
    top: 82,
    marginLeft: 82,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.background,
  },
  cameraBadgeText: {
    color: "#171020",
    fontSize: 22,
    fontWeight: "800",
    marginTop: -2,
  },
  changePhoto: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 13,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 15,
  },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#30283F",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  },
  usernameInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#30283F",
    borderRadius: 14,
    paddingHorizontal: 15,
  },
  atSign: { color: COLORS.muted, fontSize: 16, marginRight: 4 },
  usernameInput: {
    flex: 1,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  },
  helper: { color: COLORS.muted, fontSize: 11, marginTop: 8, lineHeight: 16 },
  saveButton: {
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 32,
  },
  saveButtonText: { color: "#171020", fontSize: 15, fontWeight: "800" },
  disabledButton: { opacity: 0.65 },
});
