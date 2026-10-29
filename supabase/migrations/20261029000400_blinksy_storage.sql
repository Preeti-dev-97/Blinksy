-- ============================================================
-- Blinksy: Storage Buckets and Policies
-- ============================================================

-- ============================================================
-- BUCKETS
-- ============================================================

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES
    ('chat-media', 'chat-media', false, NULL, NULL),

    (
        'profile-avatars',
        'profile-avatars',
        true,
        5242880,
        ARRAY[
            'image/jpeg',
            'image/png',
            'image/webp'
        ]::text[]
    ),

    ('stories', 'stories', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- CHAT MEDIA
-- Expected path:
-- <conversation_id>/<user_id>/<filename>
-- ============================================================

CREATE POLICY "Chat members can read conversation media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'chat-media'
    AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id::text =
              (storage.foldername(name))[1]
          AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Chat members can upload their own media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id::text =
              (storage.foldername(name))[1]
          AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their own chat media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id::text =
              (storage.foldername(name))[1]
          AND cm.user_id = auth.uid()
    )
);

-- ============================================================
-- PROFILE AVATARS
-- Expected path:
-- <user_id>/<filename>
-- ============================================================

CREATE POLICY "Profile avatars are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (
    bucket_id = 'profile-avatars'
);

CREATE POLICY "Users can upload their own profile avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own profile avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own profile avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- STORY MEDIA
-- Expected path:
-- <user_id>/<filename>
-- ============================================================

CREATE POLICY "Users upload to own stories folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'stories'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own story media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'stories'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read accessible story media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'stories'
    AND EXISTS (
        SELECT 1
        FROM public.stories s
        WHERE s.media_path = name
          AND s.expires_at > now()
          AND (
              s.user_id = auth.uid()
              OR s.audience = 'public'
              OR (
                  s.audience = 'friends'
                  AND public.are_accepted_friends(
                      s.user_id,
                      auth.uid()
                  )
              )
          )
    )
);