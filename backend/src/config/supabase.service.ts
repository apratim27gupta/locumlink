// lib/supabaseClient.js
// =============================================
// Supabase Client Initialization
// Browser-safe client using ANON key
// =============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase URL aur ANON Key missing hain! .env.local file check karein.',
  );
}

// Browser client — React components mein use karein
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // OTP ke liye PKCE flow use karna best practice hai
    flowType: 'pkce',
    // Session localStorage mein automatically store hoga
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// =============================================
// Admin/Server-side client (Service Role Key)
// IMPORTANT: Yeh sirf server-side (API routes) mein use karein
// Browser mein KABHI mat use karein — security risk hai
// =============================================
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
