// js/supabase-config.js
const SUPABASE_URL = 'https://ondryazpbjooqdzhgund.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6w4HWZj-uHKLxrJJlP5pIA_XhWVMHyX'; 

// Safely initialize Supabase
if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} else {
  console.error("Supabase CDN script failed to load before config!");
}