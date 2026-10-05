import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey } from "https://esm.sh/nostr-tools@2.7.2";
import {
  backendIsConfigured,
  currentUser,
  listConversations,
  onAuthChange,
  requestMagicLink,
  sendNativeMessage,
  signOut,
  startDirectConversation,
  subscribeToNativeMessages
} from "./relay-backend.js";

const STORAGE_KEY = "quietline.threads.v3";
const IDENTITY_KEY = "quietline.identity.v1";
const LIVE_SETTINGS_KEY = "quietline.liveSettings.v1";
const BRIDGE_SETTINGS_KEY = "quietline.whatsappBridge.v1";
const LIVE_THREAD_ID = "live-room";
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net"
];
const LIVE_KIND = 23333;

const connectors = [
  { id: "all", name: "All", short: "All", state: "Unified", enabled: true },
  { id: "relay", name: "Relay", short: "R", state: "Native messages", enabled: true },
  { id: "live", name: "Live Room", short: "Live", state: "Working now", enabled: true },
  { id: "whatsapp", name: "WhatsApp", short: "WA", state: "Local bridge", enabled: true },
  { id: "signal", name: "Signal", short: "SI", state: "Adapter slot", enabled: true },
  { id: "telegram", name: "Telegram", short: "TG", state: "Adapter slot", enabled: true },
  { id: "imessage", name: "iMessage", short: "IM", state: "Mac bridge slot", enabled: false },
  { id: "sms", name: "SMS", short: "SMS", state: "Phone bridge slot", enabled: false }
];

const seedThreads = [
  {
    id: LIVE_THREAD_ID,
    name: "Live Room",
    initials: "L",
    connector: "live",
    muted: false,
    pinned: true,
    unread: 0,
    messages: [
      { from: "them", type: "text", author: "Relay", text: "Connect a room code, share the invite link, and messages will sync through free public relays.", time: "Now" }
    ]
  },
  {
    id: "mara-wa",
    name: "Mara",
    initials: "M",
    connector: "whatsapp",
    target: "",
    muted: false,
    pinned: true,
    unread: 2,
    messages: [
      { from: "them", type: "text", text: "This feels like WhatsApp without the social layer.", time: "08:12" },
      { from: "me", type: "text", text: "That is the idea: one clean inbox for people, not a feed.", time: "08:13" },
      { from: "them", type: "image", text: "Photo shared in chat", time: "08:14", image: "photo" }
    ]
  },
  {
    id: "family-signal",
    name: "Family",
    initials: "F",
    connector: "signal",
    muted: true,
    pinned: false,
    unread: 0,
    messages: [
      { from: "them", type: "text", text: "Dinner plan is pinned here. No group broadcast needed.", time: "Yesterday" },
      { from: "me", type: "text", text: "Quiet notifications, but still easy to find.", time: "Yesterday" }
    ]
  },
  {
    id: "workshop-telegram",
    name: "Workshop",
    initials: "W",
    connector: "telegram",
    muted: false,
    pinned: false,
    unread: 1,
    messages: [
      { from: "them", type: "text", text: "Adapters should normalize chats into one simple thread shape.", time: "Mon" },
      { from: "me", type: "text", text: "Yes: source app, contact, messages, attachments, delivery state.", time: "Mon" }
    ]
  },
  {
    id: "alex-imessage",
    name: "Alex",
    initials: "A",
    connector: "imessage",
    muted: false,
    pinned: false,
    unread: 0,
    messages: [
      { from: "them", type: "text", text: "The iMessage bridge can live behind the same adapter interface later.", time: "Tue" }
    ]
  }
];

let threads = loadThreads();
let activeId = threads[0]?.id;
let filter = "all";
let connectorFilter = "all";
let pool;
let liveSubscription;
let liveRoom = "";
let liveRoomTag = "";
let liveName = "";
let liveSecretKey = loadIdentity();
let livePublicKey = getPublicKey(liveSecretKey);
let bridgeSettings = loadBridgeSettings();
let relayUser = null;
let stopNativeSubscription = () => {};
const seenEventIds = new Set();

const shell = document.querySelector(".app-shell");
const threadList = document.getElementById("threadList");
const searchInput = document.getElementById("searchInput");
const messagePane = document.getElementById("messagePane");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const imageInput = document.getElementById("imageInput");
const activeName = document.getElementById("activeName");
const activeMeta = document.getElementById("activeMeta");
const activeAvatar = document.getElementById("activeAvatar");
const activeConnector = document.getElementById("activeConnector");
const detailPanel = document.getElementById("detailPanel");
const connectorRail = document.getElementById("connectorRail");
const connectorList = document.getElementById("connectorList");
const dialog = document.getElementById("newChatDialog");
const newChatForm = document.getElementById("newChatForm");
const newContactName = document.getElementById("newContactName");
const newContactMessage = document.getElementById("newContactMessage");
const newContactConnector = document.getElementById("newContactConnector");
const liveNameInput = document.getElementById("liveNameInput");
const liveRoomInput = document.getElementById("liveRoomInput");
const connectLiveButton = document.getElementById("connectLiveButton");
const copyInviteButton = document.getElementById("copyInviteButton");
const liveStatus = document.getElementById("liveStatus");
const bridgeUrlInput = document.getElementById("bridgeUrlInput");
const bridgeTokenInput = document.getElementById("bridgeTokenInput");
const bridgeDryRunInput = document.getElementById("bridgeDryRunInput");
const saveBridgeButton = document.getElementById("saveBridgeButton");
const testBridgeButton = document.getElementById("testBridgeButton");
const bridgeStatus = document.getElementById("bridgeStatus");
const newContactPhone = document.getElementById("newContactPhone");
const newContactPhoneLabel = document.getElementById("newContactPhoneLabel");
const accountButton = document.getElementById("accountButton");
const accountPanelButton = document.getElementById("accountPanelButton");
const accountStatus = document.getElementById("accountStatus");
const accountDialog = document.getElementById("accountDialog");
const accountForm = document.getElementById("accountForm");
const accountEmail = document.getElementById("accountEmail");
const accountName = document.getElementById("accountName");
const accountFormStatus = document.getElementById("accountFormStatus");
const accountDialogCopy = document.getElementById("accountDialogCopy");
const accountSubmit = document.getElementById("accountSubmit");

function loadThreads() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : structuredClone(seedThreads);
  } catch {
    return structuredClone(seedThreads);
  }
}

function saveThreads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function loadIdentity() {
  const existing = localStorage.getItem(IDENTITY_KEY);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return hexToBytes(existing);
  const generated = generateSecretKey();
  localStorage.setItem(IDENTITY_KEY, bytesToHex(generated));
  return generated;
}

function activeThread() {
  return threads.find((thread) => thread.id === activeId) || threads[0];
}

function connectorFor(id) {
  return connectors.find((connector) => connector.id === id) || connectors[0];
}

function latestMessageText(thread) {
  const message = thread.messages.at(-1);
  if (!message) return "No messages yet";
  return message.type === "image" ? message.text || "Image" : message.text;
}

function visibleThreads() {
  const query = searchInput.value.trim().toLowerCase();
  return threads
    .filter((thread) => {
      const haystack = `${thread.name} ${latestMessageText(thread)} ${connectorFor(thread.connector).name}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesConnector = connectorFilter === "all" || thread.connector === connectorFilter;
      const matchesFilter =
        filter === "all" ||
        (filter === "unread" && thread.unread > 0) ||
        (filter === "quiet" && thread.muted);
      return matchesQuery && matchesConnector && matchesFilter;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

function renderConnectors() {
  connectorRail.innerHTML = connectors
    .map((connector) => `
      <button class="connector-chip ${connectorFilter === connector.id ? "active" : ""}" type="button" data-connector="${connector.id}">
        <span>${escapeHtml(connector.short)}</span>
      </button>
    `)
    .join("");

  connectorList.innerHTML = connectors
    .filter((connector) => connector.id !== "all")
    .map((connector) => `
      <div class="connector-row">
        <div class="connector-badge ${connector.enabled ? "" : "disabled"}">${escapeHtml(connector.short)}</div>
        <div>
          <strong>${escapeHtml(connector.name)}</strong>
          <p>${escapeHtml(connector.state)}</p>
        </div>
        <span class="connector-state ${connector.enabled ? "ready" : ""}">${connector.enabled ? "On" : "Later"}</span>
      </div>
    `)
    .join("");

  newContactConnector.innerHTML = connectors
    .filter((connector) => connector.id !== "all")
    .map((connector) => `<option value="${connector.id}">${escapeHtml(connector.name)}</option>`)
    .join("");
}

function renderThreads() {
  const visible = visibleThreads();
  threadList.innerHTML = visible
    .map((thread) => {
      const last = thread.messages.at(-1);
      const connector = connectorFor(thread.connector);
      return `
        <button class="thread-item ${thread.id === activeId ? "active" : ""}" type="button" data-id="${thread.id}">
          <div class="avatar" aria-hidden="true">${escapeHtml(thread.initials)}</div>
          <div class="thread-main">
            <div class="thread-top">
              <strong>${escapeHtml(thread.name)}</strong>
              <span class="source-label">${escapeHtml(connector.short)}</span>
              <span class="time">${escapeHtml(last?.time || "Now")}</span>
            </div>
            <span class="preview">${thread.pinned ? "Pinned · " : ""}${escapeHtml(latestMessageText(thread))}</span>
          </div>
          ${thread.unread ? `<span class="unread-pill">${thread.unread}</span>` : ""}
        </button>
      `;
    })
    .join("");
}

function renderConversation() {
  const thread = activeThread();
  if (!thread) return;

  activeId = thread.id;
  const connector = connectorFor(thread.connector);
  activeName.textContent = thread.name;
  activeMeta.textContent = conversationMeta(thread);
  activeAvatar.textContent = thread.initials;
  activeConnector.textContent = connector.name;

  messagePane.innerHTML = thread.messages
    .map((message) => `
      <article class="message ${message.from === "me" ? "outgoing" : "incoming"}">
        ${message.author && message.from !== "me" ? `<strong class="message-author">${escapeHtml(message.author)}</strong>` : ""}
        ${renderMessageBody(message)}
        <time>${escapeHtml(message.status ? `${message.time} · ${message.status}` : message.time)}</time>
      </article>
    `)
    .join("");
  messagePane.scrollTop = messagePane.scrollHeight;
}

function renderMessageBody(message) {
  if (message.type === "image") {
    const imageMarkup = message.image?.startsWith("data:")
      ? `<img class="message-image" src="${message.image}" alt="Attached image">`
      : `<div class="image-placeholder" role="img" aria-label="Shared image preview"></div>`;
    return `${imageMarkup}<p>${escapeHtml(message.text || "Image")}</p>`;
  }
  return `<p>${escapeHtml(message.text)}</p>`;
}

function setActiveThread(id) {
  const thread = threads.find((item) => item.id === id);
  if (!thread) return;
  activeId = id;
  thread.unread = 0;
  saveThreads();
  renderThreads();
  renderConversation();
  shell.classList.add("show-chat");
}

async function sendMessage(text) {
  const thread = activeThread();
  if (!thread || !text.trim()) return;
  if (thread.connector === "live") {
    publishLiveMessage({ type: "text", text: text.trim() });
    messageInput.value = "";
    return;
  }
  if (thread.connector === "relay") {
    if (!relayUser) {
      openAccountDialog();
      return;
    }
    try {
      await sendNativeMessage(thread.id.replace(/^relay-/, ""), text.trim());
      messageInput.value = "";
      await refreshNativeThreads();
    } catch (error) {
      addLocalSystemMessage(thread, `Relay could not send: ${error.message}`);
    }
    return;
  }
  const message = {
    from: "me",
    type: "text",
    text: text.trim(),
    time: formatTime()
  };
  thread.messages.push(message);
  saveThreads();
  messageInput.value = "";
  renderThreads();
  renderConversation();

  if (thread.connector === "whatsapp") {
    await sendWhatsAppMessage(thread, message);
  }
}

function sendImage(file) {
  const thread = activeThread();
  if (!thread || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (thread.connector === "live" && String(reader.result).length < 90000) {
      publishLiveMessage({
        type: "image",
        text: file.name,
        image: String(reader.result)
      });
      imageInput.value = "";
      return;
    }
    thread.messages.push({
      from: "me",
      type: "image",
      text: file.name,
      image: String(reader.result),
      time: formatTime()
    });
    saveThreads();
    imageInput.value = "";
    renderThreads();
    renderConversation();
  };
  reader.readAsDataURL(file);
}

async function connectLiveRoom() {
  liveName = liveNameInput.value.trim() || "Relay user";
  liveRoom = normalizeRoom(liveRoomInput.value || "family");
  liveRoomInput.value = liveRoom;
  liveNameInput.value = liveName;
  liveRoomTag = await hashRoom(liveRoom);
  localStorage.setItem(LIVE_SETTINGS_KEY, JSON.stringify({ name: liveName, room: liveRoom }));
  setLiveThreadName();
  setActiveThread(LIVE_THREAD_ID);
  subscribeLiveRoom();
  updateInviteUrl();
}

function subscribeLiveRoom() {
  liveSubscription?.close?.();
  pool ??= new SimplePool();
  liveStatus.textContent = `Connecting to ${RELAYS.length} free relays for room "${liveRoom}"...`;
  liveSubscription = pool.subscribeMany(
    RELAYS,
    [{ kinds: [LIVE_KIND], "#r": [liveRoomTag], since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 }],
    {
      onevent(event) {
        addLiveEvent(event);
      },
      oneose() {
        liveStatus.textContent = `Connected to room "${liveRoom}". Share the invite link with friends or family.`;
      }
    }
  );
}

function addLiveEvent(event) {
  if (seenEventIds.has(event.id)) return;
  seenEventIds.add(event.id);
  let payload;
  try {
    payload = JSON.parse(event.content);
  } catch {
    payload = { type: "text", text: event.content };
  }
  if (!payload || typeof payload.text !== "string") return;
  const thread = threads.find((item) => item.id === LIVE_THREAD_ID);
  if (!thread) return;
  thread.messages.push({
    id: event.id,
    from: event.pubkey === livePublicKey ? "me" : "them",
    author: payload.name || `${event.pubkey.slice(0, 8)}...`,
    type: payload.type === "image" ? "image" : "text",
    text: payload.text,
    image: typeof payload.image === "string" ? payload.image : undefined,
    time: formatEventTime(event.created_at)
  });
  thread.messages = dedupeMessages(thread.messages).slice(-200);
  if (activeId !== LIVE_THREAD_ID && event.pubkey !== livePublicKey) thread.unread += 1;
  saveThreads();
  renderThreads();
  renderConversation();
}

async function publishLiveMessage(payload) {
  if (!liveRoomTag) await connectLiveRoom();
  const event = finalizeEvent({
    kind: LIVE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["r", liveRoomTag],
      ["client", "Relay"],
      ["room", liveRoom]
    ],
    content: JSON.stringify({
      ...payload,
      name: liveName || "Relay user"
    })
  }, liveSecretKey);
  addLiveEvent(event);
  try {
    const publishes = pool.publish(RELAYS, event);
    await Promise.any(publishes);
    liveStatus.textContent = `Sent in room "${liveRoom}".`;
  } catch {
    liveStatus.textContent = "Message saved locally, but no free relay accepted it yet. Try again.";
  }
}

function setLiveThreadName() {
  const thread = threads.find((item) => item.id === LIVE_THREAD_ID);
  if (!thread) return;
  thread.name = liveRoom ? `Room: ${liveRoom}` : "Live Room";
  thread.initials = "L";
  saveThreads();
}

function updateInviteUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", liveRoom);
  window.history.replaceState({}, "", url);
}

async function copyInvite() {
  if (!liveRoom) await connectLiveRoom();
  const url = new URL(window.location.href);
  url.searchParams.set("room", liveRoom);
  await navigator.clipboard.writeText(url.toString());
  liveStatus.textContent = "Invite link copied.";
}

function initializeLiveControls() {
  const params = new URLSearchParams(window.location.search);
  const saved = readJson(localStorage.getItem(LIVE_SETTINGS_KEY)) || {};
  liveNameInput.value = saved.name || "Max";
  liveRoomInput.value = normalizeRoom(params.get("room") || saved.room || "family");
  connectLiveRoom();
}

function normalizeRoom(value) {
  return String(value || "family")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "family";
}

async function hashRoom(room) {
  const input = new TextEncoder().encode(`quietline:${room}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function formatEventTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dedupeMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    if (!message.id) return true;
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function readJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadBridgeSettings() {
  const saved = readJson(localStorage.getItem(BRIDGE_SETTINGS_KEY)) || {};
  return {
    url: saved.url || defaultBridgeUrl(),
    token: saved.token || "",
    dryRun: saved.dryRun !== false
  };
}

function saveBridgeSettings() {
  bridgeSettings = {
    url: normalizeBridgeUrl(bridgeUrlInput.value),
    token: bridgeTokenInput.value.trim(),
    dryRun: bridgeDryRunInput.checked
  };
  localStorage.setItem(BRIDGE_SETTINGS_KEY, JSON.stringify(bridgeSettings));
  bridgeUrlInput.value = bridgeSettings.url;
  bridgeTokenInput.value = bridgeSettings.token;
  bridgeStatus.textContent = bridgeSettings.token
    ? "WhatsApp bridge settings saved in this browser."
    : "Add the bridge token before sending WhatsApp messages.";
}

function initializeBridgeControls() {
  bridgeUrlInput.value = bridgeSettings.url;
  bridgeTokenInput.value = bridgeSettings.token;
  bridgeDryRunInput.checked = bridgeSettings.dryRun;
  updatePhoneField();
}

async function testWhatsAppBridge() {
  saveBridgeSettings();
  bridgeStatus.textContent = "Testing bridge...";
  try {
    const response = await fetch(`${bridgeSettings.url}/health`);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Bridge did not return healthy.");
    bridgeStatus.textContent = `Bridge is reachable. Dry-run default is ${result.dryRunDefault ? "on" : "off"}.`;
  } catch (error) {
    bridgeStatus.textContent = `Bridge test failed: ${error.message}`;
  }
}

async function sendWhatsAppMessage(thread, message) {
  if (!thread.target) {
    message.status = "No phone number";
    addLocalSystemMessage(thread, "Add an E.164 phone number to this WhatsApp thread before sending.");
    return;
  }
  if (!bridgeSettings.token) {
    message.status = "Bridge not connected";
    addLocalSystemMessage(thread, "Open Connectors and add the WhatsApp bridge token before sending.");
    return;
  }

  try {
    const response = await fetch(`${bridgeSettings.url}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bridgeSettings.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        target: thread.target,
        message: message.text,
        dryRun: bridgeSettings.dryRun
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "WhatsApp bridge send failed.");
    message.status = result.dryRun ? "Dry run" : "Sent";
    bridgeStatus.textContent = result.dryRun ? "WhatsApp dry-run succeeded." : "WhatsApp send handed to OpenClaw.";
  } catch (error) {
    message.status = "Failed";
    addLocalSystemMessage(thread, `WhatsApp bridge failed: ${error.message}`);
  }
  saveThreads();
  renderThreads();
  renderConversation();
}

function addLocalSystemMessage(thread, text) {
  thread.messages.push({
    from: "them",
    type: "text",
    author: "Relay",
    text,
    time: formatTime()
  });
  saveThreads();
  renderThreads();
  renderConversation();
}

function conversationMeta(thread) {
  if (thread.connector === "relay") {
    return relayUser ? "private Relay message" : "sign in to use Relay messages";
  }
  if (thread.connector === "whatsapp") {
    return thread.target ? `WhatsApp ${thread.target}` : "WhatsApp bridge needs a phone number";
  }
  return thread.muted ? "quiet notifications" : "messages and media only";
}

function normalizeBridgeUrl(value) {
  return String(value || defaultBridgeUrl()).trim().replace(/\/+$/g, "");
}

function defaultBridgeUrl() {
  return window.location.hostname && !window.location.hostname.endsWith("github.io")
    ? window.location.origin
    : "http://127.0.0.1:8787";
}

function normalizedPhone(value) {
  return String(value || "").replace(/\s+/g, "");
}

function updatePhoneField() {
  const isWhatsApp = newContactConnector.value === "whatsapp";
  newContactPhoneLabel.hidden = !isWhatsApp;
  newContactPhone.required = isWhatsApp;
}

async function createThread(name, firstMessage, connectorId, target = "") {
  const normalized = name.trim();
  if (!normalized) return false;
  if (connectorId === "relay") {
    if (!relayUser) {
      openAccountDialog();
      return false;
    }
    try {
      const conversationId = await startDirectConversation(normalized, firstMessage);
      await refreshNativeThreads();
      setActiveThread(`relay-${conversationId}`);
      return true;
    } catch (error) {
      newContactName.setCustomValidity(error.message);
      newContactName.reportValidity();
      return false;
    }
  }
  const phone = normalizedPhone(target);
  if (connectorId === "whatsapp" && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    newContactPhone.setCustomValidity("Use an E.164 phone number like +31612345678.");
    newContactPhone.reportValidity();
    return false;
  }
  newContactPhone.setCustomValidity("");
  const id = `${connectorId}-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  threads.unshift({
    id,
    name: normalized,
    initials: normalized.slice(0, 2).toUpperCase(),
    connector: connectorId,
    target: connectorId === "whatsapp" ? phone : "",
    muted: false,
    pinned: false,
    unread: 0,
    messages: [
      {
        from: "them",
        type: "text",
        text: firstMessage.trim() || "Started a conversation.",
        time: "Now"
      }
    ]
  });
  activeId = id;
  saveThreads();
  renderThreads();
  renderConversation();
  shell.classList.add("show-chat");
  return true;
}

function openAccountDialog() {
  accountFormStatus.textContent = backendIsConfigured()
    ? ""
    : "Relay accounts need a Supabase project before sign-in can be enabled.";
  accountDialogCopy.textContent = relayUser
    ? "You are signed in to Relay. You can sign out from this device below."
    : "Use your email to create a private Relay account. We’ll send a sign-in link—no password required.";
  accountSubmit.textContent = relayUser ? "Sign out" : "Send sign-in link";
  accountEmail.closest("label").hidden = Boolean(relayUser);
  accountName.closest("label").hidden = Boolean(relayUser);
  accountDialog.showModal();
  if (!relayUser) accountEmail.focus();
}

function renderAccount() {
  if (!backendIsConfigured()) {
    accountButton.textContent = "Accounts soon";
    accountPanelButton.textContent = "Accounts soon";
    accountStatus.textContent = "Native Relay accounts are ready to connect once the secure backend is configured.";
    return;
  }
  if (relayUser) {
    const label = relayUser.email || "Account";
    accountButton.textContent = "Signed in";
    accountPanelButton.textContent = "Account";
    accountStatus.textContent = `Signed in as ${label}. Native Relay messages are private to conversation members.`;
    return;
  }
  accountButton.textContent = "Create account";
  accountPanelButton.textContent = "Create account";
  accountStatus.textContent = "Create an account to message other Relay people directly.";
}

async function refreshNativeThreads() {
  if (!relayUser || !backendIsConfigured()) return;
  try {
    const conversations = await listConversations();
    const nativeThreads = conversations.map((conversation) => {
      const members = Array.isArray(conversation.members) ? conversation.members : [];
      const other = members.map((member) => member.profile).find((profile) => profile?.id !== relayUser.id) || members[0]?.profile;
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      return {
        id: `relay-${conversation.id}`,
        name: conversation.title || other?.display_name || other?.handle || "Relay conversation",
        initials: (conversation.title || other?.display_name || other?.handle || "R").slice(0, 2).toUpperCase(),
        connector: "relay",
        muted: false,
        pinned: true,
        unread: 0,
        messages: messages.reverse().map((message) => ({
          from: message.sender?.display_name === relayUser.user_metadata?.display_name ? "me" : "them",
          author: message.sender?.display_name,
          type: "text",
          text: message.body,
          time: formatEventTime(new Date(message.created_at).getTime() / 1000)
        }))
      };
    });
    threads = threads.filter((thread) => thread.connector !== "relay").concat(nativeThreads);
    saveThreads();
    renderThreads();
    renderConversation();
  } catch (error) {
    accountStatus.textContent = `Relay account connected, but conversations could not load: ${error.message}`;
  }
}

async function initializeAccounts() {
  renderAccount();
  if (!backendIsConfigured()) return;
  try {
    relayUser = await currentUser();
    renderAccount();
    await refreshNativeThreads();
  } catch (error) {
    accountStatus.textContent = `Account setup needs attention: ${error.message}`;
  }
  onAuthChange(async (user) => {
    relayUser = user;
    stopNativeSubscription();
    stopNativeSubscription = user ? subscribeToNativeMessages(refreshNativeThreads) : () => {};
    renderAccount();
    await refreshNativeThreads();
  });
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

threadList.addEventListener("click", (event) => {
  const button = event.target.closest(".thread-item");
  if (button) setActiveThread(button.dataset.id);
});

connectorRail.addEventListener("click", (event) => {
  const button = event.target.closest(".connector-chip");
  if (!button) return;
  connectorFilter = button.dataset.connector;
  renderConnectors();
  renderThreads();
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    filter = button.dataset.filter;
    renderThreads();
  });
});

searchInput.addEventListener("input", renderThreads);

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(messageInput.value);
});

imageInput.addEventListener("change", (event) => {
  sendImage(event.target.files?.[0]);
});

document.getElementById("privacyButton").addEventListener("click", () => {
  detailPanel.classList.add("open");
});

document.getElementById("closePanel").addEventListener("click", () => {
  detailPanel.classList.remove("open");
});

document.getElementById("backButton").addEventListener("click", () => {
  shell.classList.remove("show-chat");
});

document.getElementById("composeButton").addEventListener("click", () => {
  dialog.showModal();
  newContactName.focus();
});

accountButton.addEventListener("click", openAccountDialog);
accountPanelButton.addEventListener("click", openAccountDialog);
document.getElementById("cancelAccount").addEventListener("click", () => accountDialog.close());

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (relayUser) {
    await signOut();
    accountDialog.close();
    return;
  }
  if (!backendIsConfigured()) return;
  accountSubmit.disabled = true;
  accountFormStatus.textContent = "Sending sign-in link…";
  try {
    await requestMagicLink(accountEmail.value.trim(), accountName.value.trim());
    accountFormStatus.textContent = "Check your email for the Relay sign-in link.";
  } catch (error) {
    accountFormStatus.textContent = error.message;
  } finally {
    accountSubmit.disabled = false;
  }
});

document.getElementById("cancelNewChat").addEventListener("click", () => {
  dialog.close();
});

document.getElementById("attachButton").addEventListener("click", () => {
  imageInput.click();
});

connectLiveButton.addEventListener("click", connectLiveRoom);
copyInviteButton.addEventListener("click", copyInvite);
saveBridgeButton.addEventListener("click", saveBridgeSettings);
testBridgeButton.addEventListener("click", testWhatsAppBridge);
newContactConnector.addEventListener("change", updatePhoneField);

newChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const created = await createThread(newContactName.value, newContactMessage.value, newContactConnector.value, newContactPhone.value);
  if (!created) return;
  newContactName.value = "";
  newContactMessage.value = "";
  newContactPhone.value = "";
  dialog.close();
});

renderConnectors();
renderThreads();
renderConversation();
initializeBridgeControls();
initializeLiveControls();
initializeAccounts();
