const STORAGE_KEY = "quietline.threads.v2";

const connectors = [
  { id: "all", name: "All", short: "All", state: "Unified", enabled: true },
  { id: "whatsapp", name: "WhatsApp", short: "WA", state: "Ready to connect", enabled: true },
  { id: "signal", name: "Signal", short: "SI", state: "Adapter slot", enabled: true },
  { id: "telegram", name: "Telegram", short: "TG", state: "Adapter slot", enabled: true },
  { id: "imessage", name: "iMessage", short: "IM", state: "Mac bridge slot", enabled: false },
  { id: "sms", name: "SMS", short: "SMS", state: "Phone bridge slot", enabled: false }
];

const seedThreads = [
  {
    id: "mara-wa",
    name: "Mara",
    initials: "M",
    connector: "whatsapp",
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
  activeMeta.textContent = thread.muted ? "quiet notifications" : "messages and media only";
  activeAvatar.textContent = thread.initials;
  activeConnector.textContent = connector.name;

  messagePane.innerHTML = thread.messages
    .map((message) => `
      <article class="message ${message.from === "me" ? "outgoing" : "incoming"}">
        ${renderMessageBody(message)}
        <time>${escapeHtml(message.time)}</time>
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

function sendMessage(text) {
  const thread = activeThread();
  if (!thread || !text.trim()) return;
  thread.messages.push({
    from: "me",
    type: "text",
    text: text.trim(),
    time: formatTime()
  });
  saveThreads();
  messageInput.value = "";
  renderThreads();
  renderConversation();
}

function sendImage(file) {
  const thread = activeThread();
  if (!thread || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
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

function createThread(name, firstMessage, connectorId) {
  const normalized = name.trim();
  if (!normalized) return;
  const id = `${connectorId}-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  threads.unshift({
    id,
    name: normalized,
    initials: normalized.slice(0, 2).toUpperCase(),
    connector: connectorId,
    muted: false,
    pinned: false,
    unread: 0,
    messages: [
      {
        from: "them",
        type: "text",
        text: firstMessage.trim() || "Started a quiet conversation.",
        time: "Now"
      }
    ]
  });
  activeId = id;
  saveThreads();
  renderThreads();
  renderConversation();
  shell.classList.add("show-chat");
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

document.getElementById("cancelNewChat").addEventListener("click", () => {
  dialog.close();
});

document.getElementById("attachButton").addEventListener("click", () => {
  imageInput.click();
});

newChatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createThread(newContactName.value, newContactMessage.value, newContactConnector.value);
  newContactName.value = "";
  newContactMessage.value = "";
  dialog.close();
});

renderConnectors();
renderThreads();
renderConversation();
