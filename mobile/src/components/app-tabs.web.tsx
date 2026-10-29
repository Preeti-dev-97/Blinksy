import { usePathname } from "expo-router";
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from "expo-router/ui";
import { SymbolView } from "expo-symbols";
import { Pressable, useColorScheme, View, StyleSheet } from "react-native";

import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";

import { ExternalLink } from "./external-link";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

export default function AppTabs() {
  const pathname = usePathname();
  const isCameraScreen = pathname === "/camera";

  return (
    <Tabs>
      <TabSlot style={{ height: "100%" }} />

      {!isCameraScreen && (
        <TabList asChild>
          <CustomTabList>
            <TabTrigger name="home" href="/" asChild>
              <TabButton>Home</TabButton>
            </TabTrigger>

            <TabTrigger name="explore" href="/explore" asChild>
              <TabButton>Stories</TabButton>
            </TabTrigger>

            <TabTrigger name="camera" href="/camera" asChild>
              <TabButton>Camera</TabButton>
            </TabTrigger>

            <TabTrigger name="chats" href="/chats" asChild>
              <TabButton>Chats</TabButton>
            </TabTrigger>

            <TabTrigger name="friends" href="/friends" asChild>
              <TabButton>Friends</TabButton>
            </TabTrigger>

            <TabTrigger name="profile" href="/profile" asChild>
              <TabButton>Profile</TabButton>
            </TabTrigger>
          </CustomTabList>
        </TabList>
      )}
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  const { ref: _ref, ...buttonProps } = props;

  return (
    <Pressable
      {...buttonProps}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <ThemedView
        type={isFocused ? "backgroundSelected" : "backgroundElement"}
        style={styles.tabButtonView}
      >
        <ThemedText
          type="small"
          themeColor={isFocused ? "text" : "textSecondary"}
        >
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          blinksy
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    padding: Spacing.three,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    zIndex: 20,
    pointerEvents: "box-none",
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: "auto",
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
