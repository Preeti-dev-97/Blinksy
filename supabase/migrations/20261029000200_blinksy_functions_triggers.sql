-- ============================================================
-- Blinksy: Database Functions and Triggers
-- ============================================================

-- ============================================================
-- Check accepted friendship
-- ============================================================

CREATE OR REPLACE FUNCTION public.are_accepted_friends(
    user_a UUID,
    user_b UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.friend_requests fr
        WHERE fr.user_low = LEAST(user_a, user_b)
          AND fr.user_high = GREATEST(user_a, user_b)
          AND fr.status = 'accepted'
          AND user_a <> user_b
    );
$$;

-- ============================================================
-- Check conversation membership
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_conversation_member(
    target_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id = target_conversation_id
          AND cm.user_id = auth.uid()
    );
$$;

-- ============================================================
-- Check conversation creator
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_conversation_creator(
    target_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = target_conversation_id
          AND c.created_by = auth.uid()
    );
$$;

-- ============================================================
-- Automatically create a profile after Supabase signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        display_name
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'display_name',
            NEW.raw_user_meta_data ->> 'full_name',
            ''
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Send a friend request
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_friend_request(
    target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    existing_request public.friend_requests%ROWTYPE;
    new_request_id UUID;
    low_user UUID;
    high_user UUID;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF target_user_id IS NULL OR target_user_id = current_user_id THEN
        RAISE EXCEPTION 'Invalid target user';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = target_user_id
    ) THEN
        RAISE EXCEPTION 'Target profile does not exist';
    END IF;

    low_user := LEAST(current_user_id, target_user_id);
    high_user := GREATEST(current_user_id, target_user_id);

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            low_user::TEXT || ':' || high_user::TEXT,
            0
        )
    );

    SELECT *
    INTO existing_request
    FROM public.friend_requests fr
    WHERE fr.user_low = low_user
      AND fr.user_high = high_user
    FOR UPDATE;

    IF FOUND THEN
        IF existing_request.status = 'accepted' THEN
            RAISE EXCEPTION 'These users are already friends';
        END IF;

        IF existing_request.status = 'pending'
           AND existing_request.requester_id = current_user_id THEN
            RAISE EXCEPTION 'Friend request already sent';
        END IF;

        IF existing_request.status = 'pending'
           AND existing_request.addressee_id = current_user_id THEN
            RETURN existing_request.id;
        END IF;

        UPDATE public.friend_requests
        SET requester_id = current_user_id,
            addressee_id = target_user_id,
            status = 'pending',
            created_at = pg_catalog.now(),
            responded_at = NULL
        WHERE id = existing_request.id
        RETURNING id INTO new_request_id;

        RETURN new_request_id;
    END IF;

    INSERT INTO public.friend_requests (
        requester_id,
        addressee_id,
        status
    )
    VALUES (
        current_user_id,
        target_user_id,
        'pending'
    )
    RETURNING id INTO new_request_id;

    RETURN new_request_id;
END;
$$;

-- ============================================================
-- Accept a friend request
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(
    request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    updated_request_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.friend_requests
    SET status = 'accepted',
        responded_at = pg_catalog.now()
    WHERE id = request_id
      AND addressee_id = auth.uid()
      AND status = 'pending'
    RETURNING id INTO updated_request_id;

    IF updated_request_id IS NULL THEN
        RAISE EXCEPTION 'Pending friend request not found';
    END IF;

    RETURN updated_request_id;
END;
$$;

-- ============================================================
-- Reject a friend request
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_friend_request(
    request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    updated_request_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.friend_requests
    SET status = 'rejected',
        responded_at = pg_catalog.now()
    WHERE id = request_id
      AND addressee_id = auth.uid()
      AND status = 'pending'
    RETURNING id INTO updated_request_id;

    IF updated_request_id IS NULL THEN
        RAISE EXCEPTION 'Pending friend request not found';
    END IF;

    RETURN updated_request_id;
END;
$$;

-- ============================================================
-- Cancel a friend request
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_friend_request(
    request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    updated_request_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.friend_requests
    SET status = 'cancelled',
        responded_at = pg_catalog.now()
    WHERE id = request_id
      AND requester_id = auth.uid()
      AND status = 'pending'
    RETURNING id INTO updated_request_id;

    IF updated_request_id IS NULL THEN
        RAISE EXCEPTION 'Pending friend request not found';
    END IF;

    RETURN updated_request_id;
END;
$$;

-- ============================================================
-- Create or retrieve a direct conversation
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_direct_conversation(
    target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    existing_conversation_id UUID;
    new_conversation_id UUID;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF target_user_id IS NULL
       OR target_user_id = current_user_id THEN
        RAISE EXCEPTION 'Invalid target user';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = target_user_id
    ) THEN
        RAISE EXCEPTION 'Target profile does not exist';
    END IF;

    SELECT c.id
    INTO existing_conversation_id
    FROM public.conversations c
    WHERE c.type = 'direct'
      AND EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.user_id = current_user_id
      )
      AND EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.user_id = target_user_id
      )
      AND (
          SELECT COUNT(*)
          FROM public.conversation_members cm
          WHERE cm.conversation_id = c.id
      ) = 2
    LIMIT 1;

    IF existing_conversation_id IS NOT NULL THEN
        RETURN existing_conversation_id;
    END IF;

    INSERT INTO public.conversations (
        type,
        created_by
    )
    VALUES (
        'direct',
        current_user_id
    )
    RETURNING id INTO new_conversation_id;

    INSERT INTO public.conversation_members (
        conversation_id,
        user_id,
        role
    )
    VALUES
        (new_conversation_id, current_user_id, 'member'),
        (new_conversation_id, target_user_id, 'member');

    RETURN new_conversation_id;
END;
$$;

-- ============================================================
-- Mark one notification read
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(
    notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.notifications
    SET read_at = pg_catalog.now()
    WHERE id = notification_id
      AND recipient_id = auth.uid()
      AND read_at IS NULL;

    RETURN FOUND;
END;
$$;

-- ============================================================
-- Mark all notifications read
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.notifications
    SET read_at = pg_catalog.now()
    WHERE recipient_id = auth.uid()
      AND read_at IS NULL;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    RETURN affected_rows;
END;
$$;

-- ============================================================
-- Notify on friend-request changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        INSERT INTO public.notifications (
            recipient_id,
            actor_id,
            type,
            title,
            body,
            data
        )
        VALUES (
            NEW.addressee_id,
            NEW.requester_id,
            'friend_request',
            'New friend request',
            'Someone sent you a friend request.',
            jsonb_build_object('friend_request_id', NEW.id)
        );

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'pending'
           AND OLD.status IN ('rejected', 'cancelled') THEN

            INSERT INTO public.notifications (
                recipient_id,
                actor_id,
                type,
                title,
                body,
                data
            )
            VALUES (
                NEW.addressee_id,
                NEW.requester_id,
                'friend_request',
                'New friend request',
                'Someone sent you a friend request.',
                jsonb_build_object('friend_request_id', NEW.id)
            );

        ELSIF NEW.status = 'accepted'
              AND OLD.status = 'pending' THEN

            INSERT INTO public.notifications (
                recipient_id,
                actor_id,
                type,
                title,
                body,
                data
            )
            VALUES (
                NEW.requester_id,
                NEW.addressee_id,
                'friend_request_accepted',
                'Friend request accepted',
                'Your friend request was accepted.',
                jsonb_build_object('friend_request_id', NEW.id)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_friend_request
AFTER INSERT OR UPDATE OF status
ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_request();

-- ============================================================
-- Notify conversation members about a new message
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    message_preview TEXT;
BEGIN
    IF NEW.message_type = 'image' THEN
        message_preview := 'Sent a photo';
    ELSIF NEW.message_type = 'video' THEN
        message_preview := 'Sent a video';
    ELSE
        message_preview := COALESCE(NEW.content, 'New message');
    END IF;

    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        title,
        body,
        data
    )
    SELECT
        cm.user_id,
        NEW.sender_id,
        'new_message',
        'New message',
        LEFT(message_preview, 200),
        jsonb_build_object(
            'conversation_id', NEW.conversation_id,
            'message_id', NEW.id
        )
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.conversation_id
      AND cm.user_id <> NEW.sender_id;

    UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        updated_at = pg_catalog.now()
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_message();

-- ============================================================
-- Open an unopened, unexpired Snap
-- ============================================================

CREATE OR REPLACE FUNCTION public.open_snap(
    p_message_id UUID
)
RETURNS SETOF public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    RETURN QUERY
    UPDATE public.messages m
    SET snap_opened_at = pg_catalog.now(),
        snap_opened_by = auth.uid()
    WHERE m.id = p_message_id
      AND m.is_snap = true
      AND m.snap_opened_at IS NULL
      AND (
          m.snap_expires_at IS NULL
          OR m.snap_expires_at > pg_catalog.now()
      )
      AND m.sender_id <> auth.uid()
      AND EXISTS (
          SELECT 1
          FROM public.conversation_members cm
          JOIN public.conversations c
            ON c.id = cm.conversation_id
          WHERE cm.conversation_id = m.conversation_id
            AND cm.user_id = auth.uid()
            AND c.type = 'direct'
      )
    RETURNING m.*;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Snap not found, expired, already opened, or access denied';
    END IF;
END;
$$;