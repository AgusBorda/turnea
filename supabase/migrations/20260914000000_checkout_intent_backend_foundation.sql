-- P6B is additive. Legacy checkout appointments have no intent and are never
-- inferred to be safe for preference retries.
CREATE TABLE public.checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,
  fingerprint_hash bytea NOT NULL,
  fingerprint_version integer NOT NULL DEFAULT 1,
  barbershop_id uuid NOT NULL REFERENCES public.barbershops(id),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id),
  expected_mp_user_id text,
  status text NOT NULL DEFAULT 'reserved',
  preference_phase text NOT NULL DEFAULT 'no_post',
  preference_id text,
  init_point text,
  preference_claim_id uuid,
  preference_claimed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT checkout_intents_hash_lengths CHECK (
    octet_length(token_hash) = 32 AND octet_length(fingerprint_hash) = 32
  ),
  CONSTRAINT checkout_intents_fingerprint_version CHECK (fingerprint_version = 1),
  CONSTRAINT checkout_intents_expected_seller CHECK (
    expected_mp_user_id IS NULL OR expected_mp_user_id ~ '^[0-9]*[1-9][0-9]*$'
  ),
  CONSTRAINT checkout_intents_status CHECK (
    status IN ('reserved', 'creating', 'unknown', 'ready', 'failed', 'expired')
  ),
  CONSTRAINT checkout_intents_phase CHECK (preference_phase IN ('no_post', 'post_possible')),
  CONSTRAINT checkout_intents_preference_pair CHECK (
    (preference_id IS NULL) = (init_point IS NULL)
    AND (preference_id IS NULL OR (btrim(preference_id) <> '' AND length(preference_id) <= 255))
    AND (init_point IS NULL OR (btrim(init_point) <> '' AND length(init_point) <= 4096))
  ),
  CONSTRAINT checkout_intents_claim_pair CHECK (
    (preference_claim_id IS NULL) = (preference_claimed_at IS NULL)
  ),
  CONSTRAINT checkout_intents_state_coherence CHECK (
    (status = 'reserved' AND preference_phase = 'no_post'
      AND preference_id IS NULL AND preference_claim_id IS NULL)
    OR (status = 'creating' AND preference_id IS NULL AND preference_claim_id IS NOT NULL)
    OR (status = 'unknown' AND preference_phase = 'post_possible'
      AND preference_id IS NULL AND preference_claim_id IS NULL)
    OR (status = 'ready' AND preference_phase = 'post_possible'
      AND preference_id IS NOT NULL AND preference_claim_id IS NULL)
    OR (status = 'failed' AND preference_id IS NULL AND preference_claim_id IS NULL)
    OR (status = 'expired' AND preference_claim_id IS NULL)
  ),
  CONSTRAINT checkout_intents_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX checkout_intents_preference_id_key
  ON public.checkout_intents(preference_id) WHERE preference_id IS NOT NULL;
CREATE INDEX checkout_intents_active_expiry_idx
  ON public.checkout_intents(expires_at)
  WHERE status IN ('reserved', 'creating', 'unknown', 'ready');

ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkout_intents TO service_role;

-- The advisory lock serializes first use of the same hash before a row exists.
-- Hash collisions only serialize unrelated requests; the 32-byte unique key
-- remains the actual identity. The nested appointment RPC shares this transaction.
CREATE FUNCTION public.get_or_create_checkout_intent_v1(
  p_token_hash bytea, p_fingerprint_hash bytea, p_fingerprint_version integer,
  p_barbershop_id uuid, p_barber_id uuid, p_service_id uuid,
  p_date date, p_start_time time without time zone,
  p_client_name text, p_client_phone text, p_expires_at timestamptz,
  p_expected_mp_user_id text
)
RETURNS TABLE(
  intent_id uuid, appointment_id uuid, intent_status text,
  preference_phase text, preference_id text, init_point text,
  expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_intent public.checkout_intents%ROWTYPE;
  v_appointment record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
    OR p_fingerprint_hash IS NULL OR octet_length(p_fingerprint_hash) <> 32
    OR p_fingerprint_version <> 1 OR p_fingerprint_version IS NULL
    OR (p_expected_mp_user_id IS NOT NULL
      AND p_expected_mp_user_id !~ '^[0-9]*[1-9][0-9]*$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CHECKOUT_INTENT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.encode(p_token_hash, 'hex'), 0)
  );

  SELECT i.* INTO v_intent
  FROM public.checkout_intents AS i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_intent.fingerprint_version <> p_fingerprint_version
      OR v_intent.fingerprint_hash <> p_fingerprint_hash
      OR v_intent.barbershop_id <> p_barbershop_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHECKOUT_INTENT_CONFLICT';
    END IF;
    IF v_intent.expected_mp_user_id IS DISTINCT FROM p_expected_mp_user_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHECKOUT_SELLER_CHANGED';
    END IF;
    IF v_intent.expires_at <= clock_timestamp() AND v_intent.status <> 'expired' THEN
      UPDATE public.checkout_intents AS i
      SET status = 'expired', preference_claim_id = NULL,
          preference_claimed_at = NULL, updated_at = clock_timestamp()
      WHERE i.id = v_intent.id
      RETURNING i.* INTO v_intent;
    ELSIF v_intent.status = 'creating' AND v_intent.preference_phase = 'post_possible'
      AND v_intent.preference_claimed_at + interval '30 seconds' <= clock_timestamp() THEN
      UPDATE public.checkout_intents AS i
      SET status = 'unknown', preference_claim_id = NULL,
          preference_claimed_at = NULL, updated_at = clock_timestamp()
      WHERE i.id = v_intent.id
      RETURNING i.* INTO v_intent;
    END IF;
  ELSE
    -- Same transaction, same barber row lock, slot checks, DST checks and
    -- financial snapshot as the existing authoritative payment booking RPC.
    SELECT * INTO STRICT v_appointment
    FROM public.create_payment_appointment_atomic(
      p_barbershop_id, p_barber_id, p_service_id, p_date, p_start_time,
      p_client_name, p_client_phone, p_expires_at
    );

    INSERT INTO public.checkout_intents AS i (
      token_hash, fingerprint_hash, fingerprint_version,
      barbershop_id, appointment_id, expected_mp_user_id, expires_at
    ) VALUES (
      p_token_hash, p_fingerprint_hash, p_fingerprint_version,
      p_barbershop_id, v_appointment.appointment_id,
      p_expected_mp_user_id, p_expires_at
    ) RETURNING i.* INTO v_intent;
  END IF;

  RETURN QUERY SELECT v_intent.id, v_intent.appointment_id,
    v_intent.status, v_intent.preference_phase, v_intent.preference_id,
    v_intent.init_point, v_intent.expires_at;
END;
$function$;

CREATE FUNCTION public.claim_checkout_preference_v1(p_intent_id uuid)
RETURNS TABLE(result text, claim_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_intent public.checkout_intents%ROWTYPE;
  v_claim_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  SELECT i.* INTO v_intent FROM public.checkout_intents AS i
  WHERE i.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::uuid; RETURN; END IF;
  IF v_intent.expires_at <= clock_timestamp() OR v_intent.status = 'expired' THEN
    UPDATE public.checkout_intents AS i
    SET status = 'expired', preference_claim_id = NULL,
        preference_claimed_at = NULL, updated_at = clock_timestamp()
    WHERE i.id = p_intent_id AND i.status <> 'expired';
    RETURN QUERY SELECT 'expired'::text, NULL::uuid; RETURN;
  END IF;
  IF v_intent.preference_phase = 'post_possible' THEN
    IF v_intent.status = 'creating'
      AND v_intent.preference_claimed_at + interval '30 seconds' <= clock_timestamp() THEN
      UPDATE public.checkout_intents AS i
      SET status = 'unknown', preference_claim_id = NULL,
          preference_claimed_at = NULL, updated_at = clock_timestamp()
      WHERE i.id = p_intent_id;
    END IF;
    RETURN QUERY SELECT 'post_possible'::text, NULL::uuid; RETURN;
  END IF;
  IF v_intent.status = 'creating'
    AND v_intent.preference_claimed_at + interval '30 seconds' > clock_timestamp() THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid; RETURN;
  END IF;
  IF v_intent.status NOT IN ('reserved', 'creating') THEN
    RETURN QUERY SELECT v_intent.status, NULL::uuid; RETURN;
  END IF;

  v_claim_id := gen_random_uuid();
  UPDATE public.checkout_intents AS i
  SET status = 'creating', preference_claim_id = v_claim_id,
      preference_claimed_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE i.id = p_intent_id;
  RETURN QUERY SELECT 'claimed'::text, v_claim_id;
END;
$function$;

CREATE FUNCTION public.mark_checkout_preference_post_possible_v1(
  p_intent_id uuid, p_claim_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  UPDATE public.checkout_intents AS i
  SET preference_phase = 'post_possible', updated_at = clock_timestamp()
  WHERE i.id = p_intent_id AND i.status = 'creating'
    AND i.preference_phase = 'no_post' AND i.preference_claim_id = p_claim_id
    AND i.preference_claimed_at + interval '30 seconds' > clock_timestamp()
    AND i.expires_at > clock_timestamp();
  RETURN CASE WHEN FOUND THEN 'marked' ELSE 'not_marked' END;
END;
$function$;

CREATE FUNCTION public.release_checkout_preference_claim_v1(
  p_intent_id uuid, p_claim_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  UPDATE public.checkout_intents AS i
  SET status = 'reserved', preference_claim_id = NULL,
      preference_claimed_at = NULL, updated_at = clock_timestamp()
  WHERE i.id = p_intent_id AND i.status = 'creating'
    AND i.preference_phase = 'no_post' AND i.preference_claim_id = p_claim_id
    AND i.expires_at > clock_timestamp();
  RETURN CASE WHEN FOUND THEN 'released' ELSE 'not_released' END;
END;
$function$;

CREATE FUNCTION public.mark_checkout_preference_unknown_v1(
  p_intent_id uuid, p_claim_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  UPDATE public.checkout_intents AS i
  SET status = 'unknown', preference_claim_id = NULL,
      preference_claimed_at = NULL, updated_at = clock_timestamp()
  WHERE i.id = p_intent_id AND i.status = 'creating'
    AND i.preference_phase = 'post_possible' AND i.preference_claim_id = p_claim_id;
  RETURN CASE WHEN FOUND THEN 'unknown' ELSE 'not_marked' END;
END;
$function$;

CREATE FUNCTION public.complete_checkout_preference_v1(
  p_intent_id uuid, p_claim_id uuid, p_preference_id text, p_init_point text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_intent public.checkout_intents%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  IF p_preference_id IS NULL OR btrim(p_preference_id) = ''
    OR length(p_preference_id) > 255 OR p_init_point IS NULL
    OR btrim(p_init_point) = '' OR length(p_init_point) > 4096 THEN
    RETURN 'invalid_preference';
  END IF;
  SELECT i.* INTO v_intent FROM public.checkout_intents AS i
  WHERE i.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_intent.status = 'ready' THEN
    RETURN CASE WHEN v_intent.preference_id = p_preference_id
      AND v_intent.init_point = p_init_point THEN 'already_ready' ELSE 'preference_conflict' END;
  END IF;
  IF v_intent.expires_at <= clock_timestamp()
    OR v_intent.preference_phase <> 'post_possible'
    OR NOT ((v_intent.status = 'creating' AND v_intent.preference_claim_id = p_claim_id
              AND p_claim_id IS NOT NULL)
      OR (v_intent.status = 'unknown' AND p_claim_id IS NULL)) THEN
    RETURN 'not_completable';
  END IF;

  UPDATE public.appointments AS a
  SET mp_preference_id = p_preference_id
  WHERE a.id = v_intent.appointment_id AND a.barbershop_id = v_intent.barbershop_id
    AND a.status = 'pending_payment' AND a.deposit_status = 'pending'
    AND a.expires_at = v_intent.expires_at AND a.expires_at > clock_timestamp()
    AND (a.mp_preference_id IS NULL OR a.mp_preference_id = p_preference_id);
  IF NOT FOUND THEN RETURN 'appointment_conflict'; END IF;

  UPDATE public.checkout_intents AS i
  SET status = 'ready', preference_id = p_preference_id,
      init_point = p_init_point, preference_claim_id = NULL,
      preference_claimed_at = NULL, updated_at = clock_timestamp()
  WHERE i.id = p_intent_id;
  RETURN 'ready';
END;
$function$;

-- The caller may use this only for a conclusively rejected MP request.
-- Network failures, 429, 5xx and malformed/absent responses must use unknown.
CREATE FUNCTION public.fail_checkout_preference_v1(p_intent_id uuid, p_claim_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_intent public.checkout_intents%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CHECKOUT_INTENT_SERVER_ONLY';
  END IF;
  SELECT i.* INTO v_intent FROM public.checkout_intents AS i
  WHERE i.id = p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_intent.status <> 'creating'
    OR v_intent.preference_phase <> 'post_possible'
    OR v_intent.preference_claim_id IS DISTINCT FROM p_claim_id
    OR p_claim_id IS NULL THEN RETURN 'not_failed'; END IF;
  UPDATE public.appointments AS a
  SET status = 'cancelled', cancelled_at = clock_timestamp(),
      cancelled_by = 'checkout_preference_failed'
  WHERE a.id = v_intent.appointment_id AND a.status = 'pending_payment'
    AND a.deposit_status = 'pending' AND a.mp_preference_id IS NULL;
  IF NOT FOUND THEN RETURN 'appointment_conflict'; END IF;
  UPDATE public.checkout_intents AS i
  SET status = 'failed', preference_claim_id = NULL,
      preference_claimed_at = NULL, updated_at = clock_timestamp()
  WHERE i.id = p_intent_id;
  RETURN 'failed';
END;
$function$;

CREATE FUNCTION public.expire_checkout_intents_v1()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.checkout_intents AS i
  SET status = 'expired', preference_claim_id = NULL,
      preference_claimed_at = NULL, updated_at = clock_timestamp()
  WHERE i.expires_at <= clock_timestamp() AND i.status <> 'expired';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_checkout_intent_v1(
  bytea,bytea,integer,uuid,uuid,uuid,date,time without time zone,text,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_checkout_intent_v1(
  bytea,bytea,integer,uuid,uuid,uuid,date,time without time zone,text,text,timestamptz,text
) TO service_role;
REVOKE ALL ON FUNCTION public.claim_checkout_preference_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_checkout_preference_v1(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_checkout_preference_post_possible_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_preference_post_possible_v1(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_checkout_preference_claim_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_preference_claim_v1(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_checkout_preference_unknown_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_preference_unknown_v1(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_checkout_preference_v1(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_checkout_preference_v1(uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.fail_checkout_preference_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_checkout_preference_v1(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.expire_checkout_intents_v1() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.schedule(
  'turnea-expire-checkout-intents', '*/5 * * * *',
  'SELECT public.expire_checkout_intents_v1();'
);
