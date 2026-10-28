import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const performLogout = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        if (Platform.OS === "web" && typeof window !== "undefined") {
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

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`Logout failed: ${message}`);
      } else {
        Alert.alert("Logout failed", message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    console.log("Logout button pressed");

    if (loading) return;

    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;

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
    <Pressable
      onPress={() => {
        console.log("LOGOUT PRESSABLE PRESSED");
        window.alert("Logout button received the click!");
      }}
      onHoverIn={() => console.log("LOGOUT HOVER START")}
      onHoverOut={() => console.log("LOGOUT HOVER END")}
      accessibilityRole="button"
      accessibilityLabel="Log out"
      style={
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#F3E8FF",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 9999,
        } as any
      }
    >
      {loading ? (
        <ActivityIndicator size="small" color="#7C3AED" />
      ) : (
        <View style={styles.icon}>
          {/* Circular outline */}
          <View style={styles.circle} />

          {/* Gap at the top of the circle */}
          <View style={styles.circleGap} />

          {/* Vertical power line */}
          <View style={styles.powerLine} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    elevation: 3,
  },
  webButton: {
    cursor: "pointer",
  } as never,
  hovered: {
    backgroundColor: "#E9D5FF",
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.6,
  },
  icon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    position: "absolute",
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: "#7C3AED",
  },
  circleGap: {
    position: "absolute",
    top: 0,
    width: 8,
    height: 5,
    backgroundColor: "#F3E8FF",
  },
  powerLine: {
    position: "absolute",
    top: 0,
    width: 2.5,
    height: 11,
    borderRadius: 2,
    backgroundColor: "#7C3AED",
  },
});
