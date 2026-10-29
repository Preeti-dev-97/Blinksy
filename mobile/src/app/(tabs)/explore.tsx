import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  RefreshControl,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import { router } from "expo-router";

import {
  createStory,
  deleteStory,
  getStories,
  getStoryViewers,
  markStoryViewed,
  type Story,
  type StoryAudience,
  type StoryMediaType,
} from "@/lib/story-service";

type StoryGroup = {
  userId: string;
  stories: Story[];
  name: string;
  username: string;
  avatarUrl: string | null;
  isOwn: boolean;
  hasUnseen: boolean;
};

type SelectedMedia = {
  uri: string;
  type: StoryMediaType;
};

function getDisplayName(story: Story): string {
  return (
    story.profile?.display_name?.trim() ||
    story.profile?.username ||
    "Blinksy user"
  );
}

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();

  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / (60 * 60 * 1000));

  if (hours >= 1) return `${hours}h left`;

  const minutes = Math.max(1, Math.floor(remaining / (60 * 1000)));

  return `${minutes}m left`;
}

function StoryVideo({
  uri,
  paused,
  onPlaybackEnd,
  onDuration,
}: {
  uri: string;
  paused: boolean;
  onPlaybackEnd: () => void;
  onDuration: (durationMs: number) => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  useEffect(() => {
    const endSubscription = player.addListener("playToEnd", onPlaybackEnd);
    const statusSubscription = player.addListener("statusChange", (event) => {
      if (event.status === "readyToPlay") {
        const duration = player.duration;
        if (Number.isFinite(duration) && duration > 0) {
          onDuration(duration * 1000);
        }
      }
    });

    return () => {
      endSubscription.remove();
      statusSubscription.remove();
    };
  }, [player, onPlaybackEnd, onDuration]);

  useEffect(() => {
    if (paused) {
      player.pause();
    } else {
      player.play();
    }

    return () => {
      player.pause();
    };
  }, [paused, player]);

  return (
    <VideoView
      player={player}
      style={styles.viewerMedia}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

export default function StoriesScreen() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(
    null,
  );
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<StoryAudience>("friends");
  const [publishing, setPublishing] = useState(false);

  const [viewerStories, setViewerStories] = useState<Story[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [currentDurationMs, setCurrentDurationMs] = useState(5000);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressValue = useRef(0);
  const longPressActive = useRef(false);
  const advanceViewerRef = useRef<() => void>(() => {});

  const [viewersVisible, setViewersVisible] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const viewedIds = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  const loadStories = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    setScreenError(null);

    try {
      const data = await getStories();

      if (!mounted.current) return;

      setStories(data);
      viewedIds.current = new Set(
        data.filter((story) => story.has_viewed).map((story) => story.id),
      );
    } catch (error) {
      if (!mounted.current) return;

      setScreenError(
        error instanceof Error
          ? error.message
          : "Couldn't load stories. Please try again.",
      );
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadStories();

    return () => {
      mounted.current = false;
    };
  }, [loadStories]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Story[]>();

    for (const story of stories) {
      const existing = grouped.get(story.user_id) ?? [];
      existing.push(story);
      grouped.set(story.user_id, existing);
    }

    const result: StoryGroup[] = Array.from(grouped.entries()).map(
      ([userId, userStories]) => {
        const profile = userStories[0]?.profile;

        const name =
          profile?.display_name?.trim() ||
          profile?.username?.trim() ||
          "Blinksy User";

        return {
          userId,
          stories: userStories,
          name,
          username: profile?.username?.trim() || "",
          avatarUrl: profile?.avatar_url || null,
          isOwn: userId === currentUserId,
          hasUnseen:
            userId !== currentUserId &&
            userStories.some((story) => !story.has_viewed),
        };
      },
    );

    return result.sort((a, b) => {
      if (a.isOwn) return -1;
      if (b.isOwn) return 1;

      if (a.hasUnseen !== b.hasUnseen) {
        return a.hasUnseen ? -1 : 1;
      }

      return 0;
    });
  }, [stories, currentUserId]);

  useEffect(() => {
    let active = true;

    import("@/lib/supabase").then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        if (active) {
          setCurrentUserId(data.user?.id ?? null);
        }
      });
    });

    return () => {
      active = false;
    };
  }, []);

  const ownStories = useMemo(
    () => stories.filter((story) => story.user_id === currentUserId),
    [stories, currentUserId],
  );

  const chooseMedia = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo library access so you can choose a photo or video for your story.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.85,
        videoMaxDuration: 60,
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      const asset = result.assets[0];

      setSelectedMedia({
        uri: asset.uri,
        type: asset.type === "video" ? "video" : "image",
      });

      setCaption("");
      setAudience("friends");
      setCreateModalVisible(true);
    } catch (error) {
      Alert.alert(
        "Couldn't open gallery",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const publishStory = async () => {
    if (!selectedMedia) {
      Alert.alert("Choose media", "Select a photo or video first.");
      return;
    }

    setPublishing(true);

    try {
      await createStory({
        uri: selectedMedia.uri,
        mediaType: selectedMedia.type,
        caption,
        audience,
      });

      setCreateModalVisible(false);
      setSelectedMedia(null);
      setCaption("");

      await loadStories(false);

      Alert.alert("Story shared!", "Your story is now on Blinksy.");
    } catch (error) {
      Alert.alert(
        "Couldn't publish story",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const openStoryGroup = async (group: StoryGroup) => {
    const activeStories = group.stories.filter(
      (story) => new Date(story.expires_at).getTime() > Date.now(),
    );

    if (activeStories.length === 0) {
      await loadStories(false);
      return;
    }

    const firstUnseen = activeStories.findIndex(
      (story) => !story.has_viewed && !group.isOwn,
    );

    const initialIndex = firstUnseen >= 0 ? firstUnseen : 0;

    setViewerStories(activeStories);
    setViewerIndex(initialIndex);
    setViewerError(null);
    setViewerPaused(false);
    progressValue.current = 0;
    progressAnim.setValue(0);
    setCurrentDurationMs(
      activeStories[initialIndex]?.media_type === "video" ? 15000 : 5000,
    );
    setViewerVisible(true);

    if (!group.isOwn) {
      void recordView(activeStories[initialIndex]);
    }
  };

  const recordView = async (story: Story) => {
    if (story.user_id === currentUserId || viewedIds.current.has(story.id)) {
      return;
    }

    viewedIds.current.add(story.id);

    setStories((previous) =>
      previous.map((item) =>
        item.id === story.id ? { ...item, has_viewed: true } : item,
      ),
    );

    try {
      await markStoryViewed(story.id);
    } catch (error) {
      viewedIds.current.delete(story.id);

      console.warn("Could not record story view:", error);
    }
  };

  const moveViewer = async (direction: 1 | -1) => {
    const nextIndex = viewerIndex + direction;

    if (nextIndex < 0) {
      setViewerVisible(false);
      return;
    }

    if (nextIndex >= viewerStories.length) {
      const currentOwnerId = viewerStories[viewerIndex]?.user_id;
      const friendGroups = groups.filter((group) => !group.isOwn);
      const currentGroupIndex = friendGroups.findIndex(
        (group) => group.userId === currentOwnerId,
      );
      const nextGroups =
        currentGroupIndex < 0
          ? friendGroups
          : friendGroups.slice(currentGroupIndex + 1);

      const nextGroup = nextGroups.find((group) =>
        group.stories.some(
          (story) => new Date(story.expires_at).getTime() > Date.now(),
        ),
      );

      if (!nextGroup) {
        setViewerVisible(false);
        return;
      }

      const activeNextStories = nextGroup.stories.filter(
        (story) => new Date(story.expires_at).getTime() > Date.now(),
      );
      const unseenIndex = activeNextStories.findIndex(
        (story) => !story.has_viewed,
      );
      const nextGroupIndex = unseenIndex >= 0 ? unseenIndex : 0;
      const nextGroupStory = activeNextStories[nextGroupIndex];

      setViewerStories(activeNextStories);
      setViewerError(null);
      progressValue.current = 0;
      progressAnim.setValue(0);
      setCurrentDurationMs(
        nextGroupStory?.media_type === "video" ? 15000 : 5000,
      );
      setViewerIndex(nextGroupIndex);
      setViewerPaused(false);

      if (nextGroupStory) {
        void recordView(nextGroupStory);
      }
      return;
    }

    setViewerError(null);
    progressValue.current = 0;
    progressAnim.setValue(0);
    setCurrentDurationMs(
      viewerStories[nextIndex]?.media_type === "video" ? 15000 : 5000,
    );
    setViewerIndex(nextIndex);
    setViewerPaused(false);

    const nextStory = viewerStories[nextIndex];

    if (nextStory.user_id !== currentUserId) {
      void recordView(nextStory);
    }
  };

  const showViewers = async (story: Story) => {
    setViewersVisible(true);
    setViewersLoading(true);
    setViewers([]);

    try {
      const data = await getStoryViewers(story.id);

      setViewers(data);
    } catch (error) {
      Alert.alert(
        "Couldn't load viewers",
        error instanceof Error ? error.message : "Please try again.",
      );
      setViewersVisible(false);
    } finally {
      setViewersLoading(false);
    }
  };

  const removeStory = (story: Story) => {
    Alert.alert(
      "Delete story?",
      "This story will be removed for everyone who can see it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStory(story);

              setViewerVisible(false);
              setViewerStories([]);
              setStories((previous) =>
                previous.filter((item) => item.id !== story.id),
              );

              Alert.alert("Story deleted", "Your story has been removed.");
            } catch (error) {
              Alert.alert(
                "Couldn't delete story",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const currentStory = viewerStories[viewerIndex] ?? null;
  const isOwnCurrentStory = currentStory?.user_id === currentUserId;

  advanceViewerRef.current = () => {
    void moveViewer(1);
  };

  const handleVideoEnded = useCallback(() => {
    advanceViewerRef.current();
  }, []);

  const handleVideoDuration = useCallback((durationMs: number) => {
    setCurrentDurationMs(durationMs);
  }, []);

  useEffect(() => {
    if (!viewerVisible || !currentStory) return;

    if (viewerPaused) {
      progressAnim.stopAnimation((value) => {
        progressValue.current = value;
      });
      return;
    }

    const startValue = progressValue.current;
    const remainingMs = Math.max(1, currentDurationMs * (1 - startValue));
    const animation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remainingMs,
      useNativeDriver: false,
    });
    const listenerId = progressAnim.addListener(({ value }) => {
      progressValue.current = value;
    });

    animation.start(({ finished }) => {
      if (finished && currentStory.media_type === "image") {
        advanceViewerRef.current();
      }
    });

    return () => {
      animation.stop();
      progressAnim.removeListener(listenerId);
      progressAnim.stopAnimation((value) => {
        progressValue.current = value;
      });
    };
  }, [
    viewerVisible,
    viewerPaused,
    currentStory?.id,
    currentStory?.media_type,
    currentDurationMs,
    progressAnim,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadStories} />
        }
        onScrollBeginDrag={() => {}}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>blinksy</Text>
            <Text style={styles.subtitle}>Stories</Text>
          </View>

          <Pressable
            style={styles.profileButton}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/edit-profile" as never)}
          >
            <Text style={styles.profileIcon}>👤</Text>
          </Pressable>
        </View>

        <View style={styles.headingContainer}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.heading}>Friends' stories</Text>
              <Text style={styles.description}>
                Little moments from the people you care about.
              </Text>
            </View>

            <Pressable
              onPress={() => {
                setRefreshing(true);
                void loadStories(false);
              }}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh stories"
            >
              <Text style={styles.refreshText}>↻</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>Loading stories...</Text>
          </View>
        ) : screenError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn't load stories</Text>
            <Text style={styles.errorText}>{screenError}</Text>
            <Pressable
              style={styles.shareButton}
              onPress={() => void loadStories()}
            >
              <Text style={styles.shareButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storiesList}
            >
              <Pressable
                style={styles.storyItem}
                onPress={() => {
                  if (ownStories.length > 0) {
                    const ownGroup = groups.find((group) => group.isOwn);

                    if (ownGroup) void openStoryGroup(ownGroup);
                  } else {
                    void chooseMedia();
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  ownStories.length > 0
                    ? "View your story"
                    : "Create your story"
                }
              >
                <View
                  style={[
                    styles.storyRing,
                    ownStories.length === 0 && styles.ownStoryRing,
                  ]}
                >
                  {ownStories[0]?.profile?.avatar_url ? (
                    <Image
                      source={{ uri: ownStories[0].profile.avatar_url }}
                      style={styles.storyAvatarImage}
                    />
                  ) : (
                    <View style={[styles.storyAvatar, styles.ownStoryAvatar]}>
                      <Text style={styles.ownAvatarText}>
                        {ownStories.length > 0 ? getInitials("You") : "+"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.storyName}>Your story</Text>
              </Pressable>

              {groups
                .filter((group) => !group.isOwn)
                .map((group) => (
                  <Pressable
                    key={group.userId}
                    style={styles.storyItem}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.name}'s story`}
                    onPress={() => void openStoryGroup(group)}
                  >
                    <View
                      style={[
                        styles.storyRing,
                        !group.hasUnseen && styles.seenStoryRing,
                      ]}
                    >
                      {group.avatarUrl ? (
                        <Image
                          source={{ uri: group.avatarUrl }}
                          style={styles.storyAvatarImage}
                        />
                      ) : (
                        <View style={styles.storyAvatar}>
                          <Text style={styles.avatarText}>
                            {getInitials(group.name)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.storyName} numberOfLines={1}>
                      {group.name}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>

            {stories.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyEmoji}>✨</Text>
                </View>

                <Text style={styles.emptyTitle}>Your story starts here</Text>

                <Text style={styles.emptyDescription}>
                  Share a photo or video with your friends. Your stories will
                  appear here for 24 hours.
                </Text>

                <Pressable
                  style={styles.shareButton}
                  accessibilityRole="button"
                  onPress={() => void chooseMedia()}
                >
                  <Text style={styles.shareButtonText}>Create a story</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.activeStoriesCard}>
                <View style={styles.activeStoriesHeader}>
                  <View style={styles.activeStoriesIcon}>
                    <Text style={styles.activeStoriesEmoji}>✨</Text>
                  </View>
                  <View style={styles.activeStoriesCopy}>
                    <Text style={styles.activeStoriesTitle}>
                      Moments worth sharing
                    </Text>
                    <Text style={styles.activeStoriesDescription}>
                      {stories.length} active{" "}
                      {stories.length === 1 ? "story" : "stories"} · disappear
                      after 24 hours
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={styles.shareButton}
                  accessibilityRole="button"
                  onPress={() => void chooseMedia()}
                >
                  <Text style={styles.shareButtonText}>＋ Create a story</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        <Text style={styles.footerText}>
          Your everyday moments deserve a little spotlight.
        </Text>
      </ScrollView>

      {/* Create story */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!publishing) setCreateModalVisible(false);
        }}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setCreateModalVisible(false)}
              disabled={publishing}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>

            <Text style={styles.modalTitle}>Create a story</Text>

            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.createContent}
            keyboardShouldPersistTaps="handled"
          >
            {selectedMedia ? (
              selectedMedia.type === "image" ? (
                <Image
                  source={{ uri: selectedMedia.uri }}
                  style={styles.mediaPreview}
                  resizeMode="contain"
                />
              ) : (
                <PreviewVideo uri={selectedMedia.uri} />
              )
            ) : null}

            <Text style={styles.fieldLabel}>Add a caption</Text>

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Write something about this moment..."
              placeholderTextColor="#96919F"
              style={styles.captionInput}
              multiline
              maxLength={300}
            />

            <Text style={styles.fieldLabel}>Who can see your story?</Text>

            <Pressable
              style={[
                styles.audienceOption,
                audience === "friends" && styles.audienceOptionSelected,
              ]}
              onPress={() => setAudience("friends")}
            >
              <View style={styles.audienceIcon}>
                <Text style={styles.audienceEmoji}>👥</Text>
              </View>
              <View style={styles.audienceCopy}>
                <Text style={styles.audienceTitle}>Friends</Text>
                <Text style={styles.audienceDescription}>
                  Only accepted friends can view it.
                </Text>
              </View>
              <Text style={styles.radioText}>
                {audience === "friends" ? "●" : "○"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.audienceOption,
                audience === "public" && styles.audienceOptionSelected,
              ]}
              onPress={() => setAudience("public")}
            >
              <View style={styles.audienceIcon}>
                <Text style={styles.audienceEmoji}>🌍</Text>
              </View>
              <View style={styles.audienceCopy}>
                <Text style={styles.audienceTitle}>Public</Text>
                <Text style={styles.audienceDescription}>
                  Any authenticated Blinksy user can view it.
                </Text>
              </View>
              <Text style={styles.radioText}>
                {audience === "public" ? "●" : "○"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.shareButton, publishing && styles.disabledButton]}
              disabled={publishing || !selectedMedia}
              onPress={() => void publishStory()}
            >
              {publishing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.shareButtonText}>Share story</Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Full-screen story viewer */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerContainer}>
          <StatusBar hidden />

          {currentStory ? (
            <>
              <View style={styles.progressTrack}>
                {viewerStories.map((story, index) => (
                  <View key={story.id} style={styles.progressSegment}>
                    <View
                      style={[
                        styles.progressFill,
                        index < viewerIndex && styles.progressComplete,
                        index === viewerIndex && styles.progressCurrent,
                      ]}
                    >
                      {index === viewerIndex ? (
                        <Animated.View
                          style={[
                            styles.animatedProgressFill,
                            {
                              width: progressAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["0%", "100%"],
                              }),
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.viewerHeader}>
                <View style={styles.viewerProfile}>
                  {currentStory.profile?.avatar_url ? (
                    <Image
                      source={{ uri: currentStory.profile.avatar_url }}
                      style={styles.viewerAvatar}
                    />
                  ) : (
                    <View style={styles.viewerAvatarFallback}>
                      <Text style={styles.viewerAvatarText}>
                        {getInitials(getDisplayName(currentStory))}
                      </Text>
                    </View>
                  )}

                  <View style={styles.viewerProfileCopy}>
                    <Text style={styles.viewerName}>
                      {getDisplayName(currentStory)}
                    </Text>
                    <Text style={styles.viewerTime}>
                      {formatTimeRemaining(currentStory.expires_at)}
                      {" · "}
                      {currentStory.audience === "public"
                        ? "Public"
                        : "Friends"}
                    </Text>
                  </View>
                </View>

                <View style={styles.viewerActions}>
                  {isOwnCurrentStory ? (
                    <>
                      <Pressable
                        style={styles.viewerAction}
                        onPress={() => void showViewers(currentStory)}
                        accessibilityLabel="View story viewers"
                      >
                        <Text style={styles.viewerActionText}>👁</Text>
                      </Pressable>

                      <Pressable
                        style={styles.viewerAction}
                        onPress={() => removeStory(currentStory)}
                        accessibilityLabel="Delete story"
                      >
                        <Text style={styles.viewerActionText}>🗑</Text>
                      </Pressable>
                    </>
                  ) : null}

                  <Pressable
                    style={styles.viewerAction}
                    onPress={() => setViewerVisible(false)}
                    accessibilityLabel="Close story"
                  >
                    <Text style={styles.viewerActionText}>✕</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.viewerMediaContainer}>
                {currentStory.media_type === "image" ? (
                  <Image
                    source={{ uri: currentStory.media_url }}
                    style={styles.viewerMedia}
                    resizeMode="contain"
                    onError={() => setViewerError("Couldn't load this photo.")}
                  />
                ) : (
                  <StoryVideo
                    key={currentStory.id}
                    uri={currentStory.media_url}
                    paused={viewerPaused}
                    onPlaybackEnd={handleVideoEnded}
                    onDuration={handleVideoDuration}
                  />
                )}

                {viewerError ? (
                  <View style={styles.viewerErrorOverlay}>
                    <Text style={styles.viewerErrorText}>{viewerError}</Text>
                  </View>
                ) : null}

                <Pressable
                  style={styles.viewerLeftTap}
                  delayLongPress={250}
                  onPressIn={() => {
                    longPressActive.current = false;
                  }}
                  onLongPress={() => {
                    longPressActive.current = true;
                    setViewerPaused(true);
                  }}
                  onPress={() => {
                    if (longPressActive.current) return;
                    void moveViewer(-1);
                  }}
                  onPressOut={() => setViewerPaused(false)}
                  accessibilityLabel="Previous story"
                />

                <Pressable
                  style={styles.viewerRightTap}
                  delayLongPress={250}
                  onPressIn={() => {
                    longPressActive.current = false;
                  }}
                  onLongPress={() => {
                    longPressActive.current = true;
                    setViewerPaused(true);
                  }}
                  onPress={() => {
                    if (longPressActive.current) return;
                    void moveViewer(1);
                  }}
                  onPressOut={() => setViewerPaused(false)}
                  accessibilityLabel="Next story"
                />
              </View>

              <View style={styles.viewerBottom}>
                {!!currentStory.caption && (
                  <Text style={styles.viewerCaption}>
                    {currentStory.caption}
                  </Text>
                )}

                <Text style={styles.viewerHint}>
                  Tap left or right to navigate · Hold to pause
                </Text>
              </View>
            </>
          ) : (
            <ActivityIndicator color="#FFFFFF" />
          )}
        </View>
      </Modal>

      {/* Story viewers */}
      <Modal
        visible={viewersVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setViewersVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setViewersVisible(false)}
          />

          <View style={styles.viewersSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.viewersHeadingRow}>
              <Text style={styles.viewersTitle}>Story viewers</Text>
              <Pressable onPress={() => setViewersVisible(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </Pressable>
            </View>

            {viewersLoading ? (
              <ActivityIndicator
                size="large"
                color="#7C3AED"
                style={styles.viewersLoader}
              />
            ) : viewers.length === 0 ? (
              <Text style={styles.noViewersText}>
                No one has viewed this story yet.
              </Text>
            ) : (
              <ScrollView>
                {viewers.map((item) => {
                  const profile = Array.isArray(item.profile)
                    ? item.profile[0]
                    : item.profile;

                  const name =
                    profile?.display_name ||
                    profile?.username ||
                    "Blinksy user";

                  return (
                    <View key={item.viewer_id} style={styles.viewerRow}>
                      {profile?.avatar_url ? (
                        <Image
                          source={{ uri: profile.avatar_url }}
                          style={styles.viewerListAvatar}
                        />
                      ) : (
                        <View style={styles.viewerListAvatarFallback}>
                          <Text style={styles.avatarText}>
                            {getInitials(name)}
                          </Text>
                        </View>
                      )}

                      <View style={styles.viewerListCopy}>
                        <Text style={styles.viewerListName}>{name}</Text>
                        <Text style={styles.viewerListTime}>
                          {new Date(item.viewed_at).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    player.play();

    return () => {
      player.pause();
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.mediaPreview}
      contentFit="contain"
      nativeControls
    />
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
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: {
    flex: 1,
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
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F4F1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: {
    color: "#6D28D9",
    fontSize: 28,
    lineHeight: 32,
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
    borderWidth: 2.5,
    borderColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  seenStoryRing: {
    borderColor: "#D8D5DF",
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
  storyAvatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
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
    maxWidth: 76,
  },
  loadingContainer: {
    paddingVertical: 42,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#85818E",
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: "#FFF5F5",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    marginTop: 20,
  },
  errorTitle: {
    color: "#991B1B",
    fontSize: 17,
    fontWeight: "800",
  },
  errorText: {
    color: "#7F1D1D",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
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
    alignItems: "center",
    justifyContent: "center",
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  activeStoriesCard: {
    backgroundColor: "#F8F6FC",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#EEE8F7",
    padding: 20,
    marginTop: 30,
  },
  activeStoriesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  activeStoriesIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "#FFF0BF",
    alignItems: "center",
    justifyContent: "center",
  },
  activeStoriesEmoji: {
    fontSize: 23,
  },
  activeStoriesCopy: {
    flex: 1,
  },
  activeStoriesTitle: {
    color: "#211A36",
    fontSize: 16,
    fontWeight: "800",
  },
  activeStoriesDescription: {
    color: "#77727F",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  footerText: {
    color: "#96919F",
    fontSize: 11,
    textAlign: "center",
    marginTop: 26,
    lineHeight: 18,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDF5",
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#F4F1FA",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: "#211A36",
    fontSize: 17,
  },
  modalTitle: {
    color: "#211A36",
    fontSize: 17,
    fontWeight: "800",
  },
  modalHeaderSpacer: {
    width: 38,
  },
  createContent: {
    padding: 22,
    paddingBottom: 40,
  },
  mediaPreview: {
    width: "100%",
    height: 330,
    backgroundColor: "#171522",
    borderRadius: 22,
    marginBottom: 24,
  },
  fieldLabel: {
    color: "#211A36",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 8,
  },
  captionInput: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E9E2F3",
    backgroundColor: "#FAF9FC",
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 14,
    color: "#211A36",
    textAlignVertical: "top",
    marginBottom: 22,
  },
  audienceOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9E2F3",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  audienceOptionSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F7F3FF",
  },
  audienceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EEE7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  audienceEmoji: {
    fontSize: 20,
  },
  audienceCopy: {
    flex: 1,
  },
  audienceTitle: {
    color: "#211A36",
    fontSize: 14,
    fontWeight: "800",
  },
  audienceDescription: {
    color: "#77727F",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  radioText: {
    color: "#7C3AED",
    fontSize: 21,
  },
  disabledButton: {
    opacity: 0.65,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: "#08070D",
    paddingTop: Platform.OS === "ios" ? 12 : 24,
  },
  progressTrack: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "0%",
    backgroundColor: "#FFFFFF",
  },
  progressComplete: {
    width: "100%",
  },
  progressCurrent: {
    width: "100%",
    backgroundColor: "transparent",
  },
  animatedProgressFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 15,
    gap: 8,
  },
  viewerProfile: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  viewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  viewerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  viewerProfileCopy: {
    flex: 1,
  },
  viewerName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  viewerTime: {
    color: "#BDB8C9",
    fontSize: 11,
    marginTop: 4,
  },
  viewerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  viewerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  viewerActionText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  viewerMediaContainer: {
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  viewerMedia: {
    width: "100%",
    height: "100%",
  },
  viewerLeftTap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "35%",
  },
  viewerRightTap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: "65%",
  },
  viewerErrorOverlay: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 12,
    padding: 14,
  },
  viewerErrorText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  viewerBottom: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    minHeight: 70,
  },
  viewerCaption: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  viewerHint: {
    color: "#A7A1B3",
    fontSize: 11,
    textAlign: "center",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  viewersSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    maxHeight: "70%",
    minHeight: 260,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#DED9E8",
    marginBottom: 20,
  },
  viewersHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  viewersTitle: {
    color: "#211A36",
    fontSize: 20,
    fontWeight: "800",
  },
  sheetClose: {
    color: "#77727F",
    fontSize: 18,
    padding: 5,
  },
  viewersLoader: {
    marginTop: 35,
  },
  noViewersText: {
    color: "#77727F",
    textAlign: "center",
    paddingVertical: 35,
    fontSize: 13,
  },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDF5",
  },
  viewerListAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  viewerListAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E8DEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerListCopy: {
    flex: 1,
  },
  viewerListName: {
    color: "#211A36",
    fontSize: 14,
    fontWeight: "700",
  },
  viewerListTime: {
    color: "#85818E",
    fontSize: 11,
    marginTop: 4,
  },
});
