-- Future objects in public must be private until a migration grants the
-- minimum privileges required by their explicit application contract.
-- Hosted Supabase does not allow the migration role to change defaults owned
-- by supabase_admin. Turnea therefore hardens only the postgres/public defaults
-- controlled by repository migrations; platform-managed defaults stay outside
-- this migration and outside its final assertion.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- Backend table access remains the technical default. Function execution is
-- intentionally opt-in, including for service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- Reset every Turnea function to a closed baseline before restoring the
-- explicit public, owner, and backend contracts below.
REVOKE ALL ON FUNCTION public.handle_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.appointment_blocks_slot(text, text, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_barbershop_timezone()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.classify_local_datetime(date, time without time zone, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_expired_pending_payments()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_busy_slots(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_appointment_payment_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_appointment_result(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_blocked_slots(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_barbers(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_public_barber_active(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_barbershop_by_slug(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_barbershop_checkout_config(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_services(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_service_checkout_config(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid, date, time without time zone, text, text, boolean, numeric, timestamp with time zone)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, uuid, date, date)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_payment_status(uuid, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_result(uuid, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_blocked_slots(uuid, uuid, date, date)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_barbers(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_barber_active(uuid, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_barbershop_by_slug(text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_barbershop_checkout_config(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_services(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_checkout_config(uuid, uuid)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.update_appointment_status_owner(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_payment_reconciliation_retained(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_payment_reconciliation_refund(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.retry_payment_reconciliation_refund(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_barber_blocked_slot(uuid, date, boolean, time without time zone, time without time zone, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_barber_vacation(uuid, date, date, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_barber_blocked_slot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_barber_with_default_schedule(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_barber_weekly_schedule(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_service(uuid, text, text, integer, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_appointment_status_owner(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payment_reconciliation_retained(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_reconciliation_refund(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_payment_reconciliation_refund(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_barber_blocked_slot(uuid, date, boolean, time without time zone, time without time zone, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_barber_vacation(uuid, date, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_barber_blocked_slot(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_barber_with_default_schedule(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_barber_weekly_schedule(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service(uuid, text, text, integer, numeric)
  TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_paid_appointment_atomic_v2(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_payment_reconciliation(uuid, uuid, text, text, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_payment_reconciliation_refund(uuid, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_payment_reconciliation_refund(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_payment_reconciliation_refund_verification_required(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.confirm_paid_appointment_atomic_v2(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_paid_appointment_atomic(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.register_payment_reconciliation(uuid, uuid, text, text, numeric, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_reconciliation_refund(uuid, text, numeric, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_reconciliation_refund(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payment_reconciliation_refund_verification_required(uuid, uuid)
  TO service_role;

-- Assert only the postgres/public defaults that hosted migrations can manage.
-- supabase_admin defaults are platform-managed and intentionally excluded.
-- Fail if a broad default remains effective for client roles, or if future
-- functions remain executable by PUBLIC/service_role implicitly.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS defaults
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = defaults.defaclrole
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE owner_role.rolname = 'postgres'
      AND namespace.nspname = 'public'
      AND (
        privilege.grantee = 0
        OR grantee_role.rolname IN ('anon', 'authenticated')
        OR (
          defaults.defaclobjtype = 'f'
          AND grantee_role.rolname = 'service_role'
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PUBLIC_DEFAULT_PRIVILEGES_NOT_HARDENED';
  END IF;
END;
$block$;
