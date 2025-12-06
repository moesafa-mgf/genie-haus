// js/app.js
(function () {
  "use strict";

  const APP_STATE = {
    runtime: {
      locationId: null,
      userId: null,
      email: null,
      name: null,
    },
    location: null,
    staff: [],
    workspaceRoles: {}, // workspaceId -> { email: role }
    workspaces: [],
    currentWorkspaceId: null, // workspace must be selected first
    currentView: "table", // "table" | "board" | "dashboard"
    tasks: [],
    columns: [],
    filters: { assigneeEmail: "" },
    sync: { status: "idle", lastRemoteAt: null },
    instanceId: `client_${Math.random().toString(36).slice(2)}`,
  };

  const DEFAULT_COLUMNS = [
    { id: "title", label: "Title", type: "text", locked: true },
    {
      id: "status",
      label: "Status",
      type: "single_select",
      locked: true,
      options: [
        { id: "todo", label: "To Do", color: "gray" },
        { id: "in_progress", label: "In Progress", color: "blue" },
        { id: "done", label: "Done", color: "green" },
      ],
    },
    { id: "assignee", label: "Assignee", type: "user", locked: true },
    { id: "updatedAt", label: "Updated", type: "date", locked: true, readonly: true },
  ];

  const REMOTE_SYNC_API = "/api/workspace-state";
  const WORKSPACES_API = "/api/workspaces";
  const WORKSPACE_ROLES_API = "/api/workspace-roles";
  const GHL_USERS_API = "/api/ghl-users";
  const FIELD_TYPES = [
    { value: "text", label: "Single line text" },
    { value: "long_text", label: "Long text" },
    { value: "attachment", label: "Attachment" },
    { value: "checkbox", label: "Checkbox" },
    { value: "multi_select", label: "Multiple select" },
    { value: "single_select", label: "Single select" },
    { value: "user", label: "User" },
    { value: "date", label: "Date" },
    { value: "phone", label: "Phone number" },
    { value: "email", label: "Email" },
    { value: "url", label: "URL" },
    { value: "number", label: "Number" },
    { value: "currency", label: "Currency" },
    { value: "percent", label: "Percent" },
    { value: "duration", label: "Duration" },
    { value: "rating", label: "Rating" },
  ];
  const OPTION_COLORS = ["gray", "blue", "green", "red", "yellow", "purple", "pink", "teal"];

  const UI_STATE = {
    chooserOpen: false,
  };

  let draggedTaskId = null;

  // -------- 0. Build layout into #app --------
  function buildLayout() {
    const root = document.getElementById("app");
    if (!root) {
      console.error("[app] #app container not found");
      return;
    }

    root.innerHTML = `
      <div id="app-root">
        <header class="gt-header">
          <div class="gt-header-left">
            <h1 class="gt-title">Genie Tracker</h1>
            <div class="gt-subtitle">
              <span id="gt-location-name">Loading subaccount…</span>
              <span id="gt-user-name" class="gt-chip">Loading user…</span>
            </div>
          </div>
          <div class="gt-header-right">
            <button id="gt-switch-workspace" class="gt-button" style="display:none;">Switch workspace</button>
            <span class="gt-badge" id="gt-sync-status">Syncing…</span>
          </div>
        </header>

        <main id="gt-main" class="gt-main">
          <section class="gt-panel">
            <div class="gt-panel-header">
              <h2>Tasks</h2>
              <div class="gt-panel-header-actions">
                <button id="gt-create-workspace" class="gt-button gt-button-primary" style="display:none;">
                  + New Workspace
                </button>
                <button id="gt-manage-fields" class="gt-button">Fields</button>
                <button id="gt-add-task" class="gt-button gt-button-primary">
                  + New Task
                </button>
              </div>
            </div>
            <div class="gt-panel-body">
              <!-- Shown when no workspace is selected -->
              <div id="gt-no-workspace" class="gt-no-workspace">
                <div>
                  <div style="font-size:13px; font-weight:500; margin-bottom:4px;">
                    Select a workspace to get started
                  </div>
                  <div style="font-size:12px; color:#6b7280;">
                    Use the chooser to pick a workspace before editing tasks.
                  </div>
                </div>
              </div>

              <!-- Main tasks shell (hidden until workspace chosen) -->
              <div id="gt-tasks-shell">
                <div class="gt-view-tabs" id="gt-view-tabs">
                  <!-- view buttons injected by JS -->
                </div>

                <!-- TABLE VIEW -->
                <div id="gt-view-table" class="gt-view-section">
                  <div class="gt-table-wrapper">
                    <table class="gt-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Status</th>
                          <th>Assignee</th>
                          <th>Updated</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody id="gt-task-tbody">
                        <!-- rows injected by JS -->
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- BOARD VIEW -->
                <div id="gt-view-board" class="gt-view-section is-hidden">
                  <div id="gt-board-root" class="gt-board">
                    <!-- columns injected by JS -->
                  </div>
                </div>

                <!-- DASHBOARD VIEW -->
                <div id="gt-view-dashboard" class="gt-view-section is-hidden">
                  <div id="gt-dashboard-root" class="gt-dashboard">
                    <!-- dashboard sections injected by JS -->
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
        <div id="gt-workspace-settings-modal" class="gt-modal is-hidden"></div>
        <div id="gt-workspace-chooser-page" class="gt-chooser-page is-hidden"></div>
        <div id="gt-fields-modal" class="gt-modal is-hidden"></div>
        <div id="gt-toast-stack" class="gt-toast-stack"></div>
      </div>
    `;
  }

  // -------- 1. Role helpers --------
  function getCurrentUserRole() {
    const email = APP_STATE.runtime.email || "";
    const wsId = APP_STATE.currentWorkspaceId;
    // If no workspace is selected yet, let admins proceed (chooser needs this)
    if (!wsId) return "admin";
    if (!email) return "member";
    const roles = APP_STATE.workspaceRoles[wsId] || {};
    return roles[email.toLowerCase()] || "admin"; // default to admin when no role set
  }

  function canViewDashboard() {
    const role = getCurrentUserRole();
    return role === "admin" || role === "manager";
  }

  function isMemberRole() {
    const role = getCurrentUserRole();
    return role === "member";
  }

  // -------- 2. Runtime (URL + postMessage) --------
  function parseQuery() {
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams;
      APP_STATE.runtime.locationId = p.get("locationId") || null;
      APP_STATE.runtime.userId = p.get("userId") || null;
      APP_STATE.runtime.email = p.get("email") || null;
      APP_STATE.runtime.name = p.get("name") || null;
    } catch (err) {
      console.warn("[app] failed to parse query params", err);
    }
  }
  parseQuery();

  window.addEventListener("message", (event) => {
    const d = event.data;
    if (!d || d.type !== "GENIE_TRACKER_CONTEXT") return;

    console.log("[app] GENIE_TRACKER_CONTEXT received", d);

    if (d.location) {
      APP_STATE.location = d.location;
      APP_STATE.runtime.locationId =
        d.location.id || APP_STATE.runtime.locationId;
    }
    if (d.user) {
      APP_STATE.runtime.userId = d.user.id || APP_STATE.runtime.userId;
      APP_STATE.runtime.email = d.user.email || APP_STATE.runtime.email;
      APP_STATE.runtime.name = d.user.name || APP_STATE.runtime.name;
    }
    if (Array.isArray(d.staff) && d.staff.length) {
      APP_STATE.staff = normalizeStaff(d.staff);
      renderTasks();
      renderBoardView();
      if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
        renderDashboardView();
      }
    }

    updateHeaderUI();
    renderViewTabs(); // rerender view tabs once we know current user
    updateWorkspaceActionsVisibility();
    fetchWorkspaces();
  });

  function normalizeStaff(list) {
    return list
      .filter((u) => u && u.email)
      .map((u) => {
        const first = u.firstName || u.first_name || "";
        const last = u.lastName || u.last_name || "";
        const name =
          u.name ||
          `${first} ${last}`.trim() ||
          u.email ||
          "Unknown user";
        return { id: u.id, email: u.email, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // -------- 3b. Workspaces backend --------
  async function fetchWorkspaces() {
    if (!APP_STATE.runtime.locationId) return;

    try {
      const url = `${WORKSPACES_API}?locationId=${encodeURIComponent(
        APP_STATE.runtime.locationId
      )}&userEmail=${encodeURIComponent(APP_STATE.runtime.email || "")}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] workspaces fetch failed", resp.status, data);
        return;
      }

      APP_STATE.workspaces = Array.isArray(data.workspaces)
        ? data.workspaces
        : [];

      renderWorkspaceSelect();

      // fetch roles for selected workspace if present
      if (APP_STATE.currentWorkspaceId) {
        fetchWorkspaceRoles(APP_STATE.currentWorkspaceId);
      }

      // Auto-select first workspace if none selected
      if (!APP_STATE.currentWorkspaceId && APP_STATE.workspaces.length) {
        if (APP_STATE.workspaces.length === 1) {
          selectWorkspace(APP_STATE.workspaces[0].id);
        } else {
          openWorkspaceChooser();
        }
      } else if (
        APP_STATE.currentWorkspaceId &&
        !APP_STATE.workspaces.find((w) => w.id === APP_STATE.currentWorkspaceId)
      ) {
        // Previously selected workspace no longer exists
        selectWorkspace(null);
        openWorkspaceChooser();
      }
    } catch (err) {
      console.warn("[app] workspaces fetch error", err);
    }
  }

  async function fetchWorkspaceRoles(workspaceId) {
    if (!workspaceId || !APP_STATE.runtime.locationId || !APP_STATE.runtime.email)
      return;

    try {
      const url = `${WORKSPACE_ROLES_API}?locationId=${encodeURIComponent(
        APP_STATE.runtime.locationId
      )}&workspaceId=${encodeURIComponent(workspaceId)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] workspace roles fetch failed", resp.status, data);
        return;
      }

      const map = {};
      (data.roles || []).forEach((r) => {
        if (r.user_email && r.role) {
          map[r.user_email.toLowerCase()] = r.role;
        }
      });
      APP_STATE.workspaceRoles[workspaceId] = map;
      updateWorkspaceActionsVisibility();
      renderViewTabs();
      if (!canViewDashboard() && APP_STATE.currentView === "dashboard") {
        setActiveView("table");
      }
    } catch (err) {
      console.warn("[app] workspace roles fetch error", err);
    }
  }

  // -------- 3. Backend staff fetch (PIT, optional) --------
  async function fetchStaffBackend() {
    if (!APP_STATE.runtime.locationId) {
      console.log("[app] no locationId, skipping staff fetch");
      return;
    }

    try {
      const url = `${GHL_USERS_API}?locationId=${encodeURIComponent(
        APP_STATE.runtime.locationId
      )}`;
      console.log("[app] fetching staff from backend:", url);
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] staff fetch failed", resp.status, data);
        return;
      }
      APP_STATE.staff = normalizeStaff(data.staff || []);
      renderTasks();
      renderBoardView();
      if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
        renderDashboardView();
      }
    } catch (err) {
      console.warn("[app] staff fetch error", err);
    }
  }

  // -------- 4. Sync helpers --------
  function setSyncStatus(status) {
    const el = document.getElementById("gt-sync-status");
    if (!el) return;
    APP_STATE.sync.status = status;

    el.classList.remove("gt-ok", "gt-error");
    if (status === "syncing") {
      el.textContent = "Syncing…";
    } else if (status === "ok") {
      el.textContent = "Synced";
      el.classList.add("gt-ok");
    } else if (status === "error") {
      el.textContent = "Sync error";
      el.classList.add("gt-error");
    } else {
      el.textContent = "Idle";
    }
  }

  async function loadRemote() {
    if (!APP_STATE.runtime.locationId || !APP_STATE.currentWorkspaceId) return;
    try {
      const url = `${REMOTE_SYNC_API}?locationId=${encodeURIComponent(
        APP_STATE.runtime.locationId
      )}&workspaceId=${encodeURIComponent(APP_STATE.currentWorkspaceId)}&userEmail=${encodeURIComponent(
        APP_STATE.runtime.email || ""
      )}`;
      console.log("[app] GET", url);
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] remote load failed", resp.status, data);
        setSyncStatus("error");
        return;
      }
      if (data.role && APP_STATE.currentWorkspaceId) {
        const map = APP_STATE.workspaceRoles[APP_STATE.currentWorkspaceId] || {};
        if (APP_STATE.runtime.email) {
          map[APP_STATE.runtime.email.toLowerCase()] = data.role;
          APP_STATE.workspaceRoles[APP_STATE.currentWorkspaceId] = map;
        }
        updateWorkspaceActionsVisibility();
        renderViewTabs();
      }

      if (data.state && Array.isArray(data.state.tasks)) {
        APP_STATE.tasks = data.state.tasks;
        APP_STATE.columns = Array.isArray(data.state.columns) && data.state.columns.length
          ? data.state.columns
          : DEFAULT_COLUMNS.slice();
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      } else {
        APP_STATE.columns = APP_STATE.columns.length ? APP_STATE.columns : DEFAULT_COLUMNS.slice();
      }
      setSyncStatus("ok");
    } catch (err) {
      console.warn("[app] loadRemote error", err);
      setSyncStatus("error");
    }
  }

  let pushTimer = null;
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, 500);
  }

  async function pushState() {
    if (!APP_STATE.runtime.locationId || !APP_STATE.currentWorkspaceId) return;
    try {
      setSyncStatus("syncing");
      const resp = await fetch(REMOTE_SYNC_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: APP_STATE.runtime.locationId,
          workspaceId: APP_STATE.currentWorkspaceId,
          userEmail: APP_STATE.runtime.email || null,
          state: { tasks: APP_STATE.tasks, columns: APP_STATE.columns },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] pushState failed", resp.status, data);
        setSyncStatus("error");
        return;
      }
      if (data.role && APP_STATE.currentWorkspaceId && APP_STATE.runtime.email) {
        const map = APP_STATE.workspaceRoles[APP_STATE.currentWorkspaceId] || {};
        map[APP_STATE.runtime.email.toLowerCase()] = data.role;
        APP_STATE.workspaceRoles[APP_STATE.currentWorkspaceId] = map;
        updateWorkspaceActionsVisibility();
        renderViewTabs();
      }
      if (data.state && Array.isArray(data.state.tasks)) {
        APP_STATE.tasks = data.state.tasks;
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      }
      setSyncStatus("ok");
    } catch (err) {
      console.warn("[app] pushState error", err);
      setSyncStatus("error");
    }
  }

  // -------- 5. View tabs --------
  function renderViewTabs() {
    const tabs = document.getElementById("gt-view-tabs");
    if (!tabs) return;

    const showDashboard = canViewDashboard();

    let html = `
      <button class="gt-view-tab" data-view="table">Table</button>
      <button class="gt-view-tab" data-view="board">Card</button>
    `;
    if (showDashboard) {
      html += `<button class="gt-view-tab" data-view="dashboard">Dashboard</button>`;
    }

    tabs.innerHTML = html;

    tabs.querySelectorAll(".gt-view-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        setActiveView(view);
      });
    });

    // Ensure current view is marked active
    setActiveView(APP_STATE.currentView || "table", { skipRender: true });
  }

  function setActiveView(view, options = {}) {
    APP_STATE.currentView = view;

    const tabs = document.querySelectorAll(".gt-view-tab");
    tabs.forEach((btn) => {
      const v = btn.getAttribute("data-view");
      btn.classList.toggle("gt-view-tab-active", v === view);
    });

    const tableEl = document.getElementById("gt-view-table");
    const boardEl = document.getElementById("gt-view-board");
    const dashEl = document.getElementById("gt-view-dashboard");

    if (tableEl && boardEl && dashEl) {
      tableEl.classList.toggle("is-hidden", view !== "table");
      boardEl.classList.toggle("is-hidden", view !== "board");
      dashEl.classList.toggle("is-hidden", view !== "dashboard");
    }

    if (options.skipRender) return;

    if (view === "table") {
      renderTasks();
    } else if (view === "board") {
      renderBoardView();
    } else if (view === "dashboard" && canViewDashboard()) {
      renderDashboardView();
    }
  }

  // -------- Workspace chooser --------
  function openWorkspaceChooser() {
    const page = document.getElementById("gt-workspace-chooser-page");
    const main = document.getElementById("gt-main");
    if (!page || !main) return;
    UI_STATE.chooserOpen = true;

    const canCreate = getCurrentUserRole() === "admin";
    const filtered = APP_STATE.workspaces;

    const items = filtered
      .map((ws) => {
        const iconVal = ws.icon_url || "";
        const isUrl = iconVal.startsWith("http://") || iconVal.startsWith("https://");
        const iconHtml = iconVal
          ? isUrl
            ? `<img src="${iconVal}" alt="icon" />`
            : `<span class="gt-workspace-picker-emoji">${iconVal}</span>`
          : "📋";

        return `
          <div class="gt-workspace-picker-item" data-id="${ws.id}">
            <div class="gt-workspace-picker-meta">
              <div class="gt-workspace-picker-icon">${iconHtml}</div>
              <div>
                <div class="gt-workspace-picker-name">${ws.name}</div>
                <div class="gt-workspace-picker-sub">Workspace</div>
              </div>
              ${canCreate ? '<button class="gt-workspace-picker-gear" title="Settings">⚙</button>' : ""}
            </div>
          </div>
        `;
      })
      .join("") || "<div class='gt-muted'>No workspaces</div>";

    page.innerHTML = `
      <div class="gt-chooser-shell">
        <div class="gt-chooser-header">
          <div>
            <div class="gt-modal-title">Select a workspace</div>
            <div class="gt-modal-sub">Workspaces available to you</div>
          </div>
          ${canCreate ? '<button id="gt-chooser-create" class="gt-button gt-button-primary">+ New Workspace</button>' : ""}
        </div>
        <div class="gt-workspace-picker-list">${items}</div>
      </div>
    `;

    page.classList.remove("is-hidden");
    main.classList.add("is-hidden");

    page.querySelectorAll(".gt-workspace-picker-item").forEach((el) => {
      el.onclick = () => {
        const id = el.getAttribute("data-id");
        selectWorkspace(id);
        closeWorkspaceChooser();
      };
      const gear = el.querySelector(".gt-workspace-picker-gear");
      if (gear) {
        gear.onclick = (e) => {
          e.stopPropagation();
          const id = el.getAttribute("data-id");
          openWorkspaceSettings(id);
        };
      }
    });

    const createBtn = document.getElementById("gt-chooser-create");
    if (createBtn) {
      createBtn.onclick = () => {
        createWorkspaceFlow();
      };
    }
  }

  function closeWorkspaceChooser() {
    const page = document.getElementById("gt-workspace-chooser-page");
    const main = document.getElementById("gt-main");
    if (!page || !main) return;
    page.classList.add("is-hidden");
    page.innerHTML = "";
    main.classList.remove("is-hidden");
    UI_STATE.chooserOpen = false;
  }

  // -------- 6. Workspace shell visibility --------
  function updateWorkspaceShellVisibility() {
    const noWs = document.getElementById("gt-no-workspace");
    const shell = document.getElementById("gt-tasks-shell");
    const hasWs = !!APP_STATE.currentWorkspaceId;

    if (noWs) {
      noWs.style.display = hasWs ? "none" : "flex";
    }
    if (shell) {
      shell.style.display = hasWs ? "flex" : "none";
      if (hasWs) {
        shell.style.flexDirection = "column";
      }
    }
  }

  // -------- 7. UI helpers --------
  function updateHeaderUI() {
    const locEl = document.getElementById("gt-location-name");
    const userEl = document.getElementById("gt-user-name");
    if (!locEl || !userEl) return;

    const locName =
      APP_STATE.location?.name ||
      (APP_STATE.runtime.locationId ? "Subaccount" : "Unknown subaccount");

    // HIDE RAW location ID – only show friendly name
    locEl.textContent = locName;

    userEl.textContent =
      APP_STATE.runtime.name ||
      APP_STATE.runtime.email ||
      "Unknown user";
  }

  function showToast(message, type = "success") {
    const stack = document.getElementById("gt-toast-stack");
    if (!stack) return;
    const toast = document.createElement("div");
    toast.className = `gt-toast gt-toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    // small stagger for transitions
    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        stack.removeChild(toast);
      }, 250);
    }, 2400);
  }

  function renderWorkspaceSelect() {
    // no-op stub (sidebar removed)
  }

  function selectWorkspace(workspaceId) {
    APP_STATE.currentWorkspaceId = workspaceId;
    APP_STATE.tasks = [];
    renderViewTabs();
    updateWorkspaceActionsVisibility();
    updateWorkspaceShellVisibility();
    renderWorkspaceSelect();
    renderTasks();
    renderBoardView();
    if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
      renderDashboardView();
    }
    if (workspaceId) {
      fetchWorkspaceRoles(workspaceId);
      loadRemote();
    }
  }

  function updateWorkspaceActionsVisibility() {
    const createBtn = document.getElementById("gt-create-workspace");
    const switchBtn = document.getElementById("gt-switch-workspace");
    if (createBtn) {
      createBtn.style.display = getCurrentUserRole() === "admin" ? "inline-flex" : "none";
    }
    if (switchBtn) {
      switchBtn.style.display = APP_STATE.workspaces.length ? "inline-flex" : "none";
    }
  }

  function renderWorkspaceSettingsContent(ws) {
    const modal = document.getElementById("gt-workspace-settings-modal");
    if (!modal) return;

    const roles = APP_STATE.workspaceRoles[ws.id] || {};
    const staff = APP_STATE.staff || [];

    const iconVal = ws.icon_url || "";
    const emojiChoices = [
      "🔮",
      "📋",
      "✅",
      "📊",
      "🚀",
      "🛠️",
      "🧠",
      "🎯",
      "📌",
      "📦",
      "📈",
      "🧩",
      "🗂️",
      "🧾",
      "🏗️",
      "🛰️",
      "⚡",
      "🌟",
      "🏁",
      "🧭",
    ];
    const emojiOptions = [
      `<option value="">Select an emoji</option>`,
      ...emojiChoices.map((e) =>
        `<option value="${e}" ${iconVal === e ? "selected" : ""}>${e}</option>`
      ),
      `<option value="custom">Custom…</option>`,
    ].join("");

    const rows = staff.map((u) => {
      const current = roles[u.email.toLowerCase()] || "none";
      return `
        <div class="gt-role-row">
          <div>
            <div class="gt-role-name">${u.name}</div>
            <div class="gt-role-email">${u.email}</div>
          </div>
          <select class="gt-select gt-role-select" data-email="${u.email}">
            <option value="none">No access</option>
            <option value="admin" ${current === "admin" ? "selected" : ""}>Admin</option>
            <option value="manager" ${current === "manager" ? "selected" : ""}>Manager</option>
            <option value="member" ${current === "member" ? "selected" : ""}>Member</option>
          </select>
        </div>
      `;
    });

    modal.innerHTML = `
      <div class="gt-modal-backdrop" data-close="1"></div>
      <div class="gt-modal-card">
        <div class="gt-modal-header">
          <div>
            <div class="gt-modal-title">Workspace settings</div>
            <div class="gt-modal-sub">${ws.name}</div>
          </div>
          <button class="gt-button" id="gt-modal-close">✕</button>
        </div>
        <div class="gt-modal-section">
          <div class="gt-modal-label">Workspace name</div>
          <div class="gt-role-form">
            <input id="gt-ws-name" class="gt-input" type="text" value="${ws.name}" />
            <button id="gt-ws-rename" class="gt-button gt-button-primary">Rename</button>
          </div>
        </div>

        <div class="gt-modal-section">
          <div class="gt-modal-label">Icon</div>
          <div class="gt-modal-help">Pick from the list or paste any emoji.</div>
          <div class="gt-role-form">
            <span id="gt-icon-preview" class="gt-icon-preview">${iconVal || "📋"}</span>
            <select id="gt-emoji-select" class="gt-select">${emojiOptions}</select>
            <button id="gt-icon-save" class="gt-button gt-button-primary">Save Icon</button>
          </div>
        </div>
        <div class="gt-modal-section">
          <div class="gt-modal-label">Roles & access</div>
          <div class="gt-modal-help">Right-click a workspace to open settings. Changes save instantly.</div>
          <div class="gt-role-list">${rows.join("") || "<div class='gt-muted'>No staff loaded</div>"}</div>
        </div>
      </div>
    `;

    const closeBtn = document.getElementById("gt-modal-close");
    if (closeBtn) closeBtn.onclick = closeWorkspaceSettings;

    modal.querySelectorAll(".gt-modal-backdrop").forEach((b) => {
      b.onclick = closeWorkspaceSettings;
    });

    modal.querySelectorAll(".gt-role-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const email = sel.getAttribute("data-email");
        const role = sel.value;
        await saveWorkspaceRole(ws.id, email, role);
        renderWorkspaceSettingsContent(ws);
      });
    });

    const iconSave = document.getElementById("gt-icon-save");
    const iconPreview = document.getElementById("gt-icon-preview");
    const emojiSelect = document.getElementById("gt-emoji-select");
    const renameBtn = document.getElementById("gt-ws-rename");
    const nameInput = document.getElementById("gt-ws-name");

    let currentIcon = iconVal || "";

    const setPreview = (val) => {
      if (iconPreview) {
        iconPreview.textContent = val || "📋";
      }
    };
    setPreview(iconVal);

    if (iconSave) {
      iconSave.onclick = async () => {
        const val = currentIcon ? currentIcon.trim() : null;
        const updated = await patchWorkspace(ws.id, { iconUrl: val });
        if (updated) showToast("Workspace icon saved", "success");
      };
    }

    if (renameBtn && nameInput) {
      renameBtn.onclick = async () => {
        const newName = nameInput.value.trim();
        if (!newName) {
          showToast("Name is required", "error");
          return;
        }
        const updated = await patchWorkspace(ws.id, { name: newName });
        if (updated) showToast("Workspace renamed", "success");
      };
    }

    if (emojiSelect) {
      emojiSelect.onchange = () => {
        const choice = emojiSelect.value;
        if (choice) {
          currentIcon = choice;
          setPreview(choice);
        } else {
          currentIcon = "";
          setPreview("");
        }
      };
    }
  }

  async function saveWorkspaceRole(workspaceId, email, role) {
    if (!workspaceId || !APP_STATE.runtime.locationId || !email) return;
    if (role === "none") {
      try {
        const url = `${WORKSPACE_ROLES_API}?locationId=${encodeURIComponent(
          APP_STATE.runtime.locationId
        )}&workspaceId=${encodeURIComponent(workspaceId)}&userEmail=${encodeURIComponent(email)}`;
        const resp = await fetch(url, { method: "DELETE" });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          console.warn("[app] delete role failed", resp.status, data);
            showToast("Failed to remove role", "error");
          return;
        }
        const map = APP_STATE.workspaceRoles[workspaceId] || {};
        delete map[email.toLowerCase()];
        APP_STATE.workspaceRoles[workspaceId] = map;
      } catch (err) {
        console.warn("[app] delete role error", err);
          showToast("Unexpected error removing role", "error");
      }
      return;
    }

    try {
      const resp = await fetch(WORKSPACE_ROLES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: APP_STATE.runtime.locationId,
          workspaceId,
          userEmail: email,
          role,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        console.warn("[app] save role failed", resp.status, data);
        showToast("Failed to save role", "error");
        return;
      }
      const map = APP_STATE.workspaceRoles[workspaceId] || {};
      map[email.toLowerCase()] = role;
      APP_STATE.workspaceRoles[workspaceId] = map;
      showToast("Role updated", "success");
    } catch (err) {
      console.warn("[app] save role error", err);
      showToast("Unexpected error saving role", "error");
    }
  }

  async function patchWorkspace(id, payload) {
    if (!id) {
      showToast("No workspace selected to update.", "error");
      return null;
    }
    const cleanPayload = {};
    if (Object.prototype.hasOwnProperty.call(payload, "name")) {
      cleanPayload.name = payload.name === undefined ? null : payload.name;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "iconUrl")) {
      cleanPayload.iconUrl = payload.iconUrl === undefined ? null : payload.iconUrl;
    }
    try {
      const resp = await fetch(`${WORKSPACES_API}?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanPayload),
      });
      const respClone = resp.clone();
      let data;
      try {
        data = await resp.json();
      } catch (parseErr) {
        let text = "";
        try {
          text = await respClone.text();
        } catch (tErr) {
          text = `(unreadable response: ${tErr})`;
        }
        console.warn("[app] patch workspace parse error", parseErr, text);
        showToast(`Failed to update workspace (bad response). ${text}`, "error");
        return null;
      }
      if (!resp.ok || !data.ok) {
        const detail = data?.detail || data?.error || `HTTP ${resp.status}`;
        console.warn("[app] patch workspace failed", resp.status, data);
        showToast(`Failed to update workspace: ${detail}`, "error");
        return null;
      }
      APP_STATE.workspaces = APP_STATE.workspaces.map((w) =>
        w.id === id ? { ...w, ...data.workspace } : w
      );
      if (UI_STATE.chooserOpen) {
        openWorkspaceChooser();
      }
      renderWorkspaceSettingsContent(APP_STATE.workspaces.find((w) => w.id === id));
      renderWorkspaceSelect();
      showToast("Workspace updated", "success");
      return data.workspace;
    } catch (err) {
      console.warn("[app] patch workspace error", err);
      const msg = err?.message || String(err) || "Unknown error";
      showToast(`Unexpected error updating workspace: ${msg}`, "error");
      return null;
    }
  }

  async function openWorkspaceSettings(workspaceId) {
    const modal = document.getElementById("gt-workspace-settings-modal");
    if (!modal) return;
    const ws = APP_STATE.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    if (getCurrentUserRole() !== "admin") return;

    // ensure staff and roles are loaded
    if (!APP_STATE.staff.length) {
      await fetchStaffBackend();
    }
    await fetchWorkspaceRoles(workspaceId);

    renderWorkspaceSettingsContent(ws);
    modal.classList.remove("is-hidden");
  }

  function closeWorkspaceSettings() {
    const modal = document.getElementById("gt-workspace-settings-modal");
    if (modal) {
      modal.classList.add("is-hidden");
      modal.innerHTML = "";
    }
  }

  // -------- Field manager (custom columns) --------
  function openFieldsModal() {
    const modal = document.getElementById("gt-fields-modal");
    if (!modal) return;
    renderFieldsModal();
    modal.classList.remove("is-hidden");
  }

  function closeFieldsModal() {
    const modal = document.getElementById("gt-fields-modal");
    if (modal) {
      modal.classList.add("is-hidden");
      modal.innerHTML = "";
    }
  }

  function persistColumns() {
    pushState();
    renderTasks();
    renderBoardView();
  }

  function moveField(id, delta) {
    const cols = APP_STATE.columns || [];
    const idx = cols.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const target = idx + delta;
    if (target < 0 || target >= cols.length) return;
    const copy = cols.slice();
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    APP_STATE.columns = copy;
    persistColumns();
    renderFieldsModal();
  }

  function addField(label, type) {
    const trimmed = (label || "").trim();
    if (!trimmed) return showToast("Field name required", "error");
    const col = {
      id: `fld_${Math.random().toString(36).slice(2, 7)}`,
      label: trimmed,
      type,
      options: type === "single_select" || type === "multi_select"
        ? [
            { id: "opt1", label: "Option 1", color: "blue" },
            { id: "opt2", label: "Option 2", color: "green" },
          ]
        : undefined,
    };
    APP_STATE.columns = [...(APP_STATE.columns || []), col];
    persistColumns();
    renderFieldsModal();
    showToast("Field added", "success");
  }

  function renameField(id, newLabel) {
    const col = (APP_STATE.columns || []).find((c) => c.id === id);
    if (!col || col.locked) return;
    col.label = newLabel.trim();
    persistColumns();
    renderFieldsModal();
    showToast("Field renamed", "success");
  }

  function deleteField(id) {
    const col = (APP_STATE.columns || []).find((c) => c.id === id);
    if (!col || col.locked) return;
    APP_STATE.columns = APP_STATE.columns.filter((c) => c.id !== id);
    // Remove values from tasks
    APP_STATE.tasks = APP_STATE.tasks.map((t) => {
      if (!t.fields) return t;
      const nf = { ...t.fields };
      delete nf[id];
      return { ...t, fields: nf };
    });
    persistColumns();
    renderFieldsModal();
    showToast("Field deleted", "success");
  }

  function updateSelectOptions(colId, labels) {
    const col = (APP_STATE.columns || []).find((c) => c.id === colId);
    if (!col) return;
    const parts = labels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    col.options = parts.map((label, idx) => ({
      id: `opt_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      label,
      color: OPTION_COLORS[idx % OPTION_COLORS.length],
    }));
    persistColumns();
    renderFieldsModal();
    showToast("Options updated", "success");
  }

  function renderFieldsModal() {
    const modal = document.getElementById("gt-fields-modal");
    if (!modal) return;
    const cols = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns
      : DEFAULT_COLUMNS;

    const listHtml = cols
      .map((c) => {
        const isSelect = c.type === "single_select" || c.type === "multi_select";
        const optionsText = isSelect && Array.isArray(c.options)
          ? c.options.map((o) => o.label).join(", ") || "None"
          : "";
        return `
          <div class="gt-field-row" data-id="${c.id}">
            <div>
              <div class="gt-field-name">${c.label}${c.locked ? " (locked)" : ""}</div>
              <div class="gt-field-meta">${c.type}${isSelect ? ` · ${optionsText}` : ""}</div>
              ${
                isSelect
                  ? `<div class="gt-field-options-edit" data-id="${c.id}">
                      <input class="gt-input gt-field-options-input" type="text" placeholder="Comma separated options" value="${optionsText}" />
                      <button class="gt-button gt-button-small gt-field-options-save">Save options</button>
                    </div>`
                  : ""
              }
            </div>
            <div class="gt-field-actions">
              ${
                c.locked
                  ? ""
                  : `<button class="gt-button gt-button-small gt-field-rename">Rename</button>
                     <button class="gt-button gt-button-small" data-move="up">↑</button>
                     <button class="gt-button gt-button-small" data-move="down">↓</button>
                     <button class="gt-button gt-button-danger gt-button-small gt-field-delete">Delete</button>`
              }
            </div>
          </div>
        `;
      })
      .join("") || "<div class='gt-muted'>No fields</div>";

    const typeOptions = FIELD_TYPES.map(
      (t) => `<option value="${t.value}">${t.label}</option>`
    ).join("");

    modal.innerHTML = `
      <div class="gt-modal-backdrop" data-close="1"></div>
      <div class="gt-modal-card gt-modal-card-large">
        <div class="gt-modal-header">
          <div>
            <div class="gt-modal-title">Fields</div>
            <div class="gt-modal-sub">Customize task columns for this workspace</div>
          </div>
          <button class="gt-button" id="gt-fields-close">✕</button>
        </div>

        <div class="gt-modal-section">
          <div class="gt-field-list">${listHtml}</div>
        </div>

        <div class="gt-modal-section">
          <div class="gt-modal-label">Add field</div>
          <div class="gt-role-form">
            <input id="gt-field-name" class="gt-input" type="text" placeholder="Field name" />
            <select id="gt-field-type" class="gt-select">${typeOptions}</select>
            <button id="gt-field-add" class="gt-button gt-button-primary">Add field</button>
          </div>
          <div class="gt-modal-help">Select types support options editing after creation.</div>
        </div>
      </div>
    `;

    modal.querySelectorAll(".gt-modal-backdrop").forEach((b) => {
      b.onclick = closeFieldsModal;
    });
    const closeBtn = document.getElementById("gt-fields-close");
    if (closeBtn) closeBtn.onclick = closeFieldsModal;

    const addBtn = document.getElementById("gt-field-add");
    const nameInput = document.getElementById("gt-field-name");
    const typeSelect = document.getElementById("gt-field-type");
    if (addBtn && nameInput && typeSelect) {
      addBtn.onclick = () => {
        addField(nameInput.value, typeSelect.value);
        nameInput.value = "";
        nameInput.focus();
      };
    }

    modal.querySelectorAll(".gt-field-rename").forEach((btn) => {
      btn.onclick = () => {
        const row = btn.closest(".gt-field-row");
        const id = row?.getAttribute("data-id");
        const current = (APP_STATE.columns || []).find((c) => c.id === id);
        const value = prompt("New field name", current?.label || "");
        if (value && value.trim()) renameField(id, value);
      };
    });

    modal.querySelectorAll(".gt-field-options-save").forEach((btn) => {
      btn.onclick = () => {
        const wrap = btn.closest(".gt-field-options-edit");
        const id = wrap?.getAttribute("data-id");
        const input = wrap?.querySelector(".gt-field-options-input");
        updateSelectOptions(id, input?.value || "");
      };
    });

    modal.querySelectorAll(".gt-field-delete").forEach((btn) => {
      btn.onclick = () => {
        const row = btn.closest(".gt-field-row");
        const id = row?.getAttribute("data-id");
        if (confirm("Delete this field?")) deleteField(id);
      };
    });

    modal.querySelectorAll("[data-move]").forEach((btn) => {
      btn.onclick = () => {
        const row = btn.closest(".gt-field-row");
        const id = row?.getAttribute("data-id");
        const dir = btn.getAttribute("data-move") === "up" ? -1 : 1;
        moveField(id, dir);
      };
    });
  }


  // Assignee filter removed from UI for now; filtering uses full list

  function getFilteredTasks() {
    const assignee = APP_STATE.filters.assigneeEmail;
    let list = APP_STATE.tasks.slice();
    if (assignee) {
      list = list.filter(
        (t) => (t.assigneeEmail || "") === assignee
      );
    }
    return list;
  }

  function formatDateTimeShort(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const date = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const time = d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${date} ${time}`;
    } catch {
      return iso;
    }
  }

  // -------- 8. TABLE VIEW --------
  function renderTasks() {
    const tbody = document.getElementById("gt-task-tbody");
    const theadRow = document.querySelector("#gt-view-table thead tr");
    if (!tbody || !theadRow) return;

    const columns = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns
      : DEFAULT_COLUMNS;

    // Build header
    theadRow.innerHTML = columns.map((c) => `<th>${c.label}</th>`).join("") + `<th></th>`;

    tbody.innerHTML = "";

    const rows = getFilteredTasks();

    const normalizeAttachments = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        return val
          .split(/\n|,/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    };

    const getValue = (task, col) => {
      if (col.id === "title") return task.title || "";
      if (col.id === "status") return task.status || "todo";
      if (col.id === "assignee") return task.assigneeEmail || "";
      if (col.id === "updatedAt") return task.updatedAt || null;
      const fields = task.fields || {};
      return fields[col.id];
    };

    const setValue = (task, col, val) => {
      if (col.id === "title") {
        task.title = val;
        return;
      }
      if (col.id === "status") {
        task.status = val;
        return;
      }
      if (col.id === "assignee") {
        task.assigneeEmail = val || null;
        return;
      }
      if (col.id === "updatedAt") return;
      task.fields = task.fields || {};
      task.fields[col.id] = val;
    };

    const renderSelectOptions = (col) => {
      const opts = Array.isArray(col.options) ? col.options : [];
      return opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    };

    rows.forEach((task) => {
      const tr = document.createElement("tr");

      columns.forEach((col) => {
        const td = document.createElement("td");
        const current = getValue(task, col);

        if (col.id === "updatedAt") {
          td.innerHTML = `<span class="gt-tiny">${formatDateTimeShort(current)}</span>`;
          tr.appendChild(td);
          return;
        }

        switch (col.type) {
          case "text": {
            const inp = document.createElement("input");
            inp.className = "gt-task-title-input";
            inp.value = current || "";
            inp.onchange = () => {
              setValue(task, col, inp.value);
              touch(task);
              renderBoardView();
              if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
                renderDashboardView();
              }
            };
            td.appendChild(inp);
            break;
          }
          case "long_text": {
            const ta = document.createElement("textarea");
            ta.className = "gt-textarea";
            ta.value = current || "";
            ta.onchange = () => {
              setValue(task, col, ta.value);
              touch(task);
            };
            td.appendChild(ta);
            break;
          }
          case "checkbox": {
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!current;
            cb.onchange = () => {
              setValue(task, col, cb.checked);
              touch(task);
            };
            td.appendChild(cb);
            break;
          }
          case "single_select": {
            const sel = document.createElement("select");
            sel.innerHTML = `<option value="">Select…</option>` + renderSelectOptions(col);
            sel.value = current || "";
            sel.onchange = () => {
              setValue(task, col, sel.value || null);
              touch(task);
              renderBoardView();
            };
            td.appendChild(sel);
            break;
          }
          case "multi_select": {
            const sel = document.createElement("select");
            sel.multiple = true;
            sel.size = 3;
            sel.innerHTML = renderSelectOptions(col);
            const selected = Array.isArray(current) ? current : [];
            Array.from(sel.options).forEach((o) => {
              o.selected = selected.includes(o.value);
            });
            sel.onchange = () => {
              const vals = Array.from(sel.selectedOptions).map((o) => o.value);
              setValue(task, col, vals);
              touch(task);
            };
            td.appendChild(sel);
            break;
          }
          case "user": {
            const sel = document.createElement("select");
            const optNone = document.createElement("option");
            optNone.value = "";
            optNone.textContent = "Unassigned";
            sel.appendChild(optNone);
            APP_STATE.staff.forEach((u) => {
              const o = document.createElement("option");
              o.value = u.email;
              o.textContent = u.name;
              sel.appendChild(o);
            });
            sel.value = current || "";
            sel.onchange = () => {
              setValue(task, col, sel.value || null);
              touch(task);
            };
            td.appendChild(sel);
            break;
          }
          case "date": {
            const inp = document.createElement("input");
            inp.type = "date";
            inp.value = current ? current.slice(0, 10) : "";
            inp.onchange = () => {
              setValue(task, col, inp.value || null);
              touch(task);
            };
            td.appendChild(inp);
            break;
          }
          case "number": {
            const inp = document.createElement("input");
            inp.type = "number";
            inp.value = current ?? "";
            inp.onchange = () => {
              setValue(task, col, inp.value === "" ? null : Number(inp.value));
              touch(task);
            };
            td.appendChild(inp);
            break;
          }
          case "attachment": {
            const wrap = document.createElement("div");
            wrap.className = "gt-attachments-cell";

            const list = document.createElement("div");
            list.className = "gt-attachments-list";
            const items = normalizeAttachments(current);
            items.forEach((url, idx) => {
              const row = document.createElement("div");
              row.className = "gt-attachment-row";
              const link = document.createElement("a");
              link.href = url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = url;
              const remove = document.createElement("button");
              remove.className = "gt-button gt-button-small gt-button-danger";
              remove.textContent = "Remove";
              remove.onclick = () => {
                const next = items.filter((_, i) => i !== idx);
                setValue(task, col, next);
                touch(task);
                renderTasks();
              };
              row.appendChild(link);
              row.appendChild(remove);
              list.appendChild(row);
            });

            const addRow = document.createElement("div");
            addRow.className = "gt-attachments-add";
            const inp = document.createElement("input");
            inp.type = "url";
            inp.placeholder = "Paste a link";
            inp.value = "";
            const addBtn = document.createElement("button");
            addBtn.className = "gt-button gt-button-small";
            addBtn.textContent = "Add";
            addBtn.onclick = () => {
              const val = inp.value.trim();
              if (!val) return;
              const next = [...items, val];
              setValue(task, col, next);
              touch(task);
              inp.value = "";
              renderTasks();
            };
            addRow.appendChild(inp);
            addRow.appendChild(addBtn);

            wrap.appendChild(list);
            wrap.appendChild(addRow);
            td.appendChild(wrap);
            break;
          }
          default: {
            const inp = document.createElement("input");
            inp.className = "gt-task-title-input";
            inp.value = current || "";
            inp.onchange = () => {
              setValue(task, col, inp.value);
              touch(task);
            };
            td.appendChild(inp);
          }
        }

        tr.appendChild(td);
      });

      const tdDel = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "gt-button gt-button-danger";
      btn.textContent = "Delete";
      btn.onclick = () => {
        APP_STATE.tasks = APP_STATE.tasks.filter((t) => t.id !== task.id);
        schedulePush();
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      };
      tdDel.appendChild(btn);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });
  }

  // -------- 9. BOARD VIEW (Kanban) --------
  function renderBoardView() {
    const root = document.getElementById("gt-board-root");
    if (!root) return;

    const tasks = getFilteredTasks();
    const statusCol = (APP_STATE.columns || []).find((c) => c.id === "status");
    const statusOptions = statusCol && Array.isArray(statusCol.options) && statusCol.options.length
      ? statusCol.options.map((o) => ({ id: o.id, label: o.label }))
      : [
          { id: "todo", label: "To Do" },
          { id: "in_progress", label: "In Progress" },
          { id: "done", label: "Done" },
        ];
    const columns = statusOptions;

    root.innerHTML = "";

    columns.forEach((col) => {
      const colTasks = tasks.filter((t) => (t.status || "todo") === col.id);

      const colEl = document.createElement("div");
      colEl.className = "gt-board-column";
      colEl.dataset.status = col.id;

      const header = document.createElement("div");
      header.className = "gt-board-column-header";
      header.innerHTML = `
        <span class="gt-board-column-title">${col.label}</span>
        <span class="gt-board-count">${colTasks.length}</span>
      `;

      const body = document.createElement("div");
      body.className = "gt-board-column-body";
      body.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      body.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!draggedTaskId) return;
        const task = APP_STATE.tasks.find((t) => t.id === draggedTaskId);
        if (!task) return;
        const oldStatus = task.status || "todo";
        const newStatus = col.id;
        task.status = newStatus;

        if (newStatus === "done" && !task.completedAt) {
          task.completedAt = new Date().toISOString();
        } else if (oldStatus === "done" && newStatus !== "done") {
          task.completedAt = null;
        }

        touch(task);
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      });

      colTasks.forEach((task) => {
        const card = document.createElement("div");
        card.className = "gt-card";
        card.draggable = true;
        card.dataset.taskId = task.id;

        card.addEventListener("dragstart", () => {
          draggedTaskId = task.id;
        });
        card.addEventListener("dragend", () => {
          draggedTaskId = null;
        });

        const assignee =
          APP_STATE.staff.find((u) => u.email === task.assigneeEmail)?.name ||
          "Unassigned";

        card.innerHTML = `
          <div class="gt-card-title">${task.title || "Untitled"}</div>
          <div class="gt-card-meta">
            ${assignee} · <span class="gt-tiny">${formatDateTimeShort(
          task.updatedAt
        )}</span>
          </div>
        `;

        body.appendChild(card);
      });

      colEl.appendChild(header);
      colEl.appendChild(body);
      root.appendChild(colEl);
    });
  }

  // -------- 10. DASHBOARD VIEW --------
  function getDashboardData(records) {
    const assignedByDay = {};
    const completedByDay = {};

    const normalizeDate = (iso) => (iso ? iso.slice(0, 10) : null);

    for (const r of records) {
      const assignee = r.assigneeEmail || "Unassigned";

      if (r.createdAt) {
        const day = normalizeDate(r.createdAt);
        if (day) {
          assignedByDay[day] = assignedByDay[day] || {};
          assignedByDay[day][assignee] =
            (assignedByDay[day][assignee] || 0) + 1;
        }
      }

      if (r.completedAt) {
        const day = normalizeDate(r.completedAt);
        if (day) {
          completedByDay[day] = completedByDay[day] || {};
          completedByDay[day][assignee] =
            (completedByDay[day][assignee] || 0) + 1;
        }
      }
    }

    return { assignedByDay, completedByDay };
  }

  function renderDashboardView() {
    const root = document.getElementById("gt-dashboard-root");
    if (!root) return;

    const records = APP_STATE.tasks.slice(); // use all tasks, not filtered
    const { assignedByDay, completedByDay } = getDashboardData(records);

    const assignedHtml = buildDashboardTableHtml(assignedByDay);
    const completedHtml = buildDashboardTableHtml(completedByDay);

    root.innerHTML = `
      <div class="gt-dashboard-section">
        <h3 class="gt-dashboard-title">Assigned per day · by assignee</h3>
        <p class="gt-dashboard-sub">
          Based on <code>createdAt</code> for each task.
        </p>
        ${assignedHtml}
      </div>

      <div class="gt-dashboard-section">
        <h3 class="gt-dashboard-title">Completed per day · by assignee</h3>
        <p class="gt-dashboard-sub">
          Based on <code>completedAt</code> when status is set to "Done".
        </p>
        ${completedHtml}
      </div>
    `;
  }

  function buildDashboardTableHtml(byDay) {
    const days = Object.keys(byDay).sort();
    if (!days.length) {
      return `<p class="gt-dashboard-sub">No data yet.</p>`;
    }

    // Collect all assignees across days
    const assigneesSet = new Set();
    days.forEach((day) => {
      Object.keys(byDay[day]).forEach((a) => assigneesSet.add(a));
    });
    const assignees = Array.from(assigneesSet).sort();

    let thead = `<tr><th>Date</th>`;
    assignees.forEach((a) => {
      thead += `<th>${a}</th>`;
    });
    thead += `</tr>`;

    let tbody = "";
    days.forEach((day) => {
      tbody += `<tr><td>${day}</td>`;
      assignees.forEach((a) => {
        const val = byDay[day][a] || 0;
        tbody += `<td>${val}</td>`;
      });
      tbody += `</tr>`;
    });

    return `
      <table class="gt-dashboard-table">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    `;
  }

  // -------- 11. Mutations --------
  function touch(task) {
    if (!task.createdAt) {
      task.createdAt = new Date().toISOString();
    }
    task.updatedAt = new Date().toISOString();
    schedulePush();
  }

  function addTask() {
    if (!APP_STATE.currentWorkspaceId) return;

    const now = new Date().toISOString();
    const task = {
      id: `t_${Math.random().toString(36).slice(2)}`,
      title: "New Task",
      status: "todo",
      assigneeEmail: APP_STATE.runtime.email || "",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    APP_STATE.tasks.push(task);
    schedulePush();
    renderTasks();
    renderBoardView();
    if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
      renderDashboardView();
    }
  }

  async function createWorkspaceFlow() {
    if (!APP_STATE.runtime.locationId) {
      showToast("Location is required before creating a workspace.", "error");
      return;
    }

    const name = prompt("Workspace name", "New Workspace");
    if (!name || !name.trim()) return;

    try {
      const resp = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: APP_STATE.runtime.locationId,
          name: name.trim(),
          createdBy: APP_STATE.runtime.email || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        showToast("Failed to create workspace", "error");
        console.warn("[app] create workspace failed", resp.status, data);
        return;
      }

      const ws = data.workspace;
      APP_STATE.workspaces.push(ws);
      renderWorkspaceSelect();
      selectWorkspace(ws.id);

      const sel = document.getElementById("gt-workspace-select");
      if (sel) sel.value = ws.id;
    } catch (err) {
      console.warn("[app] create workspace error", err);
      showToast("Unexpected error creating workspace", "error");
    }
  }

  // -------- 12. Init --------
  document.addEventListener("DOMContentLoaded", () => {
    buildLayout();
    updateHeaderUI();
    renderViewTabs();
    renderTasks();
    renderBoardView();
    updateWorkspaceShellVisibility();
    updateWorkspaceActionsVisibility();

    const addBtn = document.getElementById("gt-add-task");
    if (addBtn) addBtn.onclick = addTask;

    const createBtn = document.getElementById("gt-create-workspace");
    if (createBtn) {
      createBtn.onclick = () => {
        if (getCurrentUserRole() !== "admin") return;
        createWorkspaceFlow();
      };
    }

    const fieldsBtn = document.getElementById("gt-manage-fields");
    if (fieldsBtn) fieldsBtn.onclick = openFieldsModal;

    const switchBtn = document.getElementById("gt-switch-workspace");
    if (switchBtn) {
      switchBtn.onclick = openWorkspaceChooser;
    }

    // Staff fetch (gets users / assignees from GHL)
    fetchStaffBackend();

    // Workspaces fetch (once location is known)
    fetchWorkspaces();

    // Poll for remote changes every 5s (no-op until workspace selected)
    setInterval(loadRemote, 5000);

    console.log(
      "%cGenie Tracker Loaded (workspace-first)",
      "color:#4f46e5; font-weight:bold;"
    );
  });
})();
