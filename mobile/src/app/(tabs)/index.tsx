import React from "react";
import NotificationBell from "@/components/notification-bell";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        if (Platform.OS === "web") {
          window.alert(`Logout failed: ${error.message}`);
        } else {
          Alert.alert("Logout failed", error.message);
        }
        return;
      }

      router.replace("/auth");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";

      if (Platform.OS === "web") {
        window.alert(`Logout failed: ${message}`);
      } else {
        Alert.alert("Logout failed", message);
      }
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (loggingOut) return;

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to log out of Blinksy?")) {
        void performLogout();
      }

      return;
    }

    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => void performLogout(),
      },
    ]);
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>blinksy</Text>
            <Text style={styles.tagline}>Capture it. Share it. Live it.</Text>
          </View>
          {/* Header Actions */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              zIndex: 100,
              elevation: 3,
            }}
          >
            <NotificationBell />
            <TouchableOpacity
              style={[styles.profileButton, { cursor: "pointer" } as any]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => {
                router.push("/profile");
              }}
            >
              <Text style={styles.profileIcon}>👤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main heading */}
        <View style={styles.headingContainer}>
          <Text style={styles.heading}>Capture the moment.</Text>
          <Text style={styles.subheading}>
            The best moments are meant to be shared.
          </Text>
        </View>

        {/* Camera preview */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.cameraCard}
          accessibilityRole="button"
          accessibilityLabel="Open camera"
          onPress={() => router.push("/camera")}
        >
          <View style={styles.cameraTopRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>YOUR MOMENT</Text>
            </View>

            <Text style={styles.cameraEmoji}>✦</Text>
          </View>

          <View style={styles.cameraCenter}>
            <View style={styles.cameraIconCircle}>
              <Text style={styles.cameraIcon}>📸</Text>
            </View>

            <Text style={styles.cameraTitle}>Ready, set, snap!</Text>
            <Text style={styles.cameraDescription}>
              Capture something worth remembering.
            </Text>
          </View>

          <View style={styles.cameraBottomRow}>
            <Text style={styles.cameraHint}>TAP TO CAPTURE</Text>

            <View style={styles.captureButton}>
              <View style={styles.captureButtonInner} />
            </View>

            <Text style={styles.cameraHint}>MAKE IT YOURS</Text>
          </View>
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            accessibilityRole="button"
            onPress={() => router.push("/chats")}
          >
            <View style={[styles.actionIcon, styles.chatIconBackground]}>
              <Text style={styles.actionEmoji}>💬</Text>
            </View>
            <Text style={styles.actionTitle}>Chats</Text>
            <Text style={styles.actionDescription}>Talk to friends</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            accessibilityRole="button"
            onPress={() => router.push("/explore")}
          >
            <View style={[styles.actionIcon, styles.storyIconBackground]}>
              <Text style={styles.actionEmoji}>✨</Text>
            </View>
            <Text style={styles.actionTitle}>Stories</Text>
            <Text style={styles.actionDescription}>Share your day</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom navigation */}
        <View style={styles.bottomNavigation}>
          <TouchableOpacity
            style={styles.navItem}
            accessibilityRole="button"
            accessibilityLabel="Chats"
            onPress={() => router.push("/chats")}
          >
            <Text style={styles.navEmoji}>💬</Text>
            <Text style={styles.navLabel}>Chats</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cameraNavItem}
            accessibilityRole="button"
            accessibilityLabel="Camera"
            onPress={() => router.push("/camera")}
          >
            <View style={styles.cameraNavButton}>
              <Text style={styles.cameraNavEmoji}>📸</Text>
            </View>
            <Text style={styles.navLabelActive}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            accessibilityRole="button"
            accessibilityLabel="Stories"
            onPress={() => router.push("/explore")}
          >
            <Text style={styles.navEmoji}>✨</Text>
            <Text style={styles.navLabel}>Stories</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  logo: {
    color: "#171717",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  tagline: {
    color: "#858585",
    fontSize: 11,
    marginTop: 1,
  },
  profileButton: {
    height: 46,
    width: 46,
    borderRadius: 23,
    backgroundColor: "#F4F1FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E9E2FF",
  },
  profileIcon: {
    fontSize: 22,
  },
  headingContainer: {
    marginTop: 28,
    marginBottom: 20,
  },
  heading: {
    fontSize: 25,
    fontWeight: "800",
    color: "#171717",
    letterSpacing: -0.7,
  },
  subheading: {
    fontSize: 13,
    color: "#858585",
    marginTop: 7,
    lineHeight: 19,
  },
  cameraCard: {
    flex: 1,
    minHeight: 300,
    maxHeight: 450,
    backgroundColor: "#211A36",
    borderRadius: 30,
    padding: 19,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  cameraTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#B7F397",
    marginRight: 7,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1.2,
  },
  cameraEmoji: {
    fontSize: 25,
    color: "#F8E66B",
  },
  cameraCenter: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  cameraIconCircle: {
    height: 94,
    width: 94,
    borderRadius: 47,
    backgroundColor: "#F9E86B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  cameraIcon: {
    fontSize: 43,
  },
  cameraTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  cameraDescription: {
    color: "#C9C4D4",
    fontSize: 12,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 5,
    lineHeight: 18,
  },
  cameraBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cameraHint: {
    color: "#C9C4D4",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  captureButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F9E86B",
  },
  quickActions: {
    flexDirection: "row",
    gap: 13,
    marginTop: 18,
    marginBottom: 17,
  },
  actionCard: {
    flex: 1,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#F8F7FB",
    borderWidth: 1,
    borderColor: "#F0EDF5",
  },
  actionIcon: {
    height: 43,
    width: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  chatIconBackground: {
    backgroundColor: "#E7E0FF",
  },
  storyIconBackground: {
    backgroundColor: "#FFF1C6",
  },
  actionEmoji: {
    fontSize: 21,
  },
  actionTitle: {
    color: "#202020",
    fontSize: 15,
    fontWeight: "800",
  },
  actionDescription: {
    color: "#858585",
    fontSize: 10,
    marginTop: 5,
  },
  bottomNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 12,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: "#F0EEF4",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navEmoji: {
    fontSize: 21,
  },
  navLabel: {
    color: "#92909A",
    fontSize: 10,
    fontWeight: "600",
  },
  cameraNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
  },
  cameraNavButton: {
    height: 57,
    width: 57,
    borderRadius: 21,
    backgroundColor: "#F9E86B",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  cameraNavEmoji: {
    fontSize: 24,
  },
  navLabelActive: {
    color: "#211A36",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
});
