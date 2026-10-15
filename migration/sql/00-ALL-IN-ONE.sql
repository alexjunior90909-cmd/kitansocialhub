-- ============================================================================
-- KitanSocialHub — FULL SCHEMA for the new Supabase project
-- Generated automatically from the old backend's live schema (OpenAPI capture).
-- Idempotent: safe to re-run. Preserves app-generated text IDs.
-- ============================================================================

-- Drop nothing. Create tables only if missing (CREATE IF NOT EXISTS).


CREATE TABLE IF NOT EXISTS public.payments (
  "id" text NOT NULL,
  "tx_ref" text,
  "flw_transaction_id" text,
  "product_id" text,
  "product_type" text,
  "app_user_id" text,
  "amount_ngn" numeric DEFAULT 0,
  "amount_usd" numeric DEFAULT 0,
  "currency" text DEFAULT 'NGN',
  "customer_email" text DEFAULT '',
  "customer_name" text DEFAULT '',
  "payment_status" text DEFAULT 'pending',
  "verification_status" text DEFAULT 'unverified',
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.jap_orders (
  "id" text NOT NULL,
  "app_user_id" text,
  "service_id" text,
  "service_name" text,
  "category_name" text,
  "target_link" text,
  "quantity" integer,
  "cost_ngn" numeric,
  "cost_per_1k_ngn" numeric,
  "jap_order_id" text,
  "status" text DEFAULT 'pending',
  "jap_status" text,
  "start_count" integer,
  "remains" integer,
  "error_message" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.admin_wallet_adjustments (
  "id" text NOT NULL,
  "app_user_id" text,
  "admin_name" text,
  "adjustment_type" text,
  "amount" numeric,
  "balance_before" numeric,
  "balance_after" numeric,
  "reason" text DEFAULT '',
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.wallets (
  "id" text NOT NULL,
  "app_user_id" text,
  "balance" numeric DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS wallets_app_user_id_key ON public.wallets (app_user_id);

CREATE TABLE IF NOT EXISTS public.document_submissions (
  "id" text NOT NULL,
  "document_id" text,
  "user_id" uuid,
  "form_data" jsonb,
  "signature_data" text,
  "image_data" jsonb,
  "status" text DEFAULT 'processing',
  "order_id" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.order_content (
  "id" text NOT NULL,
  "product_id" text,
  "product_type" text,
  "text_content" text DEFAULT '',
  "image_urls" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS order_content_product_idproduct_type_key ON public.order_content (product_id, product_type);

CREATE TABLE IF NOT EXISTS public.website_settings (
  "key" text NOT NULL,
  "value" text,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS public.exchange_rate (
  "id" integer NOT NULL DEFAULT 1,
  "rate" numeric DEFAULT 1350,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.jap_services (
  "id" text NOT NULL,
  "category_name" text,
  "service_name" text,
  "original_api_price" numeric DEFAULT 0,
  "custom_admin_price" numeric,
  "min_quantity" integer DEFAULT 10,
  "max_quantity" integer DEFAULT 100000,
  "description" text DEFAULT '',
  "active" boolean DEFAULT true,
  "last_synced_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  "id" text NOT NULL,
  "app_user_id" text,
  "plan_id" text,
  "plan_name" text,
  "plan_snapshot" jsonb,
  "price_paid_ngn" numeric DEFAULT 0,
  "status" text DEFAULT 'active',
  "activated_at" timestamptz DEFAULT now(),
  "expires_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.smspool_price_overrides (
  "id" text NOT NULL,
  "country_id" text,
  "service_name" text,
  "custom_naira_price" numeric,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS smspool_price_overrides_country_idservice_name_key ON public.smspool_price_overrides (country_id, service_name);

CREATE TABLE IF NOT EXISTS public.receipt_generations (
  "id" text NOT NULL,
  "app_user_id" text,
  "product_id" text,
  "product_name" text,
  "form_data" jsonb,
  "amount_ngn" numeric DEFAULT 2500,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.website_products (
  "id" text NOT NULL,
  "title" text,
  "description" text DEFAULT '',
  "price_ngn" numeric DEFAULT 0,
  "preview_images" jsonb,
  "features" jsonb,
  "available" boolean DEFAULT true,
  "tags" jsonb,
  "is_premium" boolean DEFAULT true,
  "pinned" boolean DEFAULT false,
  "pin_position" integer,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.plan_products (
  "id" text NOT NULL DEFAULT gen_random_uuid()::text,
  "plan_id" text,
  "product_type" text,
  "product_id" text,
  "product_name" text DEFAULT '',
  "qty_limit" integer,
  "created_at" timestamptz DEFAULT now(),
  "included" boolean DEFAULT false,
  "product_table" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.social_accounts (
  "id" text NOT NULL,
  "title" text,
  "category" text DEFAULT 'Facebook',
  "price" numeric DEFAULT 0,
  "description" text DEFAULT '',
  "notes" text DEFAULT '',
  "available" boolean DEFAULT true,
  "stock" integer DEFAULT 0,
  "pinned" boolean DEFAULT false,
  "pin_position" integer,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.smspool_global_settings (
  "id" integer NOT NULL DEFAULT 1,
  "global_multiplier" numeric DEFAULT 1,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.products (
  "id" text NOT NULL,
  "title" text,
  "images" jsonb,
  "description" text DEFAULT '',
  "price" numeric DEFAULT 0,
  "country_pricing" jsonb,
  "countries" jsonb,
  "category" text,
  "available" boolean DEFAULT true,
  "tags" jsonb,
  "featured" boolean DEFAULT false,
  "rating" numeric,
  "review_count" integer,
  "created_at" timestamptz DEFAULT now(),
  "pinned" boolean DEFAULT false,
  "pin_position" integer,
  "thumbnail" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  "id" text NOT NULL,
  "name" text,
  "price_ngn" numeric DEFAULT 0,
  "duration_days" integer DEFAULT 30,
  "is_popular" boolean DEFAULT false,
  "enabled" boolean DEFAULT true,
  "description" text DEFAULT '',
  "color_theme" text DEFAULT 'teal',
  "sort_order" integer DEFAULT 0,
  "features" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.working_pictures (
  "id" text NOT NULL,
  "title" text,
  "description" text DEFAULT '',
  "price" numeric DEFAULT 0,
  "images" jsonb,
  "media_type" text DEFAULT 'image',
  "available" boolean DEFAULT true,
  "tags" jsonb,
  "featured" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "pinned" boolean DEFAULT false,
  "external_url" text,
  "pin_position" integer,
  "thumbnail" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.purchases (
  "id" text NOT NULL,
  "product_id" text,
  "product_type" text,
  "app_user_id" text,
  "amount" numeric DEFAULT 0,
  "reference" text DEFAULT '',
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.tutorial_videos (
  "service_key" text NOT NULL,
  "title" text DEFAULT '',
  "video_url" text DEFAULT '',
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("service_key")
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  "id" uuid NOT NULL,
  "username" text,
  "email" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.receipt_settings (
  "id" integer NOT NULL DEFAULT 1,
  "price_ngn" numeric DEFAULT 2500,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.virtual_number_orders (
  "id" text NOT NULL,
  "app_user_id" text,
  "service" text,
  "country" text,
  "hero_sms_id" text,
  "phone_number" text,
  "status" text DEFAULT 'waiting',
  "sms_code" text,
  "cost_ngn" numeric DEFAULT 0,
  "cost_rub" numeric DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.fivesim_global_settings (
  "id" integer NOT NULL DEFAULT 1,
  "global_multiplier" numeric DEFAULT 1,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  "key" text NOT NULL,
  "value" text,
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS public.social_account_orders (
  "id" text NOT NULL,
  "account_id" text,
  "app_user_id" text,
  "amount" numeric DEFAULT 0,
  "reference" text DEFAULT '',
  "status" text DEFAULT 'completed',
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  "id" text NOT NULL,
  "app_user_id" text,
  "type" text,
  "amount" numeric,
  "balance_after" numeric DEFAULT 0,
  "description" text DEFAULT '',
  "reference" text DEFAULT '',
  "product_id" text,
  "product_type" text,
  "status" text DEFAULT 'completed',
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.registered_users (
  "id" text NOT NULL,
  "email" text,
  "username" text DEFAULT '',
  "role" text DEFAULT 'user',
  "registered_at" timestamptz DEFAULT now(),
  "last_seen_at" timestamptz DEFAULT now(),
  "account_status" text DEFAULT 'active',
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS registered_users_email_key ON public.registered_users (email);

CREATE TABLE IF NOT EXISTS public.formats (
  "id" text NOT NULL,
  "title" text,
  "description" text DEFAULT '',
  "price" numeric DEFAULT 0,
  "preview_images" jsonb,
  "file_type" text,
  "available" boolean DEFAULT true,
  "tags" jsonb,
  "download_url" text DEFAULT '#',
  "created_at" timestamptz DEFAULT now(),
  "pinned" boolean DEFAULT false,
  "pin_position" integer,
  "thumbnail" text,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.fivesim_orders (
  "id" text NOT NULL,
  "app_user_id" text,
  "service" text,
  "country" text,
  "fivesim_order_id" text,
  "phone_number" text,
  "status" text DEFAULT 'PENDING',
  "sms_code" text,
  "cost_ngn" numeric DEFAULT 0,
  "cost_usd" numeric DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.receipt_fields (
  "id" text NOT NULL,
  "product_id" text,
  "field_type" text DEFAULT 'text',
  "label" text,
  "placeholder" text DEFAULT '',
  "required" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "options" jsonb,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.receipt_products (
  "id" text NOT NULL,
  "name" text,
  "slug" text,
  "brand_color" text DEFAULT '#000000',
  "bg_color" text DEFAULT '#ffffff',
  "enabled" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public.kitan_documents (
  "id" text NOT NULL,
  "title" text,
  "description" text DEFAULT '',
  "price" numeric DEFAULT 0,
  "preview_images" jsonb,
  "form_fields" jsonb,
  "available" boolean DEFAULT true,
  "category" text DEFAULT 'General',
  "created_at" timestamptz DEFAULT now(),
  "pinned" boolean DEFAULT false,
  "pin_position" integer,
  "thumbnail" text,
  PRIMARY KEY ("id")
);


-- ============================================================================
-- RLS — the application performs ALL operations with the public/publishable
-- key (no Supabase Auth; identity is client-side). The old backend was fully
-- permissive for the anon role; the app requires the same to function.
-- (Harden later as a separate, planned project — not during migration.)
-- ============================================================================


ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.payments;
CREATE POLICY "kitan anon all" ON public.payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.jap_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.jap_orders;
CREATE POLICY "kitan anon all" ON public.jap_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.admin_wallet_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.admin_wallet_adjustments;
CREATE POLICY "kitan anon all" ON public.admin_wallet_adjustments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.wallets;
CREATE POLICY "kitan anon all" ON public.wallets
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.document_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.document_submissions;
CREATE POLICY "kitan anon all" ON public.document_submissions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.order_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.order_content;
CREATE POLICY "kitan anon all" ON public.order_content
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.website_settings;
CREATE POLICY "kitan anon all" ON public.website_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.exchange_rate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.exchange_rate;
CREATE POLICY "kitan anon all" ON public.exchange_rate
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.jap_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.jap_services;
CREATE POLICY "kitan anon all" ON public.jap_services
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.user_subscriptions;
CREATE POLICY "kitan anon all" ON public.user_subscriptions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.smspool_price_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.smspool_price_overrides;
CREATE POLICY "kitan anon all" ON public.smspool_price_overrides
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.receipt_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.receipt_generations;
CREATE POLICY "kitan anon all" ON public.receipt_generations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.website_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.website_products;
CREATE POLICY "kitan anon all" ON public.website_products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.plan_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.plan_products;
CREATE POLICY "kitan anon all" ON public.plan_products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.social_accounts;
CREATE POLICY "kitan anon all" ON public.social_accounts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.smspool_global_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.smspool_global_settings;
CREATE POLICY "kitan anon all" ON public.smspool_global_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.products;
CREATE POLICY "kitan anon all" ON public.products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.subscription_plans;
CREATE POLICY "kitan anon all" ON public.subscription_plans
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.working_pictures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.working_pictures;
CREATE POLICY "kitan anon all" ON public.working_pictures
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.purchases;
CREATE POLICY "kitan anon all" ON public.purchases
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.tutorial_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.tutorial_videos;
CREATE POLICY "kitan anon all" ON public.tutorial_videos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.user_profiles;
CREATE POLICY "kitan anon all" ON public.user_profiles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.receipt_settings;
CREATE POLICY "kitan anon all" ON public.receipt_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.virtual_number_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.virtual_number_orders;
CREATE POLICY "kitan anon all" ON public.virtual_number_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.fivesim_global_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.fivesim_global_settings;
CREATE POLICY "kitan anon all" ON public.fivesim_global_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.app_settings;
CREATE POLICY "kitan anon all" ON public.app_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.social_account_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.social_account_orders;
CREATE POLICY "kitan anon all" ON public.social_account_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.wallet_transactions;
CREATE POLICY "kitan anon all" ON public.wallet_transactions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.registered_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.registered_users;
CREATE POLICY "kitan anon all" ON public.registered_users
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.formats;
CREATE POLICY "kitan anon all" ON public.formats
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.fivesim_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.fivesim_orders;
CREATE POLICY "kitan anon all" ON public.fivesim_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.receipt_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.receipt_fields;
CREATE POLICY "kitan anon all" ON public.receipt_fields
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.receipt_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.receipt_products;
CREATE POLICY "kitan anon all" ON public.receipt_products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.kitan_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kitan anon all" ON public.kitan_documents;
CREATE POLICY "kitan anon all" ON public.kitan_documents
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- STORAGE — bucket write policies (buckets themselves are created via API).
-- order-content: admin uploads order images with the anon key (existing model)
-- products/documents/working-pictures/formats/website-products: admin media
-- uploads + Base64 migration tool (Admin → Media Migr) with the anon key.
-- ============================================================================

DROP POLICY IF EXISTS "kitan media public read" ON storage.objects;
CREATE POLICY "kitan media public read" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon insert" ON storage.objects;
CREATE POLICY "kitan media anon insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon update" ON storage.objects;
CREATE POLICY "kitan media anon update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

DROP POLICY IF EXISTS "kitan media anon delete" ON storage.objects;
CREATE POLICY "kitan media anon delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id IN ('order-content','products','documents','working-pictures','formats','website-products'));

