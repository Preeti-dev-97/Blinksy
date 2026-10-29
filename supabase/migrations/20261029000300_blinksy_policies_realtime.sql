-- ============================================================
-- Blinksy: RLS Policies and Realtime
-- ============================================================

-- ============================================================
-- PROFILES
-- ============================================================

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================================
-- CONVERSATIONS
-- ============================================================

CREATE POLICY "Members can view conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
    public.is_conversation_member(id)
    OR created_by = auth.uid()
);

CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- ============================================================
-- CONVERSATION MEMBERS
-- ============================================================

CREATE POLICY "Members can view conversation membership"
ON public.conversation_members
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_conversation_member(conversation_id)
);

CREATE POLICY "Creators can add themselves to conversations"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND public.is_conversation_creator(conversation_id)
);

CREATE POLICY "Members can update their own read status"
ON public.conversation_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FRIEND REQUESTS
-- ============================================================

CREATE POLICY "Users can view their own friend relationships"
ON public.friend_requests
FOR SELECT
TO authenticated
USING (
    requester_id = auth.uid()
    OR addressee_id = auth.uid()
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE POLICY "Members can view messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
    public.is_conversation_member(conversation_id)
);

CREATE POLICY "Members can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
);

CREATE POLICY "Senders can update their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
)
WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE POLICY "Users can read their notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

-- ============================================================
-- STORIES
-- ============================================================

CREATE POLICY "Users can create their own stories"
ON public.stories
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND expires_at > now()
    AND expires_at <= now() + INTERVAL '24 hours 5 minutes'
);

CREATE POLICY "Users can read visible active stories"
ON public.stories
FOR SELECT
TO authenticated
USING (
    expires_at > now()
    AND (
        user_id = auth.uid()
        OR audience = 'public'
        OR (
            audience = 'friends'
            AND public.are_accepted_friends(user_id, auth.uid())
        )
    )
);

CREATE POLICY "Users can update their own stories"
ON public.stories
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    AND expires_at > now()
    AND expires_at <= now() + INTERVAL '24 hours 5 minutes'
);

CREATE POLICY "Users can delete their own stories"
ON public.stories
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- STORY VIEWS
-- ============================================================

CREATE POLICY "Story owners can see viewers"
ON public.story_views
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.stories s
        WHERE s.id = story_views.story_id
          AND s.user_id = auth.uid()
    )
);

CREATE POLICY "Viewers can see their own story views"
ON public.story_views
FOR SELECT
TO authenticated
USING (viewer_id = auth.uid());

CREATE POLICY "Viewers can record their own views"
ON public.story_views
FOR INSERT
TO authenticated
WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.stories s
        WHERE s.id = story_views.story_id
          AND s.user_id <> auth.uid()
          AND s.expires_at > now()
          AND (
              s.audience = 'public'
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

CREATE POLICY "Viewers can delete their own views"
ON public.story_views
FOR DELETE
TO authenticated
USING (viewer_id = auth.uid());

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        RAISE EXCEPTION
            'supabase_realtime publication does not exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime
            ADD TABLE public.messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime
            ADD TABLE public.notifications;
    END IF;
END;
$$;