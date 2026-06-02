import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Keep PKCE verifier in cookies so the round-trip survives.
        flowType: "pkce",
        // We handle URL tokens ourselves in /auth/callback; don't let the SDK
        // race us by auto-parsing on init.
        detectSessionInUrl: false,
      },
    },
  );
}
