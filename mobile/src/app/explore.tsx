import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const stories = [
  { id: "1", name: "Your story", initials: "+", isOwn: true },
  { id: "2", name: "Alex", initials: "A" },
  { id: "3", name: "Maya", initials: "M" },
  { id: "4", name: "Jordan", initials: "J" },
  { id: "5", name: "Sam", initials: "S" },
];

export default function StoriesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>blinksy</Text>
            <Text style={styles.subtitle}>Stories</Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => {}}
          >
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headingContainer}>
          <Text style={styles.heading}>Friends' stories</Text>
          <Text style={styles.description}>
            Little moments from the people you care about.
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesList}
        >
          {stories.map((story) => (
            <TouchableOpacity
              key={story.id}
              style={styles.storyItem}
              accessibilityRole="button"
              accessibilityLabel={`${story.name} story`}
              onPress={() => {}}
            >
              <View
                style={[styles.storyRing, story.isOwn && styles.ownStoryRing]}
              >
                <View
                  style={[
                    styles.storyAvatar,
                    story.isOwn && styles.ownStoryAvatar,
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      story.isOwn && styles.ownAvatarText,
                    ]}
                  >
                    {story.initials}
                  </Text>
                </View>
              </View>
              <Text style={styles.storyName}>{story.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyEmoji}>✨</Text>
          </View>

          <Text style={styles.emptyTitle}>Your story starts here</Text>

          <Text style={styles.emptyDescription}>
            Share a photo or video with your friends. Your stories will appear
            here for 24 hours.
          </Text>

          <TouchableOpacity
            style={styles.shareButton}
            accessibilityRole="button"
            onPress={() => {}}
          >
            <Text style={styles.shareButtonText}>Create a story</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>
          Your everyday moments deserve a little spotlight.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    color: "#171717",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  subtitle: {
    color: "#858585",
    fontSize: 12,
    marginTop: 2,
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
    marginTop: 32,
    marginBottom: 24,
  },
  heading: {
    color: "#171717",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  description: {
    color: "#858585",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  storiesList: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  storyItem: {
    alignItems: "center",
    width: 76,
    marginRight: 12,
  },
  storyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 3,
    borderWidth: 2,
    borderColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  ownStoryRing: {
    borderColor: "#D8D5DF",
  },
  storyAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#E8DEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ownStoryAvatar: {
    backgroundColor: "#F5F3F8",
  },
  avatarText: {
    color: "#49347B",
    fontSize: 20,
    fontWeight: "800",
  },
  ownAvatarText: {
    color: "#6D28D9",
    fontSize: 27,
    fontWeight: "500",
  },
  storyName: {
    color: "#424047",
    fontSize: 11,
    marginTop: 8,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#F8F6FC",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#EEE8F7",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
    marginTop: 34,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#FFF0BF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyEmoji: {
    fontSize: 30,
  },
  emptyTitle: {
    color: "#211A36",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDescription: {
    color: "#77727F",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },
  shareButton: {
    backgroundColor: "#211A36",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 22,
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  footerText: {
    color: "#96919F",
    fontSize: 11,
    textAlign: "center",
    marginTop: 26,
    lineHeight: 18,
  },
});
