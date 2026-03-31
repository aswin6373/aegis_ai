import { createClient } from '@supabase/supabase-js';

// These are the user's provided keys as fallbacks
const FALLBACK_URL = "https://agbgkpgtzjquektkzgiv.supabase.co";
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnYmdrcGd0empxdWVrdGt6Z2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NTEyMjgsImV4cCI6MjA5MDUyNzIyOH0.IUvaV5FmojnSDTSA7I3HcYRGJ7feX4osUR7ngbOQJEM";

const getSupabaseConfig = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const isEnvUrlValid = envUrl && envUrl.startsWith('http') && !envUrl.includes('placeholder');
  const isEnvKeyValid = envKey && envKey.length > 50 && !envKey.includes('placeholder');

  if (isEnvUrlValid && isEnvKeyValid) {
    console.log("Supabase: Using keys from environment variables.");
    return { url: envUrl, key: envKey };
  }

  console.log("Supabase: Using fallback keys provided in code.");
  return { url: FALLBACK_URL, key: FALLBACK_KEY };
};

const { url, key } = getSupabaseConfig();

const isValidUrl = (u: string): boolean => {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Create the client. We use the fallback if the URL is invalid.
// This ensures 'supabase' is almost never null.
export const supabase = isValidUrl(url) ? createClient(url, key) : null;

if (!supabase) {
  console.error("Supabase client failed to initialize. URL might be invalid:", url);
}
