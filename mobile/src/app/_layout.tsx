import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Stack, DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";

import { supabase } from "@/lib/supabase";
import AuthScreen from "./auth";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setAuthLoading(false);
    });

    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Failed to restore session:", error.message);
          setSession(null);
          return;
        }

        setSession(data.session);
      } catch (error) {
        if (!mounted) return;

        console.error("Session initialization failed:", error);
        setSession(null);
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    };

    void initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {authLoading ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : session ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <AuthScreen />
      )}
    </ThemeProvider>
  );
}
