import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.RELAY_BACKEND_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const client = configured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export function backendIsConfigured() {
  return configured;
}

export async function currentUser() {
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export function onAuthChange(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
  return () => data.subscription.unsubscribe();
}

export async function requestMagicLink(email, displayName) {
  if (!client) throw new Error("Relay accounts are not configured yet.");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      data: { display_name: displayName.trim().slice(0, 32) }
    }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function listConversations() {
  if (!client) return [];
  const { data, error } = await client
    .from("conversation_members")
    .select("conversation:conversations(id, kind, title, created_at, members:conversation_members(profile:profiles(id, display_name, handle)), messages(id, body, sender_id, created_at, sender:profiles(display_name)) )")
    .order("created_at", { foreignTable: "conversation.created_at", ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.conversation).filter(Boolean);
}

export async function sendNativeMessage(conversationId, body) {
  if (!client) throw new Error("Relay accounts are not configured yet.");
  const { error } = await client.from("messages").insert({ conversation_id: conversationId, body });
  if (error) throw error;
}

export async function startDirectConversation(handle, firstMessage) {
  if (!client) throw new Error("Relay accounts are not configured yet.");
  const { data, error } = await client.rpc("start_direct_conversation", {
    other_handle: handle.replace(/^@/, "").trim().toLowerCase(),
    first_message: firstMessage.trim()
  });
  if (error) throw error;
  return data;
}

export function subscribeToNativeMessages(onChange) {
  if (!client) return () => {};
  const channel = client
    .channel("relay-native-messages")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .subscribe();
  return () => client.removeChannel(channel);
}
