import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const handleAuthentication = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showMessage("Missing details", "Please enter your email and password.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      showMessage("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (isSignup && !displayName.trim()) {
      showMessage("Missing name", "Please enter your display name.");
      return;
    }

    if (password.length < 8) {
      showMessage(
        "Password too short",
        "Your password must contain at least 8 characters.",
      );
      return;
    }

    if (isSignup && password !== confirmPassword) {
      showMessage("Passwords don't match", "Please confirm your password.");
      return;
    }

    try {
      setLoading(true);

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (error) {
          showMessage("Signup failed", error.message);
          return;
        }

        if (data.user && !data.session) {
          showMessage(
            "Check your email",
            "Your account has been created. Please check your inbox and click the confirmation link before signing in.",
            () => setMode("login"),
          );
          return;
        }

        if (data.session) {
          Alert.alert("Welcome to Blinksy!", "Your account is ready.", [
            {
              text: "Continue",
              onPress: () => router.replace("/"),
            },
          ]);
          return;
        }

        showMessage(
          "Signup submitted",
          "Please check your email for further instructions.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          showMessage("Signup failed", error.message);
          return;
        }

        router.replace("/");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";

      showMessage(isSignup ? "Signup failed" : "Login failed", message);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(`${title}\n\n${message}`);
      onOk?.();
      return;
    }

    Alert.alert(title, message, [
      {
        text: "OK",
        onPress: onOk,
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { flexGrow: 1, paddingBottom: 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.logoContainer}>
              <View style={styles.logoIcon}>
                <Text style={styles.logoEmoji}>👻</Text>
              </View>

              <Text style={styles.logo}>blinksy</Text>

              <Text style={styles.tagline}>
                Your moments. Your people. Your world.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.heading}>
                {isSignup ? "Create your account" : "Welcome back"}
              </Text>

              <Text style={styles.description}>
                {isSignup
                  ? "Join Blinksy and start sharing moments."
                  : "Sign in to reconnect with your friends."}
              </Text>

              {isSignup && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Display name</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="What should we call you?"
                    placeholderTextColor="#999"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                    editable={!loading}
                    maxLength={50}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email address</Text>

                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>

                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>

              {isSignup && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm password</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password again"
                    placeholderTextColor="#999"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleAuthentication}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isSignup ? "Create account" : "Sign in"}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.switchContainer}>
                <Text style={styles.switchText}>
                  {isSignup
                    ? "Already have an account? "
                    : "Don't have an account? "}
                </Text>

                <TouchableOpacity
                  disabled={loading}
                  onPress={() => {
                    setMode(isSignup ? "login" : "signup");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                >
                  <Text style={styles.switchAction}>
                    {isSignup ? "Sign in" : "Sign up"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.footer}>Made for moments worth sharing 💜</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F7FF",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  logoIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#EAE3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logoEmoji: {
    fontSize: 34,
  },
  logo: {
    fontSize: 39,
    fontWeight: "900",
    letterSpacing: -2,
    color: "#242039",
  },
  tagline: {
    fontSize: 13,
    color: "#817C94",
    marginTop: 5,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    padding: 24,
    borderWidth: 1,
    borderColor: "#EEEAF8",
    shadowColor: "#39305E",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heading: {
    fontSize: 25,
    fontWeight: "800",
    color: "#242039",
  },
  description: {
    fontSize: 14,
    color: "#817C94",
    lineHeight: 21,
    marginTop: 7,
    marginBottom: 25,
  },
  inputGroup: {
    marginBottom: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#39334D",
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#E7E3F0",
    borderRadius: 13,
    paddingHorizontal: 15,
    fontSize: 15,
    color: "#242039",
    backgroundColor: "#FCFBFF",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#7856E8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 23,
  },
  switchText: {
    fontSize: 13,
    color: "#817C94",
  },
  switchAction: {
    fontSize: 13,
    color: "#7856E8",
    fontWeight: "800",
  },
  footer: {
    textAlign: "center",
    color: "#9993AA",
    fontSize: 12,
    marginTop: 24,
  },
});
