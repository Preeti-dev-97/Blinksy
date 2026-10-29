import { supabase } from "@/lib/supabase";

const STORIES_BUCKET = "stories";

export type StoryAudience = "friends" | "public";
export type StoryMediaType = "image" | "video";

export type Story = {
  id: string;
  user_id: string;
  media_path: string;
  media_type: StoryMediaType;
  caption: string | null;
  audience: StoryAudience;
  created_at: string;
  expires_at: string;
  media_url: string;
  has_viewed: boolean;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  view_count: number;
};

export type CreateStoryInput = {
  uri: string;
  mediaType: StoryMediaType;
  caption?: string | null;
  audience: StoryAudience;
};

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    throw new Error("Please sign in to use Stories.");
  }

  return user;
}

/**
 * Load active stories that the signed-in user is allowed to see.
 *
 * Database RLS determines whether each story is visible.
 * Media is served using short-lived signed URLs.
 */
export async function getStories(): Promise<Story[]> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("stories")
    .select(
      `
      id,
      user_id,
      media_path,
      media_type,
      caption,
      audience,
      created_at,
      expires_at,
      profile:profiles!stories_user_id_fkey (
        id,
        username,
        display_name,
        avatar_url
      )
    `,
    )
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  const storyIds = rows.map((story) => story.id);

  if (storyIds.length === 0) return [];

  // Get IDs of stories the current user has already viewed.
  // Requires the additional RLS policy provided below.
  const { data: views, error: viewsError } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("viewer_id", user.id)
    .in("story_id", storyIds);

  if (viewsError) throw viewsError;

  const viewedIds = new Set((views ?? []).map((view) => view.story_id));

  // Get viewer counts for stories owned by this user.
  const ownStoryIds = rows
    .filter((story) => story.user_id === user.id)
    .map((story) => story.id);

  const viewCounts = new Map<string, number>();

  if (ownStoryIds.length > 0) {
    const { data: ownViews, error: ownViewsError } = await supabase
      .from("story_views")
      .select("story_id")
      .in("story_id", ownStoryIds);

    if (ownViewsError) throw ownViewsError;

    for (const view of ownViews ?? []) {
      viewCounts.set(view.story_id, (viewCounts.get(view.story_id) ?? 0) + 1);
    }
  }

  const stories = await Promise.all(
    rows.map(async (story) => {
      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from(STORIES_BUCKET)
          .createSignedUrl(story.media_path, 60 * 30);

      if (signedUrlError) throw signedUrlError;

      return {
        ...story,
        profile: Array.isArray(story.profile)
          ? (story.profile[0] ?? null)
          : story.profile,
        media_url: signedUrlData.signedUrl,
        has_viewed: viewedIds.has(story.id),
        view_count: viewCounts.get(story.id) ?? 0,
      } as Story;
    }),
  );

  return stories;
}

/**
 * Upload a photo or video and create its database record.
 * If database insertion fails, remove the uploaded file.
 */
export async function createStory(input: CreateStoryInput): Promise<void> {
  const user = await requireUser();

  const response = await fetch(input.uri);

  if (!response.ok) {
    throw new Error("Could not read the selected photo or video.");
  }

  const fileBlob = await response.blob();

  if (fileBlob.size === 0) {
    throw new Error("The selected media file is empty.");
  }

  const extension = input.mediaType === "video" ? "mp4" : "jpg";

  const fileName = `${user.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`;

  const contentType = input.mediaType === "video" ? "video/mp4" : "image/jpeg";

  const { error: uploadError } = await supabase.storage
    .from(STORIES_BUCKET)
    .upload(fileName, fileBlob, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("stories").insert({
    user_id: user.id,
    media_path: fileName,
    media_type: input.mediaType,
    caption: (input.caption ?? "").trim(),
    audience: input.audience,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (insertError) {
    // Avoid leaving an orphaned file if saving the record fails.
    const { error: cleanupError } = await supabase.storage
      .from(STORIES_BUCKET)
      .remove([fileName]);

    if (cleanupError) {
      console.error("Could not clean up failed story upload:", cleanupError);
    }

    throw insertError;
  }
}

/**
 * Record a view once per user per story.
 */
export async function markStoryViewed(storyId: string): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase.from("story_views").upsert(
    {
      story_id: storyId,
      viewer_id: user.id,
    },
    {
      onConflict: "story_id,viewer_id",
      ignoreDuplicates: true,
    },
  );

  if (error) throw error;
}

/**
 * Delete a story and its associated media.
 */
export async function deleteStory(
  story: Pick<Story, "id" | "media_path">,
): Promise<void> {
  const user = await requireUser();

  // RLS ensures that users can delete only their own stories.
  const { error: deleteError } = await supabase
    .from("stories")
    .delete()
    .eq("id", story.id)
    .eq("user_id", user.id);

  if (deleteError) throw deleteError;

  const { error: storageError } = await supabase.storage
    .from(STORIES_BUCKET)
    .remove([story.media_path]);

  if (storageError) {
    console.error("Story deleted, but media cleanup failed:", storageError);
  }
}

/**
 * Get viewers for a story owned by the signed-in user.
 */
export async function getStoryViewers(storyId: string) {
  const user = await requireUser();

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id")
    .eq("id", storyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (storyError) throw storyError;

  if (!story) {
    throw new Error("You can only view the viewers of your own story.");
  }

  const { data, error } = await supabase
    .from("story_views")
    .select(
      `
      viewer_id,
      viewed_at,
      profile:profiles!story_views_viewer_id_fkey (
        id,
        username,
        display_name,
        avatar_url
      )
    `,
    )
    .eq("story_id", storyId)
    .order("viewed_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}
