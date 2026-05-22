const STORAGE_KEYS = {
  sessions: "auditvare-dbchat-sessions",
  activeSessionId: "auditvare-dbchat-active-session-id",
};

const DEFAULT_SETTINGS = {
  baseUrl: "/api/chat/database",
  apiKey: "",
};

const state = {
  sessions: [],
  activeSessionId: null,
  settings: { ...DEFAULT_SETTINGS },
  isPending: false,
};

const elements = {
  sessionList: document.getElementById("sessionList"),
  sessionCountLabel: document.getElementById("sessionCountLabel"),
  storageStatusLabel: document.getElementById("storageStatusLabel"),
  newSessionButton: document.getElementById("newSessionButton"),
  activeSessionTitle: document.getElementById("activeSessionTitle"),
  connectionStatus: document.getElementById("connectionStatus"),
  messagesPanel: document.getElementById("messagesPanel"),
  chatStage: document.getElementById("chatStage"),
  composerForm: document.getElementById("composerForm"),
  chatInput: document.getElementById("chatInput"),
  sendButton: document.getElementById("sendButton"),
  pendingIndicator: document.getElementById("pendingIndicator"),
  composerHint: document.getElementById("composerHint"),
  userMessageTemplate: document.getElementById("userMessageTemplate"),
  assistantMessageTemplate: document.getElementById("assistantMessageTemplate"),
};

function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createSession() {
  const timestamp = new Date().toISOString();
  return {
    id: generateId("session"),
    userId: generateId("browser-session"),
    title: "New Chat",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

function loadState() {
  state.settings = { ...DEFAULT_SETTINGS };

  try {
    const savedSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || "[]");
    if (Array.isArray(savedSessions) && savedSessions.length) {
      state.sessions = savedSessions;
    }
  } catch {
    state.sessions = [];
  }

  state.activeSessionId = localStorage.getItem(STORAGE_KEYS.activeSessionId);
  if (!state.sessions.length) {
    const session = createSession();
    state.sessions = [session];
    state.activeSessionId = session.id;
  }

  if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0].id;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions));
  localStorage.setItem(STORAGE_KEYS.activeSessionId, state.activeSessionId || "");
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId);
}

function updateConnectionStatus() {
  elements.connectionStatus.textContent = state.isPending ? "Generating" : "Ready";
  elements.connectionStatus.classList.toggle("ready", !state.isPending);
  elements.connectionStatus.classList.toggle("busy", state.isPending);
}

function renderSessions() {
  elements.sessionList.innerHTML = "";
  const sessions = [...state.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  sessions.forEach((session) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `session-button${session.id === state.activeSessionId ? " active" : ""}`;
    button.innerHTML = `
      <span class="session-title">${escapeHtml(session.title || "New Chat")}</span>
      <span class="session-subtitle">${session.messages.length} message${session.messages.length === 1 ? "" : "s"}</span>
    `;
    button.addEventListener("click", () => {
      state.activeSessionId = session.id;
      saveState();
      render();
      requestAnimationFrame(() => elements.chatInput.focus());
    });
    elements.sessionList.appendChild(button);
  });

  elements.sessionCountLabel.textContent = `${state.sessions.length} session${state.sessions.length === 1 ? "" : "s"}`;
  elements.storageStatusLabel.textContent = "Saved locally";
}

function renderMessages() {
  const session = getActiveSession();
  if (!session) return;

  elements.messagesPanel.innerHTML = "";
  const hasMessages = session.messages.length > 0;
  elements.chatStage.classList.toggle("has-messages", hasMessages);
  elements.activeSessionTitle.textContent = session.title || "New Chat";

  session.messages.forEach((message) => {
    if (message.role === "user") {
      const node = elements.userMessageTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".message-text").textContent = message.text;
      elements.messagesPanel.appendChild(node);
      return;
    }

    const node = elements.assistantMessageTemplate.content.firstElementChild.cloneNode(true);
    const statusNode = node.querySelector(".assistant-status");
    const answerNode = node.querySelector(".assistant-answer");
    const metaNode = node.querySelector(".assistant-meta");
    const detailsNode = node.querySelector(".assistant-details-content");

    statusNode.textContent = `HTTP ${message.httpStatus} · ${message.durationS.toFixed(2)} s`;

    const body = message.response || {};
    const apiStatus = body.status || "unknown";
    const apiMessage = body.message || "No message";
    const data = body.data || null;

    const answerFragments = [];
    if (typeof data?.answer === "string" && data.answer.trim()) {
      answerFragments.push(`<div class="assistant-section"><h4>Answer</h4><p class="message-text">${escapeHtml(data.answer)}</p></div>`);
    } else if (apiStatus === "error") {
      answerFragments.push(`<div class="assistant-section"><h4>Error</h4><p class="message-text">${escapeHtml(apiMessage)}</p></div>`);
    } else {
      answerFragments.push(`<div class="assistant-section"><h4>Message</h4><p class="message-text">${escapeHtml(apiMessage)}</p></div>`);
    }

    if (typeof data?.sql_query === "string" && data.sql_query.trim()) {
      answerFragments.push(`
        <div class="assistant-section">
          <h4>SQL Query</h4>
          <pre>${escapeHtml(data.sql_query)}</pre>
        </div>
      `);
    }

    if (Array.isArray(data?.rows) && data.rows.length) {
      answerFragments.push(`
        <div class="assistant-section">
          <h4>Rows</h4>
          ${renderRowsTable(data.rows)}
        </div>
      `);
    }

    answerNode.innerHTML = answerFragments.join("");

    [
      `status ${apiStatus}`,
      `api code ${body.code ?? "-"}`,
      `row count ${data?.row_count ?? 0}`,
      `time taken ${data?.time_taken_s ?? "-"} s`,
    ].forEach((label) => {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = label;
      metaNode.appendChild(chip);
    });

    detailsNode.innerHTML = `
      <div class="assistant-section">
        <h4>Raw Response</h4>
        <pre>${escapeHtml(JSON.stringify(message.response, null, 2))}</pre>
      </div>
    `;

    elements.messagesPanel.appendChild(node);
  });

  if (state.isPending && session.messages.length > 0) {
    const typingNode = document.createElement("article");
    typingNode.className = "message-row assistant-row typing-row";
    typingNode.innerHTML = `
      <div class="message-bubble assistant-bubble">
        <div class="assistant-header">
          <span class="assistant-badge">Assistant</span>
          <span class="assistant-status">Typing...</span>
        </div>
        <div class="typing-block" aria-live="polite" aria-label="Assistant is typing">
          <span class="typing-label">Preparing response</span>
          <span class="typing-dots" aria-hidden="true">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </span>
        </div>
      </div>
    `;
    elements.messagesPanel.appendChild(typingNode);
  }

  requestAnimationFrame(() => {
    elements.messagesPanel.scrollTop = elements.messagesPanel.scrollHeight;
  });
}

function renderRowsTable(rows) {
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  if (!columns.length) {
    return "<p class=\"message-text\">No row data returned.</p>";
  }

  const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = rows
    .slice(0, 8)
    .map((row) => {
      const cells = columns
        .map((column) => `<td>${escapeHtml(row?.[column] == null ? "null" : String(row[column]))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function render() {
  renderSessions();
  renderMessages();

  const session = getActiveSession();
  elements.composerHint.textContent = state.isPending
    ? "Input is locked until the response returns"
    : "Enter to send, Shift+Enter for newline";
  elements.pendingIndicator.classList.toggle("hidden", !state.isPending);
  elements.chatInput.disabled = state.isPending;
  elements.sendButton.disabled = state.isPending;
  updateConnectionStatus();

  if (session && !session.messages.length) {
    elements.chatInput.placeholder = "Ask a database chat question";
  }
}

function ensureTitle(session) {
  const firstUserMessage = session.messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    session.title = "New Chat";
    return;
  }
  session.title = firstUserMessage.text.trim().slice(0, 44) || "New Chat";
}

function addMessage(session, message) {
  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  ensureTitle(session);
  saveState();
  render();
}

function buildRequestMessages(session) {
  return session.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "user") {
        return {
          role: "user",
          content: message.text,
        };
      }

      return {
        role: "assistant",
        content:
          message.response?.data?.answer ||
          message.response?.message ||
          "",
      };
    })
    .filter((message) => message.content && message.content.trim());
}

async function sendMessage(text) {
  const session = getActiveSession();
  if (!session || state.isPending) return;

  addMessage(session, {
    id: generateId("msg"),
    role: "user",
    text,
    createdAt: new Date().toISOString(),
  });

  state.isPending = true;
  render();

  const started = performance.now();
  try {
    const response = await fetch(state.settings.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: session.userId,
        question: text,
        messages: buildRequestMessages(session),
      }),
    });

    const payload = await response.json();
    addMessage(session, {
      id: generateId("msg"),
      role: "assistant",
      httpStatus: response.status,
      durationS: (performance.now() - started) / 1000,
      response: payload,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    addMessage(session, {
      id: generateId("msg"),
      role: "assistant",
      httpStatus: 0,
      durationS: (performance.now() - started) / 1000,
      response: {
        status: "error",
        code: 0,
        message: error instanceof Error ? error.message : "Request failed",
        data: null,
      },
      createdAt: new Date().toISOString(),
    });
  } finally {
    state.isPending = false;
    render();
    autoResizeTextarea();
    elements.chatInput.focus();
  }
}

function autoResizeTextarea() {
  elements.chatInput.style.height = "auto";
  elements.chatInput.style.height = `${Math.min(elements.chatInput.scrollHeight, 220)}px`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attachEvents() {
  elements.newSessionButton.addEventListener("click", () => {
    const session = createSession();
    state.sessions.push(session);
    state.activeSessionId = session.id;
    saveState();
    render();
    requestAnimationFrame(() => elements.chatInput.focus());
  });

  elements.composerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.chatInput.value.trim();
    if (!text || state.isPending) return;
    elements.chatInput.value = "";
    autoResizeTextarea();
    await sendMessage(text);
  });

  elements.chatInput.addEventListener("input", autoResizeTextarea);
  elements.chatInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.composerForm.requestSubmit();
    }
  });

  document.querySelectorAll(".prompt-chip").forEach((button) => {
    button.addEventListener("click", () => {
      elements.chatInput.value = button.dataset.prompt || "";
      autoResizeTextarea();
      elements.chatInput.focus();
    });
  });
}

function init() {
  loadState();
  attachEvents();
  render();
  autoResizeTextarea();
}

init();