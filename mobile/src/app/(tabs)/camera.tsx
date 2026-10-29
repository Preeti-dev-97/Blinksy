import React, { useEffect, useRef, useState } from "react";
import Svg, { Path } from "react-native-svg";
import { PanResponder } from "react-native";
import { Platform, Alert } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { File as ExpoFile, Paths } from "expo-file-system";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
  useMicrophonePermissions,
} from "expo-camera";
import { VideoView, useVideoPlayer } from "expo-video";
import { router } from "expo-router";
import {
  createDirectConversation,
  getCurrentChatUser,
  searchChatProfiles,
  sendSnapMessage,
  type ChatProfile,
} from "@/lib/chat-service";

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const videoPlayer = useVideoPlayer(videoUri, (player) => {
    player.loop = true;
  });
  const [recordedVideoUri, setRecordedVideoUri] = useState<string | null>(null);
  const [microphonePermission, requestMicrophonePermission] =
    useMicrophonePermissions();
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [isRecipientPickerVisible, setIsRecipientPickerVisible] =
    useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientProfiles, setRecipientProfiles] = useState<ChatProfile[]>([]);
  const [isSearchingRecipients, setIsSearchingRecipients] = useState(false);
  const [isSendingSnap, setIsSendingSnap] = useState(false);
  const [sendingSnapRecipientId, setSendingSnapRecipientId] = useState<
    string | null
  >(null);
  const [caption, setCaption] = useState("");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingColor, setDrawingColor] = useState("#FFFFFF");
  const [drawingPaths, setDrawingPaths] = useState<
    { d: string; color: string }[]
  >([]);
  const [stickers, setStickers] = useState<
    { id: string; emoji: string; x: number; y: number }[]
  >([]);
  const [isStickerPickerVisible, setIsStickerPickerVisible] = useState(false);
  const [activeActionHint, setActiveActionHint] = useState<string | null>(null);
  const actionHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showActionHint = (label: string) => {
    setActiveActionHint(label);

    if (actionHintTimer.current) {
      clearTimeout(actionHintTimer.current);
    }

    actionHintTimer.current = setTimeout(() => {
      setActiveActionHint(null);
    }, 1400);
  };
  type PhotoFilter = "normal" | "bw" | "warm" | "cool" | "vintage";
  const [selectedFilter, setSelectedFilter] = useState<PhotoFilter>("normal");
  const snapPreviewRef = useRef<React.ElementRef<typeof View>>(null);

  const PHOTO_FILTERS: {
    id: PhotoFilter;
    label: string;
    color: string;
    opacity: number;
  }[] = [
    {
      id: "normal",
      label: "Normal",
      color: "transparent",
      opacity: 0,
    },
    {
      id: "bw",
      label: "B&W",
      color: "#777777",
      opacity: 0.65,
    },
    {
      id: "warm",
      label: "Warm",
      color: "#FF8A32",
      opacity: 0.22,
    },
    {
      id: "cool",
      label: "Cool",
      color: "#4A90E2",
      opacity: 0.2,
    },
    {
      id: "vintage",
      label: "Vintage",
      color: "#A87845",
      opacity: 0.28,
    },
  ];

  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecipientPickerVisible) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setIsSearchingRecipients(true);
        const [profiles, currentUser] = await Promise.all([
          searchChatProfiles(recipientSearch),
          getCurrentChatUser(),
        ]);
        if (!cancelled) {
          setRecipientProfiles(
            profiles.filter((profile) => profile.id !== currentUser.id),
          );
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            "Couldn't load friends",
            error instanceof Error ? error.message : "Please try again.",
          );
        }
      } finally {
        if (!cancelled) setIsSearchingRecipients(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isRecipientPickerVisible, recipientSearch]);

  const sendCapturedSnapTo = async (profile: ChatProfile) => {
    if (isSendingSnap) return;

    const isVideo = Boolean(videoUri);
    if (!isVideo && !photoUri) {
      Alert.alert("No Snap", "Capture a photo or record a video first.");
      return;
    }

    try {
      setIsSendingSnap(true);
      setSendingSnapRecipientId(profile.id);
      const conversationId = await createDirectConversation(profile.id);
      let mediaUri = videoUri;

      // Capture the photo composition so filters, drawings, stickers and caption
      // are included in the Snap rather than uploading only the original photo.
      if (!isVideo && snapPreviewRef.current) {
        mediaUri = await captureRef(snapPreviewRef, {
          format: "jpg",
          quality: 0.92,
          result: Platform.OS === "web" ? "data-uri" : "tmpfile",
        });
      }

      if (!mediaUri)
        throw new Error("Couldn't prepare this Snap. Please try again.");

      await sendSnapMessage(
        conversationId,
        {
          uri: mediaUri,
          type: isVideo ? "video" : "image",
          mimeType: isVideo ? "video/mp4" : "image/jpeg",
          fileName: `blinksy-snap-${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
        },
        isVideo ? "video" : "image",
        caption,
      );

      setIsRecipientPickerVisible(false);
      Alert.alert(
        "Snap sent 👻",
        `Your Snap was sent to ${profile.display_name || profile.username || "your friend"}.`,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't send Snap",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsSendingSnap(false);
      setSendingSnapRecipientId(null);
    }
  };

  const renderRecipientPicker = () => (
    <Modal
      visible={isRecipientPickerVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setIsRecipientPickerVisible(false)}
    >
      <View style={styles.recipientModalBackdrop}>
        <View style={styles.recipientModalCard}>
          <View style={styles.recipientModalHeader}>
            <Text style={styles.recipientModalTitle}>Send Snap to</Text>
            <TouchableOpacity
              onPress={() => setIsRecipientPickerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close recipient picker"
            >
              <Text style={styles.recipientModalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={recipientSearch}
            onChangeText={setRecipientSearch}
            placeholder="Search name or username"
            placeholderTextColor="#8A8A95"
            autoCapitalize="none"
            style={styles.recipientSearchInput}
          />
          {isSearchingRecipients ? (
            <ActivityIndicator
              color="#8B5CF6"
              style={styles.recipientLoading}
            />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.recipientList}
            >
              {recipientProfiles.length === 0 ? (
                <Text style={styles.recipientEmptyText}>
                  No users found. Try another name or username.
                </Text>
              ) : (
                recipientProfiles.map((profile) => (
                  <TouchableOpacity
                    key={profile.id}
                    style={styles.recipientRow}
                    onPress={() => sendCapturedSnapTo(profile)}
                    disabled={isSendingSnap}
                    accessibilityRole="button"
                    accessibilityLabel={`Send Snap to ${profile.display_name || profile.username || "user"}`}
                  >
                    <View style={styles.recipientAvatar}>
                      <Text style={styles.recipientAvatarText}>
                        {(profile.display_name || profile.username || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.recipientProfileText}>
                      <Text style={styles.recipientName}>
                        {profile.display_name ||
                          profile.username ||
                          "Blinksy user"}
                      </Text>
                      {profile.username ? (
                        <Text style={styles.recipientUsername}>
                          @{profile.username}
                        </Text>
                      ) : null}
                    </View>
                    {sendingSnapRecipientId === profile.id ? (
                      <ActivityIndicator color="#8B5CF6" />
                    ) : (
                      <Text style={styles.recipientSendIcon}>👻</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
          {isSendingSnap ? (
            <Text style={styles.sendingSnapText}>Sending your Snap…</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const takePhoto = async () => {
    if (!cameraRef.current || isTakingPhoto) {
      setCameraError("Camera is not ready. Please wait and try again.");
      return;
    }

    try {
      setIsTakingPhoto(true);
      setCameraError("");

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      let imageUri = photo?.uri;

      // On web, use Base64 data if a usable URI is not returned.
      if (Platform.OS === "web" && !imageUri && photo?.base64) {
        imageUri = `data:image/jpeg;base64,${photo.base64}`;
      }

      if (imageUri) {
        setPhotoUri(imageUri);
      } else if (photo?.base64) {
        setPhotoUri(`data:image/jpeg;base64,${photo.base64}`);
      } else {
        setCameraError("The camera did not return an image. Please try again.");
      }
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "Photo capture failed. Please try again.",
      );
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady || isRecording || isTakingPhoto) {
      return;
    }

    try {
      setCameraError("");
      setIsRecording(true);
      if (!microphonePermission?.granted) {
        const permission = await requestMicrophonePermission();

        if (!permission.granted) {
          Alert.alert(
            "Microphone Permission Required",
            "Please allow microphone access to record videos.",
          );
          return;
        }
      }

      const video = await cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      if (video?.uri) {
        setVideoUri(video.uri);
      } else {
        setCameraError("Video recording failed. Please try again.");
      }
    } catch (error) {
      Alert.alert(
        "Video Recording Unavailable",
        "Blinksy cannot access the microphone required for video recording. Photo capture is still available.",
      );
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (!cameraRef.current || !isRecording) {
      return;
    }

    cameraRef.current.stopRecording();
  };

  const toggleCameraMode = () => {
    if (isRecording || isTakingPhoto) {
      return;
    }

    setIsVideoMode((currentMode) => !currentMode);
  };

  const saveSnap = async () => {
    try {
      if (!photoUri) {
        Alert.alert("Error", "No photo available to save.");
        return;
      }

      if (Platform.OS === "web") {
        const response = await fetch(photoUri);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `blinksy-photo-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Save directly to the device's media library.
      await MediaLibrary.saveToLibraryAsync(photoUri);

      Alert.alert("Success", "Photo saved to your Gallery!");
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const saveVideo = async () => {
    try {
      if (!videoUri) {
        Alert.alert("Error", "No video available to save.");
        return;
      }

      if (Platform.OS === "web") {
        const response = await fetch(videoUri);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `blinksy-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Save directly to the device's media library.
      // Do not request full media-library permissions first.
      await MediaLibrary.saveToLibraryAsync(videoUri);

      Alert.alert("Success", "Video saved to your Gallery!");
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const shareVideo = async () => {
    if (!videoUri) {
      Alert.alert("No video", "Record a video before sharing.");
      return;
    }

    try {
      if (Platform.OS === "web") {
        const response = await fetch(videoUri);
        const blob = await response.blob();
        const file = new globalThis.File(
          [blob],
          `blinksy-video-${Date.now()}.mp4`,
          {
            type: "video/mp4",
          },
        );

        if (
          navigator.canShare &&
          navigator.canShare({ files: [file] }) &&
          navigator.share
        ) {
          await navigator.share({ files: [file] });
        } else {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = file.name;
          link.click();
          URL.revokeObjectURL(link.href);
        }

        return;
      }

      await Sharing.shareAsync(videoUri, {
        mimeType: "video/mp4",
        dialogTitle: "Share your Blinksy video",
        UTI: "public.movie",
      });
    } catch (error) {
      Alert.alert("Unable to share video", "Please try again.");
    }
  };

  const shareSnap = async () => {
    try {
      if (!snapPreviewRef.current) {
        Alert.alert("Error", "No photo is available to share.");
        return;
      }

      const uri = await captureRef(snapPreviewRef, {
        format: "jpg",
        quality: 0.95,
        result: Platform.OS === "web" ? "data-uri" : "tmpfile",
      });

      if (Platform.OS === "web") {
        if (navigator.share && typeof File !== "undefined") {
          const response = await fetch(uri);
          const blob = await response.blob();
          const file = new globalThis.File([blob], "blinksy-snap.jpg", {
            type: "image/jpeg",
          });

          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "My Blinksy Snap",
            });
            return;
          }
        }

        const link = document.createElement("a");
        link.href = uri;
        link.download = `blinksy-${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: "Share your Blinksy Snap",
          UTI: "public.jpeg",
        });
      } else {
        Alert.alert("Unavailable", "Sharing isn't available on this device.");
      }
    } catch (error) {
      Alert.alert("Error", "Unable to share this snap. Please try again.");
    }
  };

  const switchCamera = () => {
    setCameraReady(false);
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const startDrawing = (x: number, y: number) => {
    setDrawingPaths((previous) => [
      ...previous,
      {
        d: `M ${x} ${y}`,
        color: drawingColor,
      },
    ]);
  };

  const mobileDrawingResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        startDrawing(locationX, locationY);
      },

      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        continueDrawing(locationX, locationY);
      },

      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const continueDrawing = (x: number, y: number) => {
    setDrawingPaths((previous) => {
      if (previous.length === 0) return previous;

      const updated = [...previous];
      const lastIndex = updated.length - 1;

      updated[lastIndex] = {
        ...updated[lastIndex],
        d: `${updated[lastIndex].d} L ${x} ${y}`,
      };

      return updated;
    });
  };

  const moveSticker = (id: string, x: number, y: number) => {
    setStickers((previous) =>
      previous.map((sticker) =>
        sticker.id === id
          ? {
              ...sticker,
              x: Math.max(0, Math.min(100, x)),
              y: Math.max(0, Math.min(100, y)),
            }
          : sticker,
      ),
    );
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.message}>Checking camera permissions... </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.logo}>blinksy</Text>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionDescription}>
          Blinksy needs camera access so you can capture and share moments with
          your friends.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestPermission}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Allow camera access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (photoUri) {
    return (
      <View style={styles.previewContainer}>
        <StatusBar hidden={Platform.OS !== "web"} />
        {renderRecipientPicker()}
        <View
          ref={snapPreviewRef}
          collapsable={false}
          style={[styles.previewContainer, styles.snapComposition]}
        >
          <Image source={{ uri: photoUri }} style={styles.previewImage} />

          <View
            pointerEvents="none"
            style={[
              styles.filterOverlay,
              {
                backgroundColor:
                  PHOTO_FILTERS.find((filter) => filter.id === selectedFilter)
                    ?.color ?? "transparent",
                opacity:
                  PHOTO_FILTERS.find((filter) => filter.id === selectedFilter)
                    ?.opacity ?? 0,
              },
            ]}
          />

          {stickers.map((sticker) => {
            const stickerPanResponder = PanResponder.create({
              onStartShouldSetPanResponder: () => true,
              onMoveShouldSetPanResponder: () => true,

              onPanResponderMove: (event, gestureState) => {
                const parentWidth = 300;
                const parentHeight = 500;

                const x = (sticker.x / 100) * parentWidth + gestureState.dx;
                const y = (sticker.y / 100) * parentHeight + gestureState.dy;

                moveSticker(
                  sticker.id,
                  (x / parentWidth) * 100,
                  (y / parentHeight) * 100,
                );
              },
            });

            return (
              <View
                key={sticker.id}
                {...stickerPanResponder.panHandlers}
                style={[
                  styles.stickerOverlay,
                  {
                    left: `${sticker.x}%`,
                    top: `${sticker.y}%`,
                  },
                ]}
              >
                <Text style={styles.stickerOverlayEmoji}>{sticker.emoji}</Text>
              </View>
            );
          })}

          {isDrawingMode && (
            <View
              style={styles.drawingLayer}
              pointerEvents={Platform.OS === "web" ? "box-only" : "auto"}
              onStartShouldSetResponder={
                Platform.OS === "web" ? () => true : undefined
              }
              onMoveShouldSetResponder={
                Platform.OS === "web" ? () => true : undefined
              }
              onTouchStart={(event) => {
                if (Platform.OS === "web") return;

                const { locationX, locationY } = event.nativeEvent;
                startDrawing(locationX, locationY);
              }}
              onTouchMove={(event) => {
                if (Platform.OS === "web") return;

                const { locationX, locationY } = event.nativeEvent;
                continueDrawing(locationX, locationY);
              }}
              onResponderGrant={
                Platform.OS === "web"
                  ? (event) => {
                      const { locationX, locationY } = event.nativeEvent;
                      startDrawing(locationX, locationY);
                    }
                  : undefined
              }
              onResponderMove={
                Platform.OS === "web"
                  ? (event) => {
                      const { locationX, locationY } = event.nativeEvent;
                      continueDrawing(locationX, locationY);
                    }
                  : undefined
              }
              onResponderTerminationRequest={() => false}
            >
              <Svg width="100%" height="100%" pointerEvents="none">
                {drawingPaths.map((path, index) => (
                  <Path
                    key={index}
                    d={path.d}
                    stroke={path.color}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </View>
          )}
          {!isDrawingMode && drawingPaths.length > 0 && (
            <View pointerEvents="none" style={styles.drawingLayer}>
              <Svg width="100%" height="100%">
                {drawingPaths.map((path, index) => (
                  <Path
                    key={index}
                    d={path.d}
                    stroke={path.color}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </View>
          )}
          {caption.length > 0 && (
            <View style={styles.captionOverlay}>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          )}
          {isEditingCaption && (
            <View style={styles.captionEditor}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Write something..."
                placeholderTextColor="#BBBBBB"
                autoFocus
                multiline
                maxLength={150}
                style={styles.captionInput}
              />

              <TouchableOpacity
                style={styles.captionDoneButton}
                onPress={() => setIsEditingCaption(false)}
              >
                <Text style={styles.captionDoneText}>✓</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            setDrawingPaths([]);
            setDrawingColor("#FFFFFF");
            setIsDrawingMode(false);
            setCaption("");
            setIsEditingCaption(false);
            setPhotoUri(null);
            router.replace("/");
          }}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        {isStickerPickerVisible && (
          <View style={styles.stickerPicker}>
            <View style={styles.stickerPickerHeader}>
              <Text style={styles.stickerPickerTitle}>Choose a sticker</Text>

              <TouchableOpacity
                onPress={() => setIsStickerPickerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close sticker picker"
              >
                <Text style={styles.stickerPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.stickerEmojiGrid}>
              {[
                "❤️",
                "😍",
                "😂",
                "🔥",
                "✨",
                "😎",
                "🥰",
                "🌸",
                "🎉",
                "💖",
                "🌈",
                "⭐",
              ].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.stickerEmojiButton}
                  onPress={() => {
                    setStickers((previous) => [
                      ...previous,
                      {
                        id: `${Date.now()}-${Math.random()}`,
                        emoji,
                        x: 50,
                        y: 50,
                      },
                    ]);
                    setIsStickerPickerVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${emoji} sticker`}
                >
                  <Text style={styles.stickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        <View style={styles.filterToolbar}>
          {PHOTO_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              style={[
                styles.filterButton,
                selectedFilter === filter.id && styles.filterButtonSelected,
              ]}
              onPress={() => setSelectedFilter(filter.id)}
              accessibilityRole="button"
              accessibilityLabel={`${filter.label} filter`}
            >
              <View
                style={[
                  styles.filterThumbnail,
                  { backgroundColor: filter.color },
                  filter.id === "normal" && styles.normalThumbnail,
                  filter.id === "bw" && styles.bwThumbnail,
                  filter.id === "warm" && styles.warmThumbnail,
                  filter.id === "cool" && styles.coolThumbnail,
                  filter.id === "vintage" && styles.vintageThumbnail,
                ]}
              >
                <Text style={styles.filterEmoji}>📷</Text>
              </View>

              <Text
                style={[
                  styles.filterLabel,
                  selectedFilter === filter.id && styles.filterLabelSelected,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.previewActions}>
          {activeActionHint && (
            <View pointerEvents="none" style={styles.actionHint}>
              <Text style={styles.actionHintText}>{activeActionHint}</Text>
            </View>
          )}
          {isDrawingMode ? (
            <View style={styles.drawingControls}>
              <View style={styles.colorRow}>
                {[
                  { name: "White", value: "#FFFFFF" },
                  { name: "Pink", value: "#FF4FA3" },
                  { name: "Yellow", value: "#FFE45E" },
                ].map((color) => (
                  <TouchableOpacity
                    key={color.value}
                    onPress={() => setDrawingColor(color.value)}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color.value },
                      drawingColor === color.value && styles.selectedColor,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${color.name} drawing color`}
                  />
                ))}
              </View>

              <View style={styles.drawingActionRow}>
                <TouchableOpacity
                  style={styles.iconActionButton}
                  onPress={() => setDrawingPaths([])}
                  accessibilityRole="button"
                  accessibilityLabel="Clear drawing"
                >
                  <Text style={styles.smallActionText}>🧹</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconActionButton}
                  onPress={() => setIsDrawingMode(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Finish drawing"
                >
                  <Text style={styles.smallActionText}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.iconActionButton}
              onPress={() => setIsDrawingMode(true)}
              accessibilityRole="button"
              accessibilityLabel="Draw"
            >
              <Text style={styles.addTextButtonLabel}>✏️</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={() => setIsEditingCaption(true)}
            accessibilityRole="button"
            accessibilityLabel="Add text"
          >
            <Text style={styles.addTextButtonLabel}>T</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={() => setIsStickerPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Add stickers"
          >
            <Text style={styles.addTextButtonLabel}>😊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={() => {
              setPhotoUri(null);
              setDrawingPaths([]);
              setDrawingColor("#FFFFFF");
              setIsDrawingMode(false);
              setCaption("");
              setIsEditingCaption(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Retake photo"
          >
            <Text style={styles.retakeButtonText}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={saveSnap}
            accessibilityRole="button"
            accessibilityLabel="Save snap"
          >
            <Text style={styles.saveSnapButtonText}>💾</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={shareSnap}
            accessibilityRole="button"
            accessibilityLabel="Share snap"
          >
            <Text style={styles.shareSnapButtonText}>📤</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconActionButton, styles.sendSnapActionButton]}
            onPress={() => setIsRecipientPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Send Snap to a friend"
          >
            <Text style={styles.sendSnapActionText}>👻</Text>
          </TouchableOpacity>

          <View style={styles.capturedLabel}>
            <Text style={styles.capturedLabelText}>Photo captured!</Text>
          </View>
        </View>
      </View>
    );
  }

  if (videoUri) {
    return (
      <View style={styles.videoPreviewContainer}>
        {renderRecipientPicker()}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            videoPlayer.pause();
            setVideoUri(null);
            setIsVideoMode(true);
            setCaption("");
          }}
          accessibilityRole="button"
          accessibilityLabel="Discard recorded video and return to camera"
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <VideoView
          player={videoPlayer}
          style={styles.videoPreview}
          nativeControls
          contentFit="contain"
        />

        <View style={styles.videoPreviewActions}>
          <TouchableOpacity
            style={styles.videoActionButton}
            onPress={() => {
              videoPlayer.pause();
              setVideoUri(null);
              setIsVideoMode(true);
            }}
          >
            <Text style={styles.videoActionText}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.videoActionButton}
            onPress={() => {
              videoPlayer.play();
            }}
          >
            <Text style={styles.videoActionText}>▶️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.videoActionButton}
            onPress={saveVideo}
          >
            <Text style={styles.videoActionText}>💾</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.videoActionButton}
            onPress={shareVideo}
          >
            <Text style={styles.videoActionText}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.videoActionButton, styles.videoSendSnapButton]}
            onPress={() => setIsRecipientPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Send video Snap to a friend"
          >
            <Text style={styles.videoSendSnapText}>👻 Send Snap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  // Live camera screen
  return (
    <SafeAreaView style={styles.cameraContainer}>
      <StatusBar hidden={Platform.OS !== "web"} />

      <View style={styles.cameraPreview}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode={isVideoMode ? "video" : "picture"}
          onCameraReady={() => {
            setCameraReady(true);
            setCameraError("");
          }}
          onMountError={(event) => {
            setCameraError(event.message);
          }}
        />

        <View style={styles.cameraOverlay}>
          {/* Header */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Text style={styles.headerButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.cameraTitle}>blinksy</Text>

            <TouchableOpacity
              style={styles.headerButton}
              onPress={switchCamera}
              accessibilityRole="button"
              accessibilityLabel="Switch camera"
            >
              <Text style={styles.headerButtonText}>↻</Text>
            </TouchableOpacity>
          </View>

          {/* Camera controls */}
          <View style={styles.cameraBottom}>
            <View style={styles.modeSelector}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  !isVideoMode && styles.activeModeButton,
                ]}
                onPress={() => {
                  if (!isRecording && !isTakingPhoto) {
                    setIsVideoMode(false);
                  }
                }}
                disabled={isRecording || isTakingPhoto}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.modeText,
                    !isVideoMode && styles.activeModeText,
                  ]}
                >
                  PHOTO
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeButton,
                  isVideoMode && styles.activeModeButton,
                ]}
                onPress={() => {
                  if (!isRecording && !isTakingPhoto) {
                    setIsVideoMode(true);
                  }
                }}
                disabled={isRecording || isTakingPhoto}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.modeText,
                    isVideoMode && styles.activeModeText,
                  ]}
                >
                  VIDEO
                </Text>
              </TouchableOpacity>
            </View>

            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimer}>
                  REC
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                  {String(recordingSeconds % 60).padStart(2, "0")}
                </Text>
              </View>
            )}

            {!!cameraError && (
              <Text style={styles.errorText}>{cameraError}</Text>
            )}

            <Text style={styles.cameraHint}>
              {isRecording
                ? "Recording... Tap the button to finish"
                : isVideoMode
                  ? "Tap to start recording"
                  : "Capture a moment"}
            </Text>

            <TouchableOpacity
              style={[
                styles.captureButton,
                (isTakingPhoto || (!cameraReady && !isRecording)) &&
                  styles.captureButtonDisabled,
              ]}
              onPress={() => {
                if (isRecording) {
                  stopRecording();
                } else if (isVideoMode) {
                  startRecording();
                } else {
                  takePhoto();
                }
              }}
              disabled={isTakingPhoto || (!cameraReady && !isRecording)}
              accessibilityRole="button"
              accessibilityLabel={
                isRecording
                  ? "Stop recording"
                  : isVideoMode
                    ? "Start video recording"
                    : "Take photo"
              }
            >
              <View
                style={[
                  styles.captureButtonInner,
                  isVideoMode && {
                    backgroundColor: "#FF3B30",
                    borderRadius: isRecording ? 8 : 31,
                  },
                  isRecording && {
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                  },
                ]}
              />
            </TouchableOpacity>

            <Text style={styles.cameraMode}>
              {isRecording
                ? "RECORDING"
                : isVideoMode
                  ? "VIDEO MODE"
                  : "PHOTO MODE"}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    marginTop: 14,
    color: "#55515D",
    fontSize: 14,
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 28,
    justifyContent: "center",
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#211A36",
    textAlign: "center",
    marginBottom: 42,
  },
  permissionTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: "#211A36",
    textAlign: "center",
  },
  permissionDescription: {
    color: "#77727F",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: "#211A36",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#625B70",
    fontSize: 14,
    fontWeight: "600",
  },
  cameraContainer: {
    flex: 1,
    width: "100%",
    minHeight: 500,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraPreview: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    minHeight: 500,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#17131F",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    zIndex: 10,
    elevation: 10,
  },
  cameraHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "web" ? 20 : 54,
    zIndex: 11,
  },
  headerButton: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "rgba(20, 20, 25, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonText: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "600",
  },
  cameraTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -1,
  },
  cameraBottom: {
    alignItems: "center",
    paddingBottom: Platform.OS === "web" ? 28 : 35,
    paddingHorizontal: 20,
  },
  cameraHint: {
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 22,
    fontWeight: "500",
    textAlign: "center",
  },
  captureButton: {
    height: 82,
    width: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  } as any,
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    height: 62,
    width: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
  },
  cameraMode: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    marginTop: 16,
  },
  previewContainer: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 480 : undefined,
    minHeight: 500,
    alignSelf: "center",
    backgroundColor: "#000000",
    position: "relative",
    overflow: "hidden",
  },
  previewImage: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  closeButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 52,
    left: 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(20, 20, 25, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    elevation: 30,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 22,
  },
  previewActions: {
    position: "absolute",
    top: Platform.OS === "web" ? 78 : 105,
    right: 50,
    bottom: 110,
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    elevation: 30,
    gap: 10,
  },
  retakeButtonText: {
    color: "#211A36",
    fontWeight: "800",
    fontSize: 15,
  },
  capturedLabel: {
    backgroundColor: "rgba(20, 20, 25, 0.65)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  capturedLabelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: "#FFD4D4",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
  },
  cameraCloseButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 54,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(20, 20, 25, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 20,
  },
  captionOverlay: {
    position: "absolute",
    top: "40%",
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 5,
  },
  captionText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 5,
  },
  captionEditor: {
    position: "absolute",
    top: "25%",
    left: 20,
    right: 20,
    zIndex: 10,
    alignItems: "center",
  },
  captionInput: {
    width: "100%",
    minHeight: 90,
    maxHeight: 150,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    borderRadius: 14,
    padding: 14,
  },
  captionDoneButton: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  captionDoneText: {
    color: "#211A36",
    fontWeight: "800",
  },
  addTextButtonLabel: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },
  drawingLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  drawingControls: {
    alignItems: "center",
    marginBottom: 12,
    zIndex: 20,
    elevation: 20,
  },
  colorRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    gap: 16,
  },
  colorButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  selectedColor: {
    borderWidth: 4,
    borderColor: "#8B5CF6",
  },
  drawingActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  smallActionButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    minWidth: 90,
    alignItems: "center",
  },
  smallActionText: {
    color: "#211A36",
    fontWeight: "800",
    fontSize: 14,
  },
  stickerPicker: {
    position: "absolute",
    bottom: 110,
    left: 12,
    right: 12,
    zIndex: 40,
    elevation: 40,
    backgroundColor: "#202020",
    borderRadius: 18,
    padding: 14,
  },
  stickerPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  stickerPickerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  stickerPickerClose: {
    color: "#FFFFFF",
    fontSize: 22,
    paddingHorizontal: 8,
  },
  stickerEmojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  stickerEmojiButton: {
    width: "24%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  stickerEmoji: {
    fontSize: 30,
  },
  stickerOverlay: {
    position: "absolute",
    zIndex: 10,
    elevation: 10,
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  stickerOverlayEmoji: {
    fontSize: 44,
    textAlign: "center",
  },
  filterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  filterToolbar: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    zIndex: 30,
    elevation: 30,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 16,
  },
  filterButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  filterButtonSelected: {
    borderColor: "#FFFFFF",
  },
  filterThumbnail: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  normalThumbnail: {
    backgroundColor: "#555555",
  },
  bwThumbnail: {
    backgroundColor: "#777777",
  },
  warmThumbnail: {
    backgroundColor: "#D68B53",
  },
  coolThumbnail: {
    backgroundColor: "#5689BD",
  },
  vintageThumbnail: {
    backgroundColor: "#A87845",
  },
  filterEmoji: {
    fontSize: 19,
  },
  filterLabel: {
    color: "#DDDDDD",
    fontSize: 9,
    marginTop: 3,
  },
  filterLabelSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  snapComposition: {
    width: "100%",
    flex: 1,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  saveSnapButtonText: {
    color: "#171717",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  shareSnapButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  modeSelector: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 24,
    padding: 4,
    marginVertical: 16,
  },
  modeButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  activeModeButton: {
    backgroundColor: "#FFFFFF",
  },
  modeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  activeModeText: {
    color: "#111111",
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginVertical: 8,
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#FF3B30",
    marginRight: 8,
  },
  recordingTimer: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  videoPreviewContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    minHeight: 500,
    alignSelf: "center",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  videoPreview: {
    flex: 1,
    width: "100%",
    minHeight: 400,
  },
  videoPreviewActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    gap: 12,
    backgroundColor: "#111111",
  },
  videoActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  videoActionText: {
    color: "#111111",
    fontSize: 14,
    fontWeight: "600",
  },
  iconActionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(25, 25, 30, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  iconActionLabel: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  actionHint: {
    position: "absolute",
    right: 54,
    top: 0,
    backgroundColor: "rgba(20,20,25,0.88)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    minWidth: 72,
    alignItems: "center",
    zIndex: 40,
    elevation: 40,
  },
  actionHintText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  recipientModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  recipientModalCard: {
    maxHeight: "78%",
    minHeight: 300,
    backgroundColor: "#17171D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  recipientModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  recipientModalTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
  },
  recipientModalClose: {
    color: "#FFFFFF",
    fontSize: 22,
    padding: 4,
  },
  recipientSearchInput: {
    backgroundColor: "#292932",
    borderRadius: 14,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  recipientList: {
    flexGrow: 0,
  },
  recipientLoading: {
    paddingVertical: 24,
  },
  recipientEmptyText: {
    color: "#B8B8C2",
    textAlign: "center",
    paddingVertical: 24,
    lineHeight: 21,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#383842",
  },
  recipientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  recipientAvatarText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  recipientProfileText: {
    flex: 1,
  },
  recipientName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  recipientUsername: {
    color: "#B8B8C2",
    fontSize: 12,
    marginTop: 3,
  },
  recipientSendIcon: {
    fontSize: 22,
    marginLeft: 12,
  },
  sendingSnapText: {
    color: "#C4B5FD",
    textAlign: "center",
    marginTop: 12,
    fontWeight: "600",
  },
  sendSnapActionButton: {
    backgroundColor: "#8B5CF6",
    borderColor: "#A78BFA",
  },
  sendSnapActionText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  videoSendSnapButton: {
    backgroundColor: "#8B5CF6",
  },
  videoSendSnapText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  smallIconActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
});
