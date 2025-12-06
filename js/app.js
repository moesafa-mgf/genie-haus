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
    filters: { assigneeEmail: "" },
    sync: { status: "idle", lastRemoteAt: null },
    instanceId: `client_${Math.random().toString(36).slice(2)}`,
  };

  const REMOTE_SYNC_API = "/api/workspace-state";
  const WORKSPACES_API = "/api/workspaces";
  const WORKSPACE_ROLES_API = "/api/workspace-roles";
  const GHL_USERS_API = "/api/ghl-users";

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

        <main class="gt-main">
          <section class="gt-panel">
            <div class="gt-panel-header">
              <h2>Tasks</h2>
              <div class="gt-panel-header-actions">
                <button id="gt-create-workspace" class="gt-button gt-button-primary" style="display:none;">
                  + New Workspace
                </button>
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
        <div id="gt-workspace-chooser" class="gt-modal is-hidden"></div>
      </div>
    `;
  }

  // -------- 1. Role helpers --------
  function getCurrentUserRole() {
    const email = APP_STATE.runtime.email || "";
    const wsId = APP_STATE.currentWorkspaceId;
    if (!email || !wsId) return "member";
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
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
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
          state: { tasks: APP_STATE.tasks },
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
    const modal = document.getElementById("gt-workspace-chooser");
    if (!modal) return;
    UI_STATE.chooserOpen = true;

    const canCreate = getCurrentUserRole() === "admin";
    const filtered = APP_STATE.workspaces;

    const items = filtered
      .map(
        (ws) => `
          <div class="gt-workspace-picker-item" data-id="${ws.id}">
            <div class="gt-workspace-picker-meta">
              <div class="gt-workspace-picker-icon">📋</div>
              <div>
                <div class="gt-workspace-picker-name">${ws.name}</div>
                <div class="gt-workspace-picker-sub">Workspace</div>
              </div>
              ${canCreate ? '<button class="gt-workspace-picker-gear" title="Settings">⚙</button>' : ""}
            </div>
          </div>
        `
      )
      .join("") || "<div class='gt-muted'>No workspaces</div>";

    modal.innerHTML = `
      <div class="gt-modal-backdrop"></div>
      <div class="gt-modal-card gt-modal-card-large">
        <div class="gt-modal-header">
          <div>
            <div class="gt-modal-title">Select a workspace</div>
            <div class="gt-modal-sub">Workspaces available to you</div>
          </div>
        </div>
        <div class="gt-workspace-picker-list">${items}</div>
        ${canCreate
          ? '<button id="gt-chooser-create" class="gt-button gt-button-primary" style="margin-top:12px;">+ New Workspace</button>'
          : ""}
      </div>
    `;

    modal.classList.remove("is-hidden");

    modal.querySelectorAll(".gt-workspace-picker-item").forEach((el) => {
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
        closeWorkspaceChooser();
        createWorkspaceFlow();
      };
    }
  }

  function closeWorkspaceChooser() {
    const modal = document.getElementById("gt-workspace-chooser");
    if (!modal) return;
    modal.classList.add("is-hidden");
    modal.innerHTML = "";
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
          alert("Failed to remove role");
          return;
        }
        const map = APP_STATE.workspaceRoles[workspaceId] || {};
        delete map[email.toLowerCase()];
        APP_STATE.workspaceRoles[workspaceId] = map;
      } catch (err) {
        console.warn("[app] delete role error", err);
        alert("Unexpected error removing role");
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
        alert("Failed to save role");
        return;
      }
      const map = APP_STATE.workspaceRoles[workspaceId] || {};
      map[email.toLowerCase()] = role;
      APP_STATE.workspaceRoles[workspaceId] = map;
    } catch (err) {
      console.warn("[app] save role error", err);
      alert("Unexpected error saving role");
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
    if (!tbody) return;

    tbody.innerHTML = "";

    const rows = getFilteredTasks();

    rows.forEach((task) => {
      const tr = document.createElement("tr");

      // Title
      const tdTitle = document.createElement("td");
      const inp = document.createElement("input");
      inp.className = "gt-task-title-input";
      inp.value = task.title || "";
      inp.onchange = () => {
        task.title = inp.value;
        touch(task);
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      };
      tdTitle.appendChild(inp);

      // Status
      const tdStatus = document.createElement("td");
      const selSt = document.createElement("select");
      ["todo", "in_progress", "done"].forEach((s) => {
        const o = document.createElement("option");
        o.value = s;
        o.textContent =
          s === "todo"
            ? "To Do"
            : s === "in_progress"
            ? "In Progress"
            : "Done";
        selSt.appendChild(o);
      });
      const prevStatus = task.status || "todo";
      selSt.value = prevStatus;
      selSt.onchange = () => {
        const newStatus = selSt.value;
        const oldStatus = task.status || "todo";
        task.status = newStatus;

        // completion timestamp
        if (newStatus === "done" && !task.completedAt) {
          task.completedAt = new Date().toISOString();
        } else if (oldStatus === "done" && newStatus !== "done") {
          task.completedAt = null;
        }

        touch(task);
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      };
      tdStatus.appendChild(selSt);

      // Assignee
      const tdAss = document.createElement("td");
      const selA = document.createElement("select");
      const optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = "Unassigned";
      selA.appendChild(optNone);
      APP_STATE.staff.forEach((u) => {
        const o = document.createElement("option");
        o.value = u.email;
        o.textContent = u.name;
        selA.appendChild(o);
      });
      selA.value = task.assigneeEmail || "";
      selA.onchange = () => {
        task.assigneeEmail = selA.value || null;
        touch(task);
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      };
      tdAss.appendChild(selA);

      // Updated
      const tdUpd = document.createElement("td");
      tdUpd.innerHTML = `<span class="gt-tiny">${formatDateTimeShort(
        task.updatedAt
      )}</span>`;

      // Delete
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

      tr.append(tdTitle, tdStatus, tdAss, tdUpd, tdDel);
      tbody.appendChild(tr);
    });
  }

  // -------- 9. BOARD VIEW (Kanban) --------
  function renderBoardView() {
    const root = document.getElementById("gt-board-root");
    if (!root) return;

    const tasks = getFilteredTasks();
    const columns = [
      { id: "todo", label: "To Do" },
      { id: "in_progress", label: "In Progress" },
      { id: "done", label: "Done" },
    ];

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
      alert("Location is required before creating a workspace.");
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
        alert("Failed to create workspace");
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
      alert("Unexpected error creating workspace");
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
