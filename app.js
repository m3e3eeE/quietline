const STORAGE_KEY = "quietline.threads.v1";

const seedThreads = [
  {
    id: "mara",
    name: "Mara",
    initials: "M",
    muted: false,
    unread: 2,
    messages: [
      { from: "them", text: "No status wall, no follower graph. Just this conversation.", time: "08:12" },
      { from: "me", text: "Exactly. WhatsApp utility, minus the social pressure.", time: "08:13" },
      { from: "them", text: "Can we keep read receipts quiet by default?", time: "08:14" }
    ]
  },
  {
    id: "house",
    name: "House",
    initials: "H",
    muted: true,
    unread: 0,
    messages: [
      { from: "them", text: "Groceries list is in the pinned note.", time: "Yesterday" },
      { from: "me", text: "Perfect. No group announcements outside the thread.", time: "Yesterday" }
    ]
  },
  {
    id: "workshop",
    name: "Workshop",
    initials: "W",
    muted: false,
    unread: 1,
    messages: [
      { from: "them", text: "Ship the prototype as a static GitHub Pages app first.", time: "Mon" },
      { from: "me", text: "Done. Local-only state until there is an encrypted backend.", time: "Mon" }
    ]
  }
];

let threads = loadThreads();
let activeId = threads[0]?.id;
let filter = "all";

const shell = document.querySelector(".app-shell");
const threadList = document.getElementById("threadList");
const searchInput = document.getElementById("searchInput");
const messagePane = document.getElementById("messagePane");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const activeName = document.getElementById("activeName");
const activeMeta = document.getElementById("activeMeta");
const activeAvatar = document.getElementById("activeAvatar");
const detailPanel = document.getElementById("detailPanel");
const dialog = document.getElementById("newChatDialog");
const newChatForm = document.getElementById("newChatForm");
const newContactName = document.getElementById("newContactName");
const newContactMessage = document.getElementById("newContactMessage");

function loadThreads() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : seedThreads;
  } catch {
    return seedThreads;
  }
}

function saveThreads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function activeThread() {
  return threads.find((thread) => thread.id === activeId) || threads[0];
}

function renderThreads() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = threads.filter((thread) => {
    const last = thread.messages.at(-1)?.text || "";
    const matchesQuery = !query || thread.name.toLowerCase().includes(query) || last.toLowerCase().includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "unread" && thread.unread > 0) ||
      (filter === "quiet" && thread.muted);
    return matchesQuery && matchesFilter;
  });

  threadList.innerHTML = visible
    .map((thread) => {
      const last = thread.messages.at(-1);
      return `
        <button class="thread-item ${thread.id === activeId ? "active" : ""}" type="button" data-id="${thread.id}">
          <div class="avatar" aria-hidden="true">${escapeHtml(thread.initials)}</div>
          <div class="thread-main">
            <div class="thread-top">
              <strong>${escapeHtml(thread.name)}</strong>
              <span class="time">${escapeHtml(last?.time || "Now")}</span>
            </div>
            <span class="preview">${escapeHtml(last?.text || "No messages yet")}</span>
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
  activeName.textContent = thread.name;
  activeMeta.textContent = thread.muted ? "quiet thread, notifications off" : "private thread, no public presence";
  activeAvatar.textContent = thread.initials;

  messagePane.innerHTML = thread.messages
    .map((message) => `
      <article class="message ${message.from === "me" ? "outgoing" : "incoming"}">
        <p>${escapeHtml(message.text)}</p>
        <time>${escapeHtml(message.time)}</time>
      </article>
    `)
    .join("");
  messagePane.scrollTop = messagePane.scrollHeight;
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
    text: text.trim(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
  saveThreads();
  messageInput.value = "";
  renderThreads();
  renderConversation();
}

function createThread(name, firstMessage) {
  const normalized = name.trim();
  if (!normalized) return;
  const id = `${normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  threads.unshift({
    id,
    name: normalized,
    initials: normalized.slice(0, 2).toUpperCase(),
    muted: false,
    unread: 0,
    messages: [
      {
        from: "them",
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
  sendMessage("Attachment placeholder: files would stay inside this private thread.");
});

newChatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createThread(newContactName.value, newContactMessage.value);
  newContactName.value = "";
  newContactMessage.value = "";
  dialog.close();
});

renderThreads();
renderConversation();
