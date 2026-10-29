-- ============================================================
-- Blinksy: Core Database Schema
-- Requires Supabase Auth and PostgreSQL.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. PROFILES
-- ============================================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_username_unique_lower_idx
    ON public.profiles (lower(username))
    WHERE username IS NOT NULL;

-- ============================================================
-- 2. CONVERSATIONS
-- ============================================================

CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'direct'
        CHECK (type IN ('direct', 'group')),
    title TEXT,
    created_by UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_last_message
    ON public.conversations (last_message_at DESC);

-- ============================================================
-- 3. CONVERSATION MEMBERS
-- ============================================================

CREATE TABLE public.conversation_members (
    conversation_id UUID NOT NULL
        REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('member', 'admin')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user
    ON public.conversation_members (user_id);

-- ============================================================
-- 4. FRIEND REQUESTS
-- ============================================================

CREATE TABLE public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    requester_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    addressee_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'accepted',
                'rejected',
                'cancelled'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,

    user_low UUID GENERATED ALWAYS AS (
        LEAST(requester_id, addressee_id)
    ) STORED,

    user_high UUID GENERATED ALWAYS AS (
        GREATEST(requester_id, addressee_id)
    ) STORED,

    CONSTRAINT friend_requests_different_users
        CHECK (requester_id <> addressee_id),

    CONSTRAINT friend_requests_unique_pair
        UNIQUE (user_low, user_high)
);

CREATE INDEX idx_friend_requests_addressee_status
    ON public.friend_requests (addressee_id, status);

CREATE INDEX idx_friend_requests_requester_status
    ON public.friend_requests (requester_id, status);

-- ============================================================
-- 5. MESSAGES
-- ============================================================

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL
        REFERENCES public.conversations(id) ON DELETE CASCADE,

    sender_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE RESTRICT,

    content TEXT,

    message_type TEXT NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'video')),

    media_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    is_snap BOOLEAN NOT NULL DEFAULT false,
    snap_expires_at TIMESTAMPTZ,
    snap_opened_at TIMESTAMPTZ,

    snap_opened_by UUID
        REFERENCES auth.users(id),

    CONSTRAINT messages_content_or_media_required
        CHECK (content IS NOT NULL OR media_url IS NOT NULL),

    CONSTRAINT messages_snap_open_state
        CHECK (
            (snap_opened_at IS NULL AND snap_opened_by IS NULL)
            OR
            (snap_opened_at IS NOT NULL AND snap_opened_by IS NOT NULL)
        )
);

CREATE INDEX idx_messages_conversation_created
    ON public.messages (conversation_id, created_at DESC);

CREATE INDEX idx_messages_sender
    ON public.messages (sender_id);

CREATE INDEX idx_messages_active_snaps
    ON public.messages (snap_expires_at)
    WHERE is_snap = true;

-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recipient_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    actor_id UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL,

    type TEXT NOT NULL
        CHECK (
            type IN (
                'friend_request',
                'friend_request_accepted',
                'new_message'
            )
        ),

    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,

    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_created
    ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX idx_notifications_unread
    ON public.notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;

-- ============================================================
-- 7. STORIES
-- ============================================================

CREATE TABLE public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    media_path TEXT NOT NULL,

    media_type TEXT NOT NULL
        CHECK (media_type IN ('image', 'video')),

    caption TEXT,

    audience TEXT NOT NULL DEFAULT 'friends'
        CHECK (audience IN ('friends', 'public')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    expires_at TIMESTAMPTZ NOT NULL
        DEFAULT (now() + INTERVAL '24 hours'),

    CONSTRAINT stories_expiration_after_creation
        CHECK (expires_at > created_at)
);

CREATE INDEX idx_stories_active
    ON public.stories (expires_at DESC);

CREATE INDEX idx_stories_audience_active
    ON public.stories (audience, expires_at DESC);

CREATE INDEX idx_stories_user_active
    ON public.stories (user_id, created_at DESC);

-- ============================================================
-- 8. STORY VIEWS
-- ============================================================

CREATE TABLE public.story_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    story_id UUID NOT NULL
        REFERENCES public.stories(id) ON DELETE CASCADE,

    viewer_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT story_views_unique_viewer
        UNIQUE (story_id, viewer_id)
);

CREATE INDEX idx_story_views_story
    ON public.story_views (story_id, viewed_at DESC);

CREATE INDEX idx_story_views_viewer
    ON public.story_views (viewer_id, viewed_at DESC);

-- ============================================================
-- Enable Row Level Security
-- Policies are defined in migration 003.
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;