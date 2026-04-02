-- supabase/migrations/create_profiles_table.sql
-- =============================================
-- Profiles Table + Auto-Insert Trigger
-- Jab bhi koi naya user sign up kare, automatically
-- public.profiles table mein record create ho jaye
-- =============================================

-- ────────────────────────────────────────────────
-- 1. public.profiles table banayein
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  -- auth.users ki id se match karega (Foreign Key)
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        UNIQUE NOT NULL,

  -- Extra fields — zaroorat ke hisaab se add/remove karein
  full_name   TEXT,
  avatar_url  TEXT,
  phone       TEXT,

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────
-- 2. updated_at automatic update ke liye function
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- updated_at trigger banayein
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ────────────────────────────────────────────────
-- 3. AUTH TRIGGER: Naya user bana toh profiles mein
--    automatically insert karo
-- ────────────────────────────────────────────────

-- Function: auth.users mein INSERT hone par call hogi
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Service role ke permissions se chalegi
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    -- Google/OAuth login ke liye raw_user_meta_data se data lo
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)  -- Email ka pehla part naam ke roop mein
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;  -- Agar already exist kare toh skip karo
  RETURN NEW;
END;
$$;

-- Trigger: auth.users par AFTER INSERT
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────
-- 4. Row Level Security (RLS) — IMPORTANT!
--    Sirf logged-in user apna data dekh/edit kar sake
-- ────────────────────────────────────────────────

-- RLS enable karein
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: User apni profile read kar sake
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: User apni profile update kar sake
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 3: Insert sirf trigger ke through ho (SECURITY DEFINER function)
-- Direct INSERT users ko nahi karne dena chahiye
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ────────────────────────────────────────────────
-- 5. Performance ke liye Indexes
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles(created_at DESC);

-- ────────────────────────────────────────────────
-- 6. Verification: Sab theek hai check karein
-- ────────────────────────────────────────────────
-- Yeh query run karke check karein:
-- SELECT * FROM public.profiles LIMIT 10;
-- SELECT * FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created';
