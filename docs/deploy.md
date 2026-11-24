# PULSE — Production Deployment Runbook (Supabase + Cloudflare Pages)

This guide walks through deploying **PULSE** (`Zaidmcuni/Pulse`) as a multi-user social dance-fitness web app on **Supabase (Free Tier)** and **Cloudflare Pages (Free Tier)**.

---

## Architecture Summary

- **Static Workout & Vision Pipeline (`public/` on Cloudflare Pages CDN):**
  - MediaPipe WASM (`/wasm/*`), pose landmarker model (`/models/*`), and dance choreography/audio/art (`/dances/*`) remain static files served directly from Cloudflare's edge with 1-year immutable caching (`public/_headers`).
  - Browser SPA routes (`/me`, `/feed`, `/dances/:id`, `/groups/:id`, etc.) resolve via `public/_redirects`.
- **Supabase Backend (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`):**
  - When both environment variables are present, PULSE automatically activates `createSupabaseStore()` (`src/data/supabaseStore.ts`) and `createSupabaseAccounts()` (`src/auth/supabaseAccounts.ts`).
  - When unset (local offline development or `npm test`), PULSE falls back to `localStorage` and demo seed fixtures automatically.

---

## Step 1: Set Up Supabase (Free Tier)

1. **Create Project:**
   - Sign in at [https://supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
   - Name: `pulse-production` · Region: `ca-central-1` (Canada / Montreal) or `us-east-1` · Pricing Plan: **Free ($0/mo)**.
   - Wait ~60 seconds for Postgres provisioning to finish.

2. **Run Schema & Starter Seed:**
   - Open **SQL Editor** in the left sidebar and click **New query**.
   - Paste the full contents of [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql) and click **Run**.
   - Open another query tab, paste the contents of [`supabase/seed.sql`](../supabase/seed.sql), and click **Run** (seeds the 3 starter crews: `McGill Friday Night Crew`, `Montreal Dancers`, and `Hip-Hop Choreo`).

3. **Configure Authentication (Beta Instant Sign-Up):**
   - Go to **Authentication** → **Providers** → **Email**.
   - For frictionless beta testing (instant sign-in upon account creation without waiting for confirmation emails), toggle **Confirm email** to **OFF** and click **Save**.
   - *(Optional for public launch later)*: Re-enable **Confirm email** and connect a free **Resend** custom SMTP key under **Project Settings** → **Authentication** → **SMTP Settings**.

4. **Copy Project Credentials:**
   - Go to **Project Settings** (gear icon) → **API**.
   - Copy:
     - **Project URL** (`https://<project-ref>.supabase.co`) → `VITE_SUPABASE_URL`
     - **Project API Keys → `anon` `public`** → `VITE_SUPABASE_ANON_KEY`
   - *(Never expose the `service_role` secret key in the frontend or Cloudflare environment variables.)*

---

## Step 2: Deploy Frontend to Cloudflare Pages (Free Tier)

1. **Connect GitHub Repository:**
   - Sign in at [https://dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git**.
   - Select repository **`Zaidmcuni/Pulse`** and production branch **`main`**.

2. **Configure Build Settings:**
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`

3. **Add Environment Variables:**
   - Expand **Environment variables (advanced)** and add for both **Production** and **Preview**:
     - `NODE_VERSION` = `20`
     - `VITE_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = `<your-anon-public-key>`

4. **Deploy:**
   - Click **Save and Deploy**.
   - In ~60 seconds, PULSE will be live at `https://pulse-<hash>.pages.dev` (or your custom domain) with automatic HTTPS.

---

## Step 3: Post-Deploy Live Smoke Test Checklist

Run through these 4 checks once your Cloudflare Pages deployment finishes:

1. **HTTPS Webcam & BLE Watch Check:**
   - Open your `https://*.pages.dev` URL in desktop Chrome or Edge.
   - Sign up on `/signup` → connect a BLE Heart Rate monitor (WHOOP / Garmin) on `/watch` (or choose **Skip for now**).
   - Start **Tip Toe** (`/dances/dance4` → **Start dance**), grant camera permission, and confirm the mirrored skeleton overlay and 2.5D coach run smoothly (`>= 24 FPS`).

2. **Multi-Device Sign-Up & Crew Join:**
   - On **Device A** (laptop) and **Device B** (second laptop or Android Chrome), create two accounts (`/signup`).
   - Open **Feed** → **Groups** (`/groups`) on both devices and click **Join** on **McGill Friday Night Crew**.
   - Confirm member counts and weekly leaderboards update across both devices.

3. **Dance → Share to Crew → Live Realtime Kudos:**
   - Complete a dance on Device A, click **Share to Crew** on `/results/:id`, and optionally toggle **Show estimated calories**, **Show average heart rate**, or **Include highlight clip**.
   - On Device B viewing `/feed`, verify the post appears live via Supabase Realtime without refreshing, click **Kudos**, and confirm Device A's kudos count increments live.

4. **Row-Level Security (RLS) Privacy Verification:**
   - While signed in as User B, open Chrome DevTools Console / Network tab and verify that querying `private_biometrics` or `session_private_data` only returns User B's own row (`auth.uid() = user_id` / `player_id`) and **0 rows** for User A's age, weight, height, resting HR, unshared calories, or raw heart-rate samples.
