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
    currentMode: "data", // "data" | "dashboard"
    tasks: [],
    columns: [],
    activity: [],
    grids: [],
    currentGridId: null,
    workspaceFilters: {}, // workspaceId -> filters
    filters: {
      assigneeEmail: "",
      status: "",
      text: "",
      dateFrom: "",
      dateTo: "",
      groupBy: "",
    },
    sync: { status: "idle", lastRemoteAt: null },
    instanceId: `client_${Math.random().toString(36).slice(2)}`,
    userColors: {}, // workspaceId -> { emailLower: colorId }
  };

  const DEFAULT_COLUMNS = [
    { id: "title", label: "Title", type: "text", locked: false },
    {
      id: "status",
      label: "Status",
      type: "single_select",
      locked: false,
      options: [
        { id: "todo", label: "To Do", color: "gray" },
        { id: "in_progress", label: "In Progress", color: "blue" },
        { id: "done", label: "Done", color: "green" },
      ],
    },
    { id: "assignee", label: "Assignee", type: "user", locked: false },
    { id: "updatedAt", label: "Updated", type: "date", locked: false, readonly: true },
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
    { value: "autonumber", label: "Autonumber" },
    { value: "barcode", label: "Barcode" },
    { value: "button", label: "Button" },
    { value: "formula", label: "Formula" },
    { value: "rollup", label: "Rollup" },
    { value: "count", label: "Count" },
    { value: "lookup", label: "Lookup" },
    { value: "created_time", label: "Created time" },
    { value: "last_modified_time", label: "Last modified time" },
    { value: "created_by", label: "Created by" },
    { value: "last_modified_by", label: "Last modified by" },
  ];
  const OPTION_COLORS = ["gray", "blue", "green", "red", "yellow", "purple", "pink", "teal"];
  const COLOR_PALETTE = [
    { id: "ice", bg: "#e6edff", text: "#1d4ed8", border: "#d0dbff" },
    { id: "sky", bg: "#e0f2fe", text: "#0369a1", border: "#cbe5fb" },
    { id: "mint", bg: "#e0f7f4", text: "#0f766e", border: "#c8eee8" },
    { id: "sage", bg: "#e8f2e7", text: "#166534", border: "#d6e6d3" },
    { id: "sand", bg: "#f8f3e8", text: "#92400e", border: "#eddfc5" },
    { id: "blush", bg: "#fce8ef", text: "#9d174d", border: "#f6cfdd" },
    { id: "lilac", bg: "#f1e8ff", text: "#6d28d9", border: "#e2d4fb" },
    { id: "stone", bg: "#eef0f3", text: "#334155", border: "#dfe4ea" },
    { id: "blue", bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe" },
    { id: "cyan", bg: "#cffafe", text: "#0e7490", border: "#b6f0f7" },
    { id: "teal", bg: "#ccfbf1", text: "#0d9488", border: "#b2f3e6" },
    { id: "green", bg: "#dcfce7", text: "#15803d", border: "#c8f7d6" },
    { id: "amber", bg: "#fef3c7", text: "#b45309", border: "#f9e4a3" },
    { id: "peach", bg: "#ffe4e1", text: "#c2410c", border: "#f8c9bf" },
    { id: "rose", bg: "#ffe4e6", text: "#be123c", border: "#f8c6cf" },
    { id: "magenta", bg: "#fce7f3", text: "#be185d", border: "#f5c8e4" },
    { id: "purple", bg: "#ede9fe", text: "#7c3aed", border: "#dcd4fc" },
    { id: "plum", bg: "#f3e8ff", text: "#6b21a8", border: "#e3d1fb" },
    { id: "midnight", bg: "#e2e8f0", text: "#1e293b", border: "#cbd5e1" },
    { id: "navy", bg: "#dbeafe", text: "#1e3a8a", border: "#cbdaf8" },
    { id: "forest", bg: "#e7f3ec", text: "#065f46", border: "#d3e8dc" },
    { id: "gold", bg: "#fef9c3", text: "#854d0e", border: "#f6ee9f" },
    { id: "burnt", bg: "#fef2e2", text: "#9a3412", border: "#f8dfc4" },
    { id: "charcoal", bg: "#e5e7eb", text: "#111827", border: "#d1d5db" },
  ];

  const COLOR_META = COLOR_PALETTE.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});

  const UI_STATE = {
    chooserOpen: false,
  };

  let draggedTaskId = null;
  let openColumnMenuEl = null;
  let draggingColumnId = null;
  let contextMenuEl = null;
  let draggingRowId = null;

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
              <div class="gt-panel-header-left"><h2>Tasks</h2></div>
              <div class="gt-panel-header-middle">
                <div id="gt-mode-tabs" class="gt-mode-tabs"></div>
              </div>
              <div class="gt-panel-header-actions">
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
                <div id="gt-grid-tabs" class="gt-grid-tabs"></div>
                <div class="gt-view-tabs" id="gt-view-tabs">
                  <!-- view buttons injected by JS -->
                </div>

                <!-- TABLE VIEW -->
                <div id="gt-view-table" class="gt-view-section">
                  <div id="gt-filter-bar" class="gt-filter-bar"></div>
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

                <!-- ACTIVITY VIEW -->
                <div id="gt-view-activity" class="gt-view-section is-hidden">
                  <div id="gt-activity-root" class="gt-activity-feed"></div>
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
        <div id="gt-detail-drawer" class="gt-drawer is-hidden"></div>
        <div id="gt-field-editor-modal" class="gt-modal is-hidden"></div>
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
      renderModeTabs();
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
      renderFiltersBar();
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
          ? unlockColumns(data.state.columns)
          : unlockColumns(DEFAULT_COLUMNS.slice());
        APP_STATE.workspaceFilters = data.state.filters || APP_STATE.workspaceFilters || {};
        APP_STATE.activity = Array.isArray(data.state.activity) ? data.state.activity : (APP_STATE.activity || []);
        APP_STATE.grids = Array.isArray(data.state.grids) ? data.state.grids : [];
        APP_STATE.currentGridId = data.state.currentGridId || null;
        APP_STATE.userColors = data.state.userColors || APP_STATE.userColors || {};
        if (APP_STATE.currentWorkspaceId) {
          const saved = APP_STATE.workspaceFilters[APP_STATE.currentWorkspaceId];
          APP_STATE.filters = saved ? { ...defaultFilters(), ...saved } : defaultFilters();
          ensureDefaultGrid();
          renderFiltersBar();
          renderGridTabs();
        }
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
      } else {
        APP_STATE.columns = APP_STATE.columns.length ? unlockColumns(APP_STATE.columns) : unlockColumns(DEFAULT_COLUMNS.slice());
        if (Array.isArray(data.state?.activity)) {
          APP_STATE.activity = data.state.activity;
        }
        if (Array.isArray(data.state?.grids)) {
          APP_STATE.grids = data.state.grids;
          APP_STATE.currentGridId = data.state.currentGridId || null;
          ensureDefaultGrid();
          renderGridTabs();
        }
        if (data.state?.userColors) {
          APP_STATE.userColors = data.state.userColors;
        }
        if (APP_STATE.currentWorkspaceId) {
          const saved = APP_STATE.workspaceFilters[APP_STATE.currentWorkspaceId];
          APP_STATE.filters = saved ? { ...defaultFilters(), ...saved } : defaultFilters();
          renderFiltersBar();
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
          state: {
            tasks: APP_STATE.tasks,
            columns: APP_STATE.columns,
            filters: APP_STATE.workspaceFilters,
            activity: APP_STATE.activity,
            grids: APP_STATE.grids,
            currentGridId: APP_STATE.currentGridId,
            userColors: APP_STATE.userColors,
          },
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
      <button class="gt-view-tab" data-view="activity">Activity</button>
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

  function renderModeTabs() {
    const root = document.getElementById("gt-mode-tabs");
    if (!root) return;
    const mode = APP_STATE.currentMode || "data";
    root.innerHTML = `
      <button class="gt-mode-tab ${mode === "data" ? "is-active" : ""}" data-mode="data">Data</button>
      <button class="gt-mode-tab ${mode === "dashboard" ? "is-active" : ""}" data-mode="dashboard">Dashboard</button>
    `;

    root.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.onclick = () => {
        const m = btn.getAttribute("data-mode");
        setActiveMode(m);
      };
    });
  }

  function setActiveMode(mode) {
    APP_STATE.currentMode = mode === "dashboard" ? "dashboard" : "data";

    const isDashboard = APP_STATE.currentMode === "dashboard";
    const viewTabs = document.getElementById("gt-view-tabs");
    const gridTabs = document.getElementById("gt-grid-tabs");
    const filterBar = document.getElementById("gt-filter-bar");
    const tableEl = document.getElementById("gt-view-table");
    const boardEl = document.getElementById("gt-view-board");
    const activityEl = document.getElementById("gt-view-activity");
    const dashEl = document.getElementById("gt-view-dashboard");

    if (isDashboard) {
      if (viewTabs) viewTabs.classList.add("is-hidden");
      if (gridTabs) gridTabs.classList.add("is-hidden");
      if (filterBar) filterBar.classList.add("is-hidden");
      if (tableEl) tableEl.classList.add("is-hidden");
      if (boardEl) boardEl.classList.add("is-hidden");
      if (activityEl) activityEl.classList.add("is-hidden");
      if (dashEl) dashEl.classList.remove("is-hidden");
      APP_STATE.currentView = "dashboard";
      renderDashboardView();
    } else {
      if (viewTabs) viewTabs.classList.remove("is-hidden");
      if (gridTabs) gridTabs.classList.remove("is-hidden");
      if (filterBar) filterBar.classList.remove("is-hidden");
      setActiveView(APP_STATE.currentView === "dashboard" ? "table" : APP_STATE.currentView, { force: true });
    }

    renderModeTabs();
  }

  function getCurrentGrid() {
    return APP_STATE.grids.find((g) => g.id === APP_STATE.currentGridId);
  }

  function setActiveGrid(gridId) {
    const grid = APP_STATE.grids.find((g) => g.id === gridId);
    if (!grid) return;
    APP_STATE.currentGridId = gridId;
    APP_STATE.filters = { ...defaultFilters(), ...(grid.filters || {}) };
    if (APP_STATE.currentWorkspaceId) {
      APP_STATE.workspaceFilters[APP_STATE.currentWorkspaceId] = { ...APP_STATE.filters };
    }
    renderGridTabs();
    renderFiltersBar();
    renderTasks();
    renderBoardView();
    if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
      renderDashboardView();
    }
    schedulePush();
  }

  function renderGridTabs() {
    const root = document.getElementById("gt-grid-tabs");
    if (!root) return;
    ensureDefaultGrid();
    const activeId = APP_STATE.currentGridId;
    const tabs = APP_STATE.grids
      .map(
        (g) => `<button class="gt-grid-tab${g.id === activeId ? " is-active" : ""}" data-grid="${g.id}">${g.name || "Grid"}</button>`
      )
      .join("");

    root.innerHTML = `
      <div class="gt-grid-tabs-left">
        ${tabs}
      </div>
      <button id="gt-grid-add" class="gt-button gt-button-small">+ New grid</button>
    `;

    root.querySelectorAll("[data-grid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-grid");
        setActiveGrid(id);
      });
    });

    const addBtn = document.getElementById("gt-grid-add");
    if (addBtn) {
      addBtn.onclick = () => {
        const name = prompt("Grid name", `Grid ${APP_STATE.grids.length + 1}`);
        if (!name || !name.trim()) return;
        const grid = {
          id: `grid_${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim(),
          filters: { ...APP_STATE.filters },
        };
        APP_STATE.grids.push(grid);
        setActiveGrid(grid.id);
      };
    }
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
    const activityEl = document.getElementById("gt-view-activity");
    const dashEl = document.getElementById("gt-view-dashboard");

    const mode = APP_STATE.currentMode || "data";
    if (tableEl && boardEl && dashEl && activityEl) {
      tableEl.classList.toggle("is-hidden", view !== "table" || mode !== "data");
      boardEl.classList.toggle("is-hidden", view !== "board" || mode !== "data");
      activityEl.classList.toggle("is-hidden", view !== "activity" || mode !== "data");
      dashEl.classList.toggle("is-hidden", view !== "dashboard" || mode !== "dashboard");
    }

    if (options.skipRender) return;

    if (view === "table" && mode === "data") {
      renderTasks();
    } else if (view === "board" && mode === "data") {
      renderBoardView();
    } else if (view === "activity" && mode === "data") {
      renderActivityView();
    } else if (view === "dashboard" && mode === "dashboard" && canViewDashboard()) {
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

  function getColorSpec(colorId) {
    if (colorId && COLOR_META[colorId]) return COLOR_META[colorId];
    if (colorId && COLOR_META[colorId.toLowerCase()]) return COLOR_META[colorId.toLowerCase()];
    return { id: "neutral", bg: "#eef2f7", text: "#334155", border: "#e2e8f0" };
  }

  function renderWorkspaceSelect() {
    // no-op stub (sidebar removed)
  }

  function unlockColumns(cols) {
    return (cols || []).map((c) => ({ ...c, locked: false }));
  }

  function defaultFilters() {
    return {
      assigneeEmail: "",
      status: "",
      text: "",
      dateFrom: "",
      dateTo: "",
      groupBy: "",
      conditions: [],
    };
  }

  function ensureDefaultGrid() {
    if (!Array.isArray(APP_STATE.grids)) APP_STATE.grids = [];
    if (!APP_STATE.grids.length) {
      const base = { id: `grid_${Math.random().toString(36).slice(2, 6)}`, name: "Main Grid", filters: { ...defaultFilters() } };
      APP_STATE.grids.push(base);
      APP_STATE.currentGridId = base.id;
    }
    if (!APP_STATE.currentGridId || !APP_STATE.grids.find((g) => g.id === APP_STATE.currentGridId)) {
      APP_STATE.currentGridId = APP_STATE.grids[0].id;
    }
    const active = APP_STATE.grids.find((g) => g.id === APP_STATE.currentGridId);
    if (!active.filters) active.filters = { ...defaultFilters() };
    APP_STATE.filters = { ...defaultFilters(), ...active.filters };
  }

  function selectWorkspace(workspaceId) {
    APP_STATE.currentWorkspaceId = workspaceId;
    APP_STATE.tasks = [];
    APP_STATE.grids = [];
    APP_STATE.currentGridId = null;
    APP_STATE.currentMode = "data";
    APP_STATE.userColors = APP_STATE.userColors || {};
    const savedFilters = (APP_STATE.workspaceFilters && workspaceId)
      ? APP_STATE.workspaceFilters[workspaceId]
      : null;
    APP_STATE.filters = savedFilters ? { ...defaultFilters(), ...savedFilters } : defaultFilters();
    renderViewTabs();
    updateWorkspaceActionsVisibility();
    updateWorkspaceShellVisibility();
    renderWorkspaceSelect();
    renderGridTabs();
    renderModeTabs();
    renderFiltersBar();
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
    const switchBtn = document.getElementById("gt-switch-workspace");
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

      const wsColorMap = (APP_STATE.userColors && APP_STATE.userColors[ws.id]) || {};
      const rows = staff.map((u) => {
      const current = roles[u.email.toLowerCase()] || "none";
      const colorId = wsColorMap[u.email.toLowerCase()] || "ice";
      const spec = getColorSpec(colorId);
      return `
        <div class="gt-role-row">
          <div>
            <div class="gt-role-name">${u.name}</div>
            <div class="gt-role-email">${u.email}</div>
          </div>
          <div class="gt-role-actions">
            <button class="gt-color-chip" type="button" data-user-color="${u.email}" style="background:${spec.bg}; color:${spec.text}; border-color:${spec.border};">Color</button>
            <div class="gt-color-grid" data-user-color-grid="${u.email}">
              ${COLOR_PALETTE.map((c) => `<button type="button" class="gt-color-swatch" data-user-color-set="${u.email}" data-color-id="${c.id}" style="background:${c.bg}; color:${c.text}; border-color:${c.border};">Aa</button>`).join("")}
            </div>
            <select class="gt-select gt-role-select" data-email="${u.email}">
              <option value="none">No access</option>
              <option value="admin" ${current === "admin" ? "selected" : ""}>Admin</option>
              <option value="manager" ${current === "manager" ? "selected" : ""}>Manager</option>
              <option value="member" ${current === "member" ? "selected" : ""}>Member</option>
            </select>
          </div>
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

    modal.querySelectorAll("[data-user-color]").forEach((btn) => {
      const email = btn.getAttribute("data-user-color");
      const grid = modal.querySelector(`[data-user-color-grid="${CSS.escape(email)}"]`);
      if (!grid) return;
      btn.onclick = (e) => {
        e.stopPropagation();
        grid.classList.toggle("is-open");
      };
    });

    modal.querySelectorAll("[data-user-color-set]").forEach((sw) => {
      sw.onclick = () => {
        const email = sw.getAttribute("data-user-color-set");
        const color = sw.getAttribute("data-color-id");
        setUserColor(ws.id, email, color);
        renderWorkspaceSettingsContent(ws);
      };
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

  function setUserColor(workspaceId, email, colorId) {
    if (!workspaceId || !email) return;
    const wsMap = APP_STATE.userColors || {};
    if (!wsMap[workspaceId]) wsMap[workspaceId] = {};
    wsMap[workspaceId][email.toLowerCase()] = colorId;
    APP_STATE.userColors = wsMap;
    schedulePush();
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
    renderFiltersBar();
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
    if (!col) return;
    col.label = newLabel.trim();
    persistColumns();
    renderFieldsModal();
    showToast("Field renamed", "success");
  }

  function deleteField(id) {
    const col = (APP_STATE.columns || []).find((c) => c.id === id);
    if (!col) return;
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
              <div class="gt-field-name">${c.label}</div>
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
              <button class="gt-button gt-button-small gt-field-rename">Rename</button>
              <button class="gt-button gt-button-small" data-move="up">↑</button>
              <button class="gt-button gt-button-small" data-move="down">↓</button>
              <button class="gt-button gt-button-danger gt-button-small gt-field-delete">Delete</button>
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

  function getStatusOptions() {
    const statusCol = (APP_STATE.columns || []).find((c) => c.id === "status");
    if (statusCol && Array.isArray(statusCol.options) && statusCol.options.length) {
      return statusCol.options;
    }
    return [
      { id: "todo", label: "To Do" },
      { id: "in_progress", label: "In Progress" },
      { id: "done", label: "Done" },
    ];
  }

  function persistFilters() {
    const wsId = APP_STATE.currentWorkspaceId;
    if (!wsId) return;
    APP_STATE.workspaceFilters[wsId] = { ...defaultFilters(), ...APP_STATE.filters };
    const grid = APP_STATE.grids.find((g) => g.id === APP_STATE.currentGridId);
    if (grid) {
      grid.filters = { ...defaultFilters(), ...APP_STATE.filters };
    }
    schedulePush();
  }

  let filterFlyoutEl = null;
  let groupFlyoutEl = null;

  function getFilterableFields() {
    const base = [
      { id: "title", label: "Title", type: "text" },
      { id: "status", label: "Status", type: "single_select", options: getStatusOptions() },
      { id: "assignee", label: "Assignee", type: "user" },
      { id: "updatedAt", label: "Updated", type: "date" },
    ];
    const extras = (APP_STATE.columns || [])
      .filter((c) => !["title", "status", "assignee", "updatedAt"].includes(c.id))
      .map((c) => ({ id: c.id, label: c.label, type: c.type, options: c.options }));
    return [...base, ...extras];
  }

  function getFilterFieldMeta(fieldId) {
    return getFilterableFields().find((f) => f.id === fieldId) || getFilterableFields()[0];
  }

  function closeFilterFlyout() {
    if (filterFlyoutEl && filterFlyoutEl.parentElement) {
      filterFlyoutEl.parentElement.removeChild(filterFlyoutEl);
    }
    filterFlyoutEl = null;
  }

  function closeGroupFlyout() {
    if (groupFlyoutEl && groupFlyoutEl.parentElement) {
      groupFlyoutEl.parentElement.removeChild(groupFlyoutEl);
    }
    groupFlyoutEl = null;
  }

  function setFiltersPartial(partial) {
    APP_STATE.filters = { ...defaultFilters(), ...APP_STATE.filters, ...partial };
    persistFilters();
    renderFiltersBar();
    renderTasks();
    renderBoardView();
  }

  function openFilterFlyout(anchor) {
    closeFilterFlyout();
    if (!anchor) return;

    const f = APP_STATE.filters || defaultFilters();
    const conditions = Array.isArray(f.conditions) ? f.conditions.slice() : [];
    const fly = document.createElement("div");
    fly.className = "gt-filter-flyout";
    fly.innerHTML = `
      <div class="gt-filter-flyout-header">
        <div>
          <div class="gt-filter-title">Filter</div>
          <div class="gt-filter-sub">Build conditions across any column</div>
        </div>
        <button class="gt-filter-link" data-action="clear">Clear all</button>
      </div>
      <div class="gt-filter-conditions" id="gt-filter-conditions"></div>
      <button class="gt-filter-add" data-action="add">+ Add condition</button>
      <div class="gt-filter-footer">
        <div class="gt-filter-hint">Filters apply to both grid and board.</div>
        <div class="gt-filter-footer-actions">
          <button class="gt-button gt-button-small" data-action="close">Close</button>
        </div>
      </div>
    `;

    const renderRows = () => {
      const wrap = fly.querySelector("#gt-filter-conditions");
      if (!wrap) return;
      wrap.innerHTML = "";

      const fieldOptionsHtml = getFilterableFields()
        .map((c) => `<option value="${c.id}">${c.label}</option>`)
        .join("");

      const makeValueControl = (meta, cond, idx) => {
        const controlWrap = document.createElement("div");
        controlWrap.className = "gt-filter-value";
        if (cond.operator === "is_empty" || cond.operator === "not_empty") {
          controlWrap.innerHTML = `<div class="gt-filter-placeholder">No value needed</div>`;
          return controlWrap;
        }

        if (meta.type === "single_select" && Array.isArray(meta.options)) {
          const sel = document.createElement("select");
          sel.className = "gt-filter-input";
          sel.innerHTML = '<option value="">Select…</option>' + meta.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
          sel.value = cond.value || "";
          sel.onchange = () => {
            conditions[idx].value = sel.value;
            setFiltersPartial({ conditions });
          };
          controlWrap.appendChild(sel);
          return controlWrap;
        }

        if (meta.type === "user") {
          const sel = document.createElement("select");
          sel.className = "gt-filter-input";
          sel.innerHTML = '<option value="">Anyone</option>' + (APP_STATE.staff || []).map((u) => `<option value="${u.email}">${u.name}</option>`).join("");
          sel.value = cond.value || "";
          sel.onchange = () => {
            conditions[idx].value = sel.value;
            setFiltersPartial({ conditions });
          };
          controlWrap.appendChild(sel);
          return controlWrap;
        }

        if (meta.type === "date") {
          const inp = document.createElement("input");
          inp.type = "date";
          inp.className = "gt-filter-input";
          inp.value = cond.value || "";
          inp.onchange = () => {
            conditions[idx].value = inp.value;
            setFiltersPartial({ conditions });
          };
          controlWrap.appendChild(inp);
          return controlWrap;
        }

        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "Value";
        inp.className = "gt-filter-input";
        inp.value = cond.value || "";
        inp.oninput = () => {
          conditions[idx].value = inp.value;
          setFiltersPartial({ conditions });
        };
        controlWrap.appendChild(inp);
        return controlWrap;
      };

      conditions.forEach((cond, idx) => {
        const meta = getFilterFieldMeta(cond.field || cond.columnId || "title");
        if (!conditions[idx].field) conditions[idx].field = meta.id;
        if (!conditions[idx].operator) {
          conditions[idx].operator = meta.type === "date" ? "on" : "contains";
        }

        const row = document.createElement("div");
        row.className = "gt-filter-row-line";
        row.innerHTML = `
          <select class="gt-filter-input" data-role="field">${fieldOptionsHtml}</select>
          <select class="gt-filter-input" data-role="op"></select>
        `;

        const fieldSel = row.querySelector('[data-role="field"]');
        const opSel = row.querySelector('[data-role="op"]');
        fieldSel.value = cond.field || meta.id;

        const operators = meta.type === "date"
          ? [
              { id: "on", label: "On" },
              { id: "before", label: "Before" },
              { id: "after", label: "After" },
              { id: "is_empty", label: "Is empty" },
              { id: "not_empty", label: "Is not empty" },
            ]
          : [
              { id: "contains", label: "Contains" },
              { id: "is", label: "Is" },
              { id: "is_not", label: "Is not" },
              { id: "is_empty", label: "Is empty" },
              { id: "not_empty", label: "Is not empty" },
            ];

        opSel.innerHTML = operators.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
        opSel.value = cond.operator || operators[0].id;

        fieldSel.onchange = () => {
          const nextMeta = getFilterFieldMeta(fieldSel.value);
          conditions[idx] = { field: nextMeta.id, operator: nextMeta.type === "date" ? "on" : "contains", value: "" };
          renderRows();
          setFiltersPartial({ conditions });
        };

        opSel.onchange = () => {
          conditions[idx].operator = opSel.value;
          if (opSel.value === "is_empty" || opSel.value === "not_empty") {
            conditions[idx].value = "";
          }
          setFiltersPartial({ conditions });
          renderRows();
        };

        row.appendChild(makeValueControl(meta, cond, idx));

        const removeBtn = document.createElement("button");
        removeBtn.className = "gt-filter-remove";
        removeBtn.textContent = "✕";
        removeBtn.onclick = () => {
          conditions.splice(idx, 1);
          setFiltersPartial({ conditions });
          renderRows();
        };
        row.appendChild(removeBtn);

        wrap.appendChild(row);
      });

      if (!conditions.length) {
        wrap.innerHTML = '<div class="gt-filter-empty">No filter conditions. Add one to get started.</div>';
      }
    };

    renderRows();

    fly.querySelectorAll("[data-action]").forEach((btn) => {
      const action = btn.getAttribute("data-action");
      if (action === "add") {
        btn.onclick = () => {
          const first = getFilterableFields()[0];
          conditions.push({ field: first.id, operator: first.type === "date" ? "on" : "contains", value: "" });
          setFiltersPartial({ conditions });
          renderRows();
        };
      }
      if (action === "clear") {
        btn.onclick = () => {
          setFiltersPartial({ conditions: [], assigneeEmail: "", status: "", text: "", dateFrom: "", dateTo: "" });
          renderRows();
        };
      }
      if (action === "close") {
        btn.onclick = () => closeFilterFlyout();
      }
    });

    document.body.appendChild(fly);
    const rect = anchor.getBoundingClientRect();
    fly.style.left = `${rect.left + window.scrollX}px`;
    fly.style.top = `${rect.bottom + 6 + window.scrollY}px`;
    filterFlyoutEl = fly;
  }

  function openGroupFlyout(anchor) {
    closeGroupFlyout();
    if (!anchor) return;
    const current = APP_STATE.filters?.groupBy || "";
    const options = [
      { value: "", label: "No grouping" },
      { value: "status", label: "Status" },
      { value: "assignee", label: "Assignee" },
      ...((APP_STATE.columns || [])
        .filter((c) => !["title", "status", "assignee", "updatedAt"].includes(c.id))
        .map((c) => ({ value: `field:${c.id}`, label: c.label }))),
    ];

    const fly = document.createElement("div");
    fly.className = "gt-filter-flyout";
    fly.innerHTML = `
      <div class="gt-filter-flyout-header">
        <div>
          <div class="gt-filter-title">Group</div>
          <div class="gt-filter-sub">Choose a column to group rows</div>
        </div>
        <button class="gt-filter-link" data-action="clear">Clear</button>
      </div>
      <div class="gt-group-options" id="gt-group-options"></div>
    `;

    const wrap = fly.querySelector("#gt-group-options");
    if (wrap) {
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = `gt-group-option${opt.value === current ? " is-active" : ""}`;
        btn.textContent = opt.label;
        btn.onclick = () => {
          setFiltersPartial({ groupBy: opt.value });
          closeGroupFlyout();
        };
        wrap.appendChild(btn);
      });
    }

    const clearBtn = fly.querySelector('[data-action="clear"]');
    if (clearBtn) {
      clearBtn.onclick = () => {
        setFiltersPartial({ groupBy: "" });
        closeGroupFlyout();
      };
    }

    document.body.appendChild(fly);
    const rect = anchor.getBoundingClientRect();
    fly.style.left = `${rect.left + window.scrollX}px`;
    fly.style.top = `${rect.bottom + 6 + window.scrollY}px`;
    groupFlyoutEl = fly;
  }

  function renderFiltersBar() {
    const bar = document.getElementById("gt-filter-bar");
    if (!bar) return;
    const f = APP_STATE.filters || defaultFilters();
    const activeConditions = Array.isArray(f.conditions) ? f.conditions.length : 0;
    const groupLabel = (() => {
      if (!f.groupBy) return "No group";
      if (f.groupBy === "status") return "Grouped by Status";
      if (f.groupBy === "assignee") return "Grouped by Assignee";
      if (f.groupBy.startsWith("field:")) {
        const fid = f.groupBy.split(":")[1];
        const field = (APP_STATE.columns || []).find((c) => c.id === fid);
        return field ? `Grouped by ${field.label}` : "Grouped";
      }
      return "Grouped";
    })();

    bar.innerHTML = `
      <div class="gt-filter-toolbar">
        <button id="gt-open-filter" class="gt-chip-button ${activeConditions ? "is-active" : ""}">
          <span>Filter</span>
          ${activeConditions ? `<span class="gt-chip-count">${activeConditions}</span>` : ""}
        </button>
        <button id="gt-open-group" class="gt-chip-button ${f.groupBy ? "is-active" : ""}">${groupLabel}</button>
        <button id="gt-filter-clear" class="gt-button gt-button-small">Clear</button>
      </div>
    `;

    const filterBtn = document.getElementById("gt-open-filter");
    const groupBtn = document.getElementById("gt-open-group");
    const clearBtn = document.getElementById("gt-filter-clear");

    if (filterBtn) {
      filterBtn.onclick = (e) => {
        e.stopPropagation();
        openFilterFlyout(filterBtn);
      };
    }

    if (groupBtn) {
      groupBtn.onclick = (e) => {
        e.stopPropagation();
        openGroupFlyout(groupBtn);
      };
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        closeFilterFlyout();
        closeGroupFlyout();
        setFiltersPartial({ ...defaultFilters() });
      };
    }
  }

  function isSelectType(type) {
    return type === "single_select" || type === "multi_select";
  }

  function closeColumnMenu() {
    if (openColumnMenuEl && openColumnMenuEl.parentElement) {
      openColumnMenuEl.parentElement.classList.remove("has-menu-open");
      openColumnMenuEl.parentElement.removeChild(openColumnMenuEl);
    }
    openColumnMenuEl = null;
  }

  function reorderColumns(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const cols = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns.slice()
      : DEFAULT_COLUMNS.slice();
    const fromIdx = cols.findIndex((c) => c.id === sourceId);
    const toIdx = cols.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, moved);
    APP_STATE.columns = cols;
    persistColumns();
  }

  function reorderTasks(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const idxMap = Object.fromEntries(APP_STATE.tasks.map((t, i) => [t.id, i]));
    const fromIdx = idxMap[sourceId];
    const toIdx = idxMap[targetId];
    if (fromIdx === undefined || toIdx === undefined) return;
    const copy = APP_STATE.tasks.slice();
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    APP_STATE.tasks = copy;
    renderTasks();
    renderBoardView();
    schedulePush();
  }

  function attachColumnDragHandlers(th, colId) {
    if (!th) return;
    th.draggable = true;
    th.addEventListener("dragstart", (e) => {
      draggingColumnId = colId;
      th.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", colId);
      }
    });
    th.addEventListener("dragover", (e) => {
      if (!draggingColumnId || draggingColumnId === colId) return;
      e.preventDefault();
      th.classList.add("is-drag-over");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    th.addEventListener("dragleave", () => {
      th.classList.remove("is-drag-over");
    });
    th.addEventListener("drop", (e) => {
      e.preventDefault();
      th.classList.remove("is-drag-over");
      const source = draggingColumnId;
      draggingColumnId = null;
      reorderColumns(source, colId);
    });
    th.addEventListener("dragend", () => {
      draggingColumnId = null;
      th.classList.remove("is-dragging", "is-drag-over");
      document.querySelectorAll(".gt-col-header.is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    });
  }

  function closeContextMenu() {
    if (contextMenuEl && contextMenuEl.parentElement) {
      contextMenuEl.parentElement.removeChild(contextMenuEl);
    }
    contextMenuEl = null;
  }

  function openRowContextMenu(task, event) {
    if (!task) return;
    closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "gt-context-menu";
    menu.innerHTML = `
      <button class="gt-context-item" data-action="open">Open record</button>
      <button class="gt-context-item" data-action="duplicate">Duplicate record</button>
      <button class="gt-context-item" data-action="assign-self">Assign to me</button>
    `;

    const { clientX: x, clientY: y } = event;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      switch (action) {
        case "open":
          openDetailDrawer(task.id);
          break;
        case "duplicate":
          duplicateTask(task.id);
          break;
        case "assign-self":
          assignTaskToSelf(task.id);
          break;
        default:
          break;
      }
      closeContextMenu();
    });

    document.body.appendChild(menu);
    contextMenuEl = menu;
  }

  function duplicateFieldColumn(colId) {
    const cols = APP_STATE.columns || [];
    const idx = cols.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    const src = cols[idx];
    const copy = {
      ...src,
      id: `fld_${Math.random().toString(36).slice(2, 7)}`,
      label: `${src.label} Copy`,
      locked: false,
    };
    if (Array.isArray(src.options)) {
      copy.options = src.options.map((o) => ({ ...o, id: `opt_${Math.random().toString(36).slice(2, 6)}` }));
    }
    const next = cols.slice();
    next.splice(idx + 1, 0, copy);
    APP_STATE.columns = next;
    persistColumns();
    showToast("Field duplicated", "success");
  }

  function insertFieldRelative(colId, direction) {
    const cols = APP_STATE.columns || [];
    const idx = cols.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    const base = "New Field";
    let suffix = 1;
    let label = base;
    while (cols.some((c) => c.label === label)) {
      suffix += 1;
      label = `${base} ${suffix}`;
    }
    const newCol = {
      id: `fld_${Math.random().toString(36).slice(2, 7)}`,
      label,
      type: "text",
    };
    const next = cols.slice();
    const targetIndex = direction === "left" ? idx : idx + 1;
    next.splice(targetIndex, 0, newCol);
    APP_STATE.columns = next;
    persistColumns();
    showToast("Field inserted", "success");
  }

  function openColumnMenu(col, anchor) {
    closeColumnMenu();
    if (!anchor) return;
    const menu = document.createElement("div");
    menu.className = "gt-col-menu";
    menu.innerHTML = `
      <button class="gt-col-menu-item" data-action="edit">Edit field</button>
      <button class="gt-col-menu-item" data-action="duplicate">Duplicate field</button>
      <button class="gt-col-menu-item" data-action="insert-left">Insert left</button>
      <button class="gt-col-menu-item" data-action="insert-right">Insert right</button>
      <button class="gt-col-menu-item is-danger" data-action="delete">Delete field</button>
    `;

    menu.onclick = (e) => {
      const btn = e.target.closest(".gt-col-menu-item");
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute("data-action");
      switch (action) {
        case "edit":
          openFieldEditModal(col.id);
          break;
        case "duplicate":
          duplicateFieldColumn(col.id);
          closeColumnMenu();
          break;
        case "insert-left":
          insertFieldRelative(col.id, "left");
          closeColumnMenu();
          break;
        case "insert-right":
          insertFieldRelative(col.id, "right");
          closeColumnMenu();
          break;
        case "delete":
          deleteField(col.id);
          closeColumnMenu();
          break;
        default:
          break;
      }
    };

    anchor.classList.add("has-menu-open");
    anchor.appendChild(menu);
    openColumnMenuEl = menu;
  }

  function closeFieldEditModal() {
    const modal = document.getElementById("gt-field-editor-modal");
    if (modal) {
      modal.classList.add("is-hidden");
      modal.innerHTML = "";
    }
  }

  function openFieldEditModal(colId) {
    const modal = document.getElementById("gt-field-editor-modal");
    if (!modal) return;
    const col = (APP_STATE.columns || []).find((c) => c.id === colId);
    if (!col) return;

    const options = Array.isArray(col.options)
      ? col.options.map((o) => ({ ...o }))
      : [];
    const isLocked = false;

    const typeOptions = FIELD_TYPES.map(
      (t) => `<option value="${t.value}">${t.label}</option>`
    ).join("");

    modal.innerHTML = `
      <div class="gt-modal-backdrop" data-close="1"></div>
      <div class="gt-modal-card gt-modal-card-medium">
        <div class="gt-modal-header">
          <div>
            <div class="gt-modal-title">Edit field</div>
            <div class="gt-modal-sub">${col.label}</div>
          </div>
          <button class="gt-button" id="gt-field-edit-close">✕</button>
        </div>

        <div class="gt-modal-section gt-edit-form">
          <label class="gt-modal-label">Field name</label>
          <input id="gt-edit-name" class="gt-input" type="text" value="${col.label}" />

          <label class="gt-modal-label">Type</label>
          <select id="gt-edit-type" class="gt-select">${typeOptions}</select>

          <div class="gt-edit-options-block" id="gt-edit-options-block" style="display:${isSelectType(col.type) ? "flex" : "none"};">
            <div class="gt-modal-label">Options</div>
            <div id="gt-edit-options-list" class="gt-option-list"></div>
            <div class="gt-option-actions">
              <button class="gt-button gt-button-small" id="gt-option-add">+ Add option</button>
              <button class="gt-button gt-button-small" id="gt-option-sort">Alphabetize</button>
            </div>
          </div>
        </div>

        <div class="gt-edit-actions">
          <button class="gt-button" id="gt-field-edit-cancel">Cancel</button>
          <button class="gt-button gt-button-primary" id="gt-field-edit-save">Save</button>
        </div>
      </div>
    `;

    modal.classList.remove("is-hidden");

    const nameInput = document.getElementById("gt-edit-name");
    const typeSelect = document.getElementById("gt-edit-type");
    const optionsList = document.getElementById("gt-edit-options-list");
    const optionsBlock = document.getElementById("gt-edit-options-block");
    const addBtn = document.getElementById("gt-option-add");
    const sortBtn = document.getElementById("gt-option-sort");
    const closeBtn = document.getElementById("gt-field-edit-close");
    const cancelBtn = document.getElementById("gt-field-edit-cancel");
    const saveBtn = document.getElementById("gt-field-edit-save");

    if (typeSelect) {
      typeSelect.value = col.type;
    }

    const renderOptionRows = () => {
      if (!optionsList) return;
      optionsList.innerHTML = options
        .map((opt, idx) => {
          const spec = getColorSpec(opt.color);
          return `
            <div class="gt-option-row" data-idx="${idx}">
              <input class="gt-input gt-option-label" type="text" value="${opt.label || ""}" />
              <button class="gt-color-chip" type="button" data-color-toggle="${idx}" style="background:${spec.bg}; color:${spec.text}; border-color:${spec.border};">${(opt.label || "").slice(0, 8) || "Color"}</button>
              <div class="gt-color-grid" data-color-grid="${idx}">
                ${COLOR_PALETTE.map((c) => `<button type="button" class="gt-color-swatch" data-color-set="${idx}" data-color-id="${c.id}" style="background:${c.bg}; color:${c.text}; border-color:${c.border};">Aa</button>`).join("")}
              </div>
              <button class="gt-button gt-button-small gt-button-danger gt-option-remove">Remove</button>
            </div>
          `;
        })
        .join("");

      optionsList.querySelectorAll(".gt-option-row").forEach((row) => {
        const idx = Number(row.getAttribute("data-idx"));
        const labelInput = row.querySelector(".gt-option-label");
        const removeBtn = row.querySelector(".gt-option-remove");
        const chip = row.querySelector("[data-color-toggle]");
        const grid = row.querySelector("[data-color-grid]");
        if (labelInput) {
          labelInput.oninput = () => {
            options[idx].label = labelInput.value;
          };
        }
        if (chip && grid) {
          chip.onclick = () => {
            grid.classList.toggle("is-open");
          };
          grid.querySelectorAll("[data-color-set]").forEach((sw) => {
            sw.onclick = () => {
              const val = sw.getAttribute("data-color-id");
              options[idx].color = val;
              grid.classList.remove("is-open");
              renderOptionRows();
            };
          });
        }
        if (removeBtn) {
          removeBtn.onclick = () => {
            options.splice(idx, 1);
            renderOptionRows();
          };
        }
      });
    };

    const ensureOptions = () => {
      if (!isSelectType(typeSelect?.value)) return;
      if (!options.length) {
        options.push(
          { id: `opt_${Math.random().toString(36).slice(2, 6)}`, label: "Option 1", color: "blue" },
          { id: `opt_${Math.random().toString(36).slice(2, 6)}`, label: "Option 2", color: "green" }
        );
      }
    };

    ensureOptions();
    renderOptionRows();

    const syncOptionsVisibility = () => {
      if (!optionsBlock || !typeSelect) return;
      const show = isSelectType(typeSelect.value);
      optionsBlock.style.display = show ? "flex" : "none";
      if (show && !options.length) {
        ensureOptions();
        renderOptionRows();
      }
    };

    if (typeSelect) {
      typeSelect.onchange = () => {
        syncOptionsVisibility();
      };
    }

    if (addBtn) {
      addBtn.onclick = () => {
        options.push({
          id: `opt_${Math.random().toString(36).slice(2, 6)}`,
          label: `Option ${options.length + 1}`,
          color: OPTION_COLORS[options.length % OPTION_COLORS.length],
        });
        renderOptionRows();
      };
    }

    if (sortBtn) {
      sortBtn.onclick = () => {
        options.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
        renderOptionRows();
      };
    }

    const doClose = () => {
      closeFieldEditModal();
      closeColumnMenu();
    };

    if (closeBtn) closeBtn.onclick = doClose;
    if (cancelBtn) cancelBtn.onclick = doClose;

    modal.querySelectorAll(".gt-modal-backdrop").forEach((b) => {
      b.onclick = doClose;
    });

    if (saveBtn) {
      saveBtn.onclick = () => {
        const name = (nameInput?.value || "").trim();
        if (name) {
          col.label = name;
        }
        const selectedType = typeSelect ? typeSelect.value : col.type;
        col.type = selectedType;

        if (isSelectType(col.type)) {
          const cleaned = options
            .map((o, idx) => ({
              id: o.id || `opt_${idx}_${Math.random().toString(36).slice(2, 5)}`,
              label: (o.label || "").trim(),
              color: o.color || OPTION_COLORS[idx % OPTION_COLORS.length],
            }))
            .filter((o) => o.label);
          col.options = cleaned.length ? cleaned : undefined;
        } else {
          delete col.options;
        }

        persistColumns();
        renderFieldsModal();
        closeFieldEditModal();
        closeColumnMenu();
        showToast("Field updated", "success");
      };
    }
  }


  // Assignee filter removed from UI for now; filtering uses full list

  document.addEventListener("click", (e) => {
    if (openColumnMenuEl) {
      const isToggle = e.target.closest && e.target.closest(".gt-col-menu-trigger");
      if (!isToggle && !openColumnMenuEl.contains(e.target)) {
        closeColumnMenu();
      }
    }
    if (contextMenuEl && !contextMenuEl.contains(e.target)) {
      closeContextMenu();
    }
    const isFilterToggle = e.target.closest && e.target.closest("#gt-open-filter");
    const isGroupToggle = e.target.closest && e.target.closest("#gt-open-group");
    if (filterFlyoutEl && !isFilterToggle && !filterFlyoutEl.contains(e.target)) {
      closeFilterFlyout();
    }
    if (groupFlyoutEl && !isGroupToggle && !groupFlyoutEl.contains(e.target)) {
      closeGroupFlyout();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeContextMenu();
      closeColumnMenu();
      closeFilterFlyout();
      closeGroupFlyout();
    }
  });

  function getFilteredTasks() {
    const f = APP_STATE.filters || defaultFilters();
    let list = APP_STATE.tasks.slice();

    if (f.assigneeEmail) {
      list = list.filter((t) => (t.assigneeEmail || "") === f.assigneeEmail);
    }

    if (f.status) {
      list = list.filter((t) => (t.status || "") === f.status);
    }

    if (f.text) {
      const q = f.text.toLowerCase();
      list = list.filter((t) => {
        const title = (t.title || "").toLowerCase();
        const fields = t.fields || {};
        const fieldVals = Object.values(fields)
          .map((v) => (Array.isArray(v) ? v.join(", ") : String(v || "")))
          .join(" ")
          .toLowerCase();
        return title.includes(q) || fieldVals.includes(q);
      });
    }

    if (f.dateFrom) {
      const from = new Date(f.dateFrom);
      list = list.filter((t) => {
        const d = t.updatedAt || t.createdAt;
        return d ? new Date(d) >= from : false;
      });
    }

    if (f.dateTo) {
      const to = new Date(f.dateTo);
      list = list.filter((t) => {
        const d = t.updatedAt || t.createdAt;
        return d ? new Date(d) <= to : false;
      });
    }

    const conditions = Array.isArray(f.conditions) ? f.conditions : [];
    if (conditions.length) {
      const metaMap = Object.fromEntries(getFilterableFields().map((c) => [c.id, c]));

      const getVal = (task, meta) => {
        if (!meta) return "";
        if (meta.id === "title") return task.title || "";
        if (meta.id === "status") return task.status || "";
        if (meta.id === "assignee") return task.assigneeEmail || "";
        if (meta.id === "updatedAt") return task.updatedAt || task.createdAt || "";
        return (task.fields || {})[meta.id];
      };

      const check = (raw, cond, meta) => {
        const op = cond.operator || "contains";
        const value = cond.value || "";
        const isEmptyVal = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
        if (op === "is_empty") return isEmptyVal(raw);
        if (op === "not_empty") return !isEmptyVal(raw);

        if (meta?.type === "date") {
          const rawDate = raw ? new Date(raw) : null;
          const condDate = value ? new Date(value) : null;
          if (!rawDate || !condDate || Number.isNaN(rawDate.getTime()) || Number.isNaN(condDate.getTime())) return false;
          if (op === "on") return rawDate.toDateString() === condDate.toDateString();
          if (op === "before") return rawDate <= condDate;
          if (op === "after") return rawDate >= condDate;
        }

        if (Array.isArray(raw)) {
          if (op === "contains") return raw.some((r) => String(r || "").toLowerCase().includes(String(value).toLowerCase()));
          if (op === "is") return raw.includes(value);
          if (op === "is_not") return !raw.includes(value);
        }

        const lhs = String(raw || "").toLowerCase();
        const rhs = String(value || "").toLowerCase();
        if (op === "contains") return lhs.includes(rhs);
        if (op === "is") return lhs === rhs;
        if (op === "is_not") return lhs !== rhs;
        return true;
      };

      list = list.filter((task) =>
        conditions.every((cond) => {
          const meta = metaMap[cond.field || cond.columnId];
          if (!meta) return true;
          const val = getVal(task, meta);
          return check(val, cond, meta);
        })
      );
    }

    return list;
  }

  function logActivity(taskId, fieldId, before, after) {
    if (before === after) return;
    if (before == null && after == null) return;
    APP_STATE.activity = APP_STATE.activity || [];
    APP_STATE.activity.push({
      id: `act_${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      field: fieldId,
      before,
      after,
      user: APP_STATE.runtime.email || "unknown",
      timestamp: new Date().toISOString(),
    });
    if (APP_STATE.currentView === "activity") {
      renderActivityView();
    }
    schedulePush();
  }

  function trackChange(task, fieldId, before, after) {
    if (!task) return;
    logActivity(task.id, fieldId, before, after);
  }

  function getAssigneeName(email) {
    if (!email) return "Unassigned";
    return APP_STATE.staff.find((u) => u.email === email)?.name || email;
  }

  function notifyStatusChange(task, from, to) {
    if (from === to) return;
    showToast(`Status: ${from || "None"} → ${to || "None"}`, "success");
    if (to === "done") {
      showToast(`Task completed: ${task.title || "Untitled"}`, "success");
    }
  }

  function notifyAssignment(task, assigneeEmail) {
    const name = getAssigneeName(assigneeEmail);
    showToast(`Assigned to ${name}`, "success");
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

    closeColumnMenu();

    const columns = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns
      : DEFAULT_COLUMNS;

    // Build header
    theadRow.innerHTML = "";

    const leadTh = document.createElement("th");
    leadTh.className = "gt-col-header gt-col-leading";
    leadTh.textContent = "";
    theadRow.appendChild(leadTh);

    columns.forEach((c) => {
      const th = document.createElement("th");
      th.className = "gt-col-header is-draggable";

      const trigger = document.createElement("button");
      trigger.className = "gt-col-menu-trigger";
      trigger.draggable = false;
      trigger.innerHTML = `<span class="gt-col-title">${c.label}</span><span class="gt-col-caret">▾</span>`;
      trigger.onclick = (e) => {
        e.stopPropagation();
        openColumnMenu(c, trigger);
      };

      th.appendChild(trigger);
      attachColumnDragHandlers(th, c.id);
      theadRow.appendChild(th);
    });

    const actionsTh = document.createElement("th");
    actionsTh.className = "gt-col-header gt-col-actions";
    actionsTh.textContent = "";
    theadRow.appendChild(actionsTh);

    tbody.innerHTML = "";

    const rows = getFilteredTasks();
    const groupBy = APP_STATE.filters?.groupBy || "";
    const statusLabels = Object.fromEntries(getStatusOptions().map((o) => [o.id, o.label]));
    const customFieldMap = Object.fromEntries((APP_STATE.columns || []).map((c) => [c.id, c]));

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

    const getValue = (task, col, rowIndex = 0) => {
      if (col.id === "title") return task.title || "";
      if (col.id === "status") return task.status || "todo";
      if (col.id === "assignee") return task.assigneeEmail || "";
      if (col.id === "updatedAt") return task.updatedAt || null;
      if (col.type === "autonumber") return rowIndex || 0;
      if (col.type === "created_time") return task.createdAt || null;
      if (col.type === "last_modified_time") return task.updatedAt || null;
      if (col.type === "created_by") return task.createdBy || null;
      if (col.type === "last_modified_by") return task.updatedBy || null;
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
      if (["autonumber", "created_time", "last_modified_time", "created_by", "last_modified_by", "button", "barcode", "formula", "rollup", "count", "lookup"].includes(col.type)) {
        return; // derived / read-only
      }
      task.fields = task.fields || {};
      task.fields[col.id] = val;
    };


    const renderSelectOptions = (col) => {
      const opts = Array.isArray(col.options) ? col.options : [];
      return opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    };

    const enableCellQuickFocus = (td, control) => {
      if (!td || !control) return;
      td.classList.add("gt-cell-editable");
      td.addEventListener("click", (e) => {
        if (e.target === td) {
          control.focus();
          if (typeof control.select === "function") control.select();
        }
      });
    };

    let rowNumber = 0;

    const makeRow = (task) => {
      const displayIndex = ++rowNumber;
      const tr = document.createElement("tr");

      const lead = document.createElement("td");
      lead.className = "gt-row-leading";
      lead.draggable = true;
      lead.addEventListener("dragstart", () => {
        draggingRowId = task.id;
        tr.classList.add("is-dragging-row");
      });
      lead.addEventListener("dragend", () => {
        draggingRowId = null;
        tr.classList.remove("is-dragging-row");
      });
      lead.addEventListener("dragover", (e) => {
        if (!draggingRowId || draggingRowId === task.id) return;
        e.preventDefault();
        tr.classList.add("is-drag-over-row");
      });
      lead.addEventListener("dragleave", () => {
        tr.classList.remove("is-drag-over-row");
      });
      lead.addEventListener("drop", (e) => {
        e.preventDefault();
        tr.classList.remove("is-drag-over-row");
        if (draggingRowId) {
          reorderTasks(draggingRowId, task.id);
        }
        draggingRowId = null;
      });

      const handle = document.createElement("span");
      handle.className = "gt-row-handle";
      handle.textContent = "⋮⋮";
      const leadOpenBtn = document.createElement("button");
      leadOpenBtn.className = "gt-row-open";
      leadOpenBtn.title = "Open record";
      leadOpenBtn.textContent = "⤢";
      leadOpenBtn.onclick = (e) => {
        e.stopPropagation();
        openDetailDrawer(task.id);
      };
      lead.appendChild(handle);
      lead.appendChild(leadOpenBtn);
      tr.appendChild(lead);

      columns.forEach((col) => {
        const td = document.createElement("td");
        const current = getValue(task, col, displayIndex);
        const prev = current;

        if (col.id === "updatedAt") {
          td.innerHTML = `<span class="gt-tiny">${formatDateTimeShort(current)}</span>`;
          tr.appendChild(td);
          return;
        }

        switch (col.type) {
          case "autonumber": {
            td.innerHTML = `<span class="gt-pill">${current ?? ""}</span>`;
            tr.appendChild(td);
            break;
          }
          case "text": {
            const inp = document.createElement("input");
            inp.className = "gt-task-title-input";
            inp.value = current || "";
            inp.onchange = () => {
              setValue(task, col, inp.value);
              trackChange(task, col.id, prev, inp.value);
              touch(task);
              renderBoardView();
              if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
                renderDashboardView();
              }
            };
            td.appendChild(inp);
            enableCellQuickFocus(td, inp);
            break;
          }
          case "long_text": {
            const ta = document.createElement("textarea");
            ta.className = "gt-textarea";
            ta.value = current || "";
            ta.onchange = () => {
              setValue(task, col, ta.value);
              trackChange(task, col.id, prev, ta.value);
              touch(task);
            };
            td.appendChild(ta);
            enableCellQuickFocus(td, ta);
            break;
          }
          case "checkbox": {
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!current;
            cb.onchange = () => {
              setValue(task, col, cb.checked);
              trackChange(task, col.id, prev, cb.checked);
              touch(task);
            };
            td.appendChild(cb);
            enableCellQuickFocus(td, cb);
            break;
          }
          case "single_select": {
            const sel = document.createElement("select");
            sel.innerHTML = `<option value="">Select…</option>` + renderSelectOptions(col);
            sel.value = current || "";
            const applyColor = () => {
              const optDef = (col.options || []).find((o) => o.id === sel.value);
              const spec = getColorSpec(optDef?.color);
              sel.style.background = spec.bg;
              sel.style.color = spec.text;
              sel.style.borderColor = spec.border;
            };
            applyColor();
            sel.onchange = () => {
              setValue(task, col, sel.value || null);
              trackChange(task, col.id, prev, sel.value || null);
              notifyStatusChange(task, prev, sel.value || null);
              touch(task);
              renderBoardView();
              applyColor();
            };
            td.appendChild(sel);
            enableCellQuickFocus(td, sel);
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
              trackChange(task, col.id, prev, vals);
              touch(task);
            };
            td.appendChild(sel);
            enableCellQuickFocus(td, sel);
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
              trackChange(task, col.id, prev, sel.value || null);
              notifyAssignment(task, sel.value || null);
              touch(task);
            };
            td.appendChild(sel);
            enableCellQuickFocus(td, sel);
            break;
          }
          case "date": {
            const inp = document.createElement("input");
            inp.type = "date";
            inp.value = current ? current.slice(0, 10) : "";
            inp.onchange = () => {
              setValue(task, col, inp.value || null);
              trackChange(task, col.id, prev, inp.value || null);
              touch(task);
            };
            td.appendChild(inp);
            enableCellQuickFocus(td, inp);
            break;
          }
          case "number": {
            const inp = document.createElement("input");
            inp.type = "number";
            inp.value = current ?? "";
            inp.onchange = () => {
              const next = inp.value === "" ? null : Number(inp.value);
              setValue(task, col, next);
              trackChange(task, col.id, prev, next);
              touch(task);
            };
            td.appendChild(inp);
            enableCellQuickFocus(td, inp);
            break;
          }
          case "barcode": {
            td.innerHTML = `<span class="gt-pill">${current || "—"}</span>`;
            tr.appendChild(td);
            break;
          }
          case "button": {
            const btn = document.createElement("button");
            btn.className = "gt-button gt-button-small";
            btn.textContent = "Open";
            btn.onclick = (e) => {
              e.stopPropagation();
              openDetailDrawer(task.id);
            };
            td.appendChild(btn);
            break;
          }
          case "formula":
          case "rollup":
          case "count":
          case "lookup": {
            td.innerHTML = `<span class="gt-muted">${current ?? "—"}</span>`;
            tr.appendChild(td);
            break;
          }
          case "created_time":
          case "last_modified_time": {
            td.innerHTML = `<span class="gt-tiny">${formatDateTimeShort(current)}</span>`;
            tr.appendChild(td);
            break;
          }
          case "created_by":
          case "last_modified_by": {
            const val = current || "Unknown";
            td.innerHTML = `<span class="gt-pill gt-pill-soft">${val}</span>`;
            tr.appendChild(td);
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
                trackChange(task, col.id, prev, next);
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
              trackChange(task, col.id, prev, next);
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
              trackChange(task, col.id, prev, inp.value);
              touch(task);
            };
            td.appendChild(inp);
            enableCellQuickFocus(td, inp);
          }
        }

        tr.appendChild(td);
      });

      const tdActions = document.createElement("td");
      tdActions.className = "gt-row-actions";
      const openBtn = document.createElement("button");
      openBtn.className = "gt-row-expand";
      openBtn.textContent = "Open";
      openBtn.onclick = (e) => {
        e.stopPropagation();
        openDetailDrawer(task.id);
      };
      tdActions.appendChild(openBtn);
      tr.appendChild(tdActions);

      tr.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openRowContextMenu(task, e);
      });

      tbody.appendChild(tr);
    };

    const appendGroupHeader = (label) => {
      const tr = document.createElement("tr");
      tr.className = "gt-group-row";
      const td = document.createElement("td");
      td.colSpan = columns.length + 2;
      td.textContent = label;
      tr.appendChild(td);
      tbody.appendChild(tr);
    };

    const getGroupInfo = (task) => {
      if (!groupBy) return null;
      if (groupBy === "status") {
        const key = task.status || "(none)";
        return { key, label: statusLabels[key] || "No status" };
      }
      if (groupBy === "assignee") {
        const key = task.assigneeEmail || "__none";
        const name = APP_STATE.staff.find((u) => u.email === task.assigneeEmail)?.name;
        return { key, label: name || "Unassigned" };
      }
      if (groupBy.startsWith("field:")) {
        const fid = groupBy.split(":")[1];
        const val = (task.fields || {})[fid];
        const field = customFieldMap[fid];
        const labelVal = Array.isArray(val) ? val.join(", ") : val || "No value";
        const base = field ? field.label : "Field";
        const key = Array.isArray(val) ? val.join("|") : (val || "__none");
        return { key, label: `${base}: ${labelVal}` };
      }
      return null;
    };

    if (groupBy) {
      const groups = new Map();
      rows.forEach((task) => {
        const info = getGroupInfo(task);
        const key = info?.key ?? "__none";
        if (!groups.has(key)) groups.set(key, { label: info?.label || "(None)", items: [] });
        groups.get(key).items.push(task);
      });
      Array.from(groups.keys()).forEach((key) => {
        const g = groups.get(key);
        appendGroupHeader(g.label || "Group");
        g.items.forEach((t) => makeRow(t));
      });
    } else {
      rows.forEach((task) => makeRow(task));
    }
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
        logActivity(task.id, "status", oldStatus, newStatus);
        notifyStatusChange(task, oldStatus, newStatus);

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

        card.addEventListener("click", (e) => {
          e.stopPropagation();
          openDetailDrawer(task.id);
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

  // -------- Activity View --------
  function renderActivityView() {
    const root = document.getElementById("gt-activity-root");
    if (!root) return;

    const fieldLabels = { title: "Title", status: "Status", assignee: "Assignee", updatedAt: "Updated" };
    const columns = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns
      : DEFAULT_COLUMNS;
    columns.forEach((c) => {
      fieldLabels[c.id] = c.label || c.id;
    });

    const tasksById = Object.fromEntries((APP_STATE.tasks || []).map((t) => [t.id, t]));
    const activity = (APP_STATE.activity || [])
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const fmtVal = (val) => {
      if (val === undefined || val === null) return "—";
      if (Array.isArray(val)) return val.join(", ") || "—";
      if (val === true) return "Yes";
      if (val === false) return "No";
      return String(val);
    };

    if (!activity.length) {
      root.innerHTML = `<div class="gt-muted">No activity yet</div>`;
      return;
    }

    const html = activity
      .map((a) => {
        const task = tasksById[a.taskId];
        const title = task?.title || "Untitled";
        const field = fieldLabels[a.field] || a.field || "Field";
        return `
          <div class="gt-activity-row">
            <div class="gt-activity-header">
              <div class="gt-activity-title">${title}</div>
              <div class="gt-activity-meta">${formatDateTimeShort(a.timestamp)} · ${a.user || "unknown"}</div>
            </div>
            <div class="gt-activity-change">
              <span class="gt-activity-field">${field}</span>
              <span class="gt-activity-arrow">→</span>
              <span class="gt-activity-before">${fmtVal(a.before)}</span>
              <span class="gt-activity-after">${fmtVal(a.after)}</span>
            </div>
          </div>
        `;
      })
      .join("");

    root.innerHTML = html;
  }

  // -------- Detail Drawer --------
  function closeDetailDrawer() {
    const drawer = document.getElementById("gt-detail-drawer");
    if (drawer) {
      drawer.classList.add("is-hidden");
      drawer.innerHTML = "";
    }
  }

  function openDetailDrawer(taskId) {
    const drawer = document.getElementById("gt-detail-drawer");
    if (!drawer) return;
    const task = APP_STATE.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const columns = (APP_STATE.columns && APP_STATE.columns.length)
      ? APP_STATE.columns
      : DEFAULT_COLUMNS;

    const statusOptions = getStatusOptions();
    const statusLabel = statusOptions.find((s) => s.id === (task.status || ""))?.label || "Status";
    const activity = (APP_STATE.activity || [])
      .filter((a) => a.taskId === task.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const getValue = (col) => {
      if (col.id === "title") return task.title || "";
      if (col.id === "status") return task.status || "";
      if (col.id === "assignee") return task.assigneeEmail || "";
      if (col.id === "updatedAt") return task.updatedAt || null;
      return (task.fields || {})[col.id];
    };

    const setValue = (col, val, prev) => {
      if (col.id === "title") task.title = val;
      else if (col.id === "status") task.status = val;
      else if (col.id === "assignee") task.assigneeEmail = val || null;
      else if (col.id !== "updatedAt") {
        task.fields = task.fields || {};
        task.fields[col.id] = val;
      }
      trackChange(task, col.id, prev, val);
      if (col.id === "status") {
        notifyStatusChange(task, prev, val);
      }
      if (col.id === "assignee") {
        notifyAssignment(task, val);
      }
      touch(task);
      renderTasks();
      renderBoardView();
    };

    const renderFieldControl = (col) => {
      const value = getValue(col);
      const prev = value;
      const wrapper = document.createElement("div");
      wrapper.className = "gt-drawer-field";
      const label = document.createElement("div");
      label.className = "gt-drawer-field-label";
      label.textContent = col.label;
      wrapper.appendChild(label);

      const controlHolder = document.createElement("div");
      controlHolder.className = "gt-drawer-field-control";

      const renderSelectOptions = (col) => {
        const opts = Array.isArray(col.options) ? col.options : [];
        return opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
      };

      switch (col.type) {
        case "autonumber": {
          controlHolder.innerHTML = `<span class="gt-pill">${value ?? ""}</span>`;
          break;
        }
        case "text": {
          const inp = document.createElement("input");
          inp.className = "gt-input";
          inp.value = value || "";
          inp.onchange = () => setValue(col, inp.value, prev);
          controlHolder.appendChild(inp);
          break;
        }
        case "long_text": {
          const ta = document.createElement("textarea");
          ta.className = "gt-textarea";
          ta.value = value || "";
          ta.onchange = () => setValue(col, ta.value, prev);
          controlHolder.appendChild(ta);
          break;
        }
        case "checkbox": {
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!value;
          cb.onchange = () => setValue(col, cb.checked, prev);
          controlHolder.appendChild(cb);
          break;
        }
        case "single_select": {
          const sel = document.createElement("select");
          sel.className = "gt-select";
          sel.innerHTML = `<option value="">Select…</option>` + renderSelectOptions(col);
          sel.value = value || "";
          const applyColor = () => {
            const optDef = (col.options || []).find((o) => o.id === sel.value);
            const spec = getColorSpec(optDef?.color);
            sel.style.background = spec.bg;
            sel.style.color = spec.text;
            sel.style.borderColor = spec.border;
          };
          applyColor();
          sel.onchange = () => setValue(col, sel.value || null, prev);
          sel.addEventListener("change", applyColor);
          controlHolder.appendChild(sel);
          break;
        }
        case "multi_select": {
          const sel = document.createElement("select");
          sel.className = "gt-select";
          sel.multiple = true;
          sel.size = 4;
          sel.innerHTML = renderSelectOptions(col);
          const selected = Array.isArray(value) ? value : [];
          Array.from(sel.options).forEach((o) => {
            o.selected = selected.includes(o.value);
          });
          sel.onchange = () => {
            const vals = Array.from(sel.selectedOptions).map((o) => o.value);
            setValue(col, vals, prev);
          };
          controlHolder.appendChild(sel);
          break;
        }
        case "user": {
          const sel = document.createElement("select");
          sel.className = "gt-select";
          sel.innerHTML = `<option value="">Unassigned</option>` +
            APP_STATE.staff.map((u) => `<option value="${u.email}">${u.name}</option>`).join("");
          sel.value = value || "";
          sel.onchange = () => setValue(col, sel.value || null, prev);
          controlHolder.appendChild(sel);
          break;
        }
        case "date": {
          const inp = document.createElement("input");
          inp.type = "date";
          inp.className = "gt-input";
          inp.value = value ? String(value).slice(0, 10) : "";
          inp.onchange = () => setValue(col, inp.value || null, prev);
          controlHolder.appendChild(inp);
          break;
        }
        case "number": {
          const inp = document.createElement("input");
          inp.type = "number";
          inp.className = "gt-input";
          inp.value = value ?? "";
          inp.onchange = () => {
            const next = inp.value === "" ? null : Number(inp.value);
            setValue(col, next, prev);
          };
          controlHolder.appendChild(inp);
          break;
        }
        case "barcode": {
          controlHolder.innerHTML = `<span class="gt-pill">${value || "—"}</span>`;
          break;
        }
        case "button": {
          const btn = document.createElement("button");
          btn.className = "gt-button";
          btn.textContent = "Open record";
          btn.onclick = () => openDetailDrawer(task.id);
          controlHolder.appendChild(btn);
          break;
        }
        case "formula":
        case "rollup":
        case "count":
        case "lookup": {
          controlHolder.innerHTML = `<span class="gt-muted">${value ?? "—"}</span>`;
          break;
        }
        case "created_time":
        case "last_modified_time": {
          controlHolder.innerHTML = `<span class="gt-tiny">${formatDateTimeShort(value)}</span>`;
          break;
        }
        case "created_by":
        case "last_modified_by": {
          controlHolder.innerHTML = `<span class="gt-pill gt-pill-soft">${value || "Unknown"}</span>`;
          break;
        }
        default: {
          const inp = document.createElement("input");
          inp.className = "gt-input";
          inp.value = value || "";
          inp.onchange = () => setValue(col, inp.value, prev);
          controlHolder.appendChild(inp);
        }
      }

      wrapper.appendChild(controlHolder);
      return wrapper;
    };

    const comments = task.comments || [];
    const commentsHtml = comments.length
      ? comments
          .map((c) => {
            const who = c.user || "Unknown";
            const when = formatDateTimeShort(c.timestamp);
            return `<div class="gt-comment-item"><div class="gt-comment-meta">${who} · ${when}</div><div class="gt-comment-text">${c.text}</div></div>`;
          })
          .join("")
      : `<div class="gt-muted">No comments yet</div>`;

    const activityHtml = activity.length
      ? activity
          .map((a) => `<div class="gt-activity-item"><div class="gt-activity-meta">${formatDateTimeShort(a.timestamp)} · ${a.user || "unknown"}</div><div class="gt-activity-text">${a.field}: ${a.before ?? ""} → ${a.after ?? ""}</div></div>`)
          .join("")
      : `<div class="gt-muted">No activity</div>`;

    drawer.innerHTML = `
      <div class="gt-drawer-backdrop" data-close="1"></div>
      <div class="gt-drawer-panel">
        <div class="gt-drawer-header">
          <div>
            <div class="gt-drawer-title">${task.title || "Untitled"}</div>
            <div class="gt-drawer-sub">${statusLabel}</div>
          </div>
          <div class="gt-drawer-actions">
            <button class="gt-button" id="gt-drawer-close">✕</button>
            <button class="gt-button gt-button-danger" id="gt-drawer-delete">Delete</button>
          </div>
        </div>

        <div class="gt-drawer-section">
          <h4>Fields</h4>
          <div id="gt-drawer-fields" class="gt-drawer-fields"></div>
        </div>

        <div class="gt-drawer-section">
          <h4>Comments</h4>
          <div id="gt-comments-list">${commentsHtml}</div>
          <div class="gt-comment-new">
            <textarea id="gt-comment-input" class="gt-textarea" rows="3" placeholder="Add a comment"></textarea>
            <button class="gt-button gt-button-primary" id="gt-comment-add">Add comment</button>
          </div>
        </div>

        <div class="gt-drawer-section">
          <h4>Activity</h4>
          <div id="gt-activity-list">${activityHtml}</div>
        </div>
      </div>
    `;

    drawer.classList.remove("is-hidden");

    const fieldsRoot = document.getElementById("gt-drawer-fields");
    if (fieldsRoot) {
      // render controls into root
      fieldsRoot.innerHTML = "";
      const frag = document.createDocumentFragment();
      columns.forEach((c) => frag.appendChild(renderFieldControl(c)));
      fieldsRoot.appendChild(frag);
    }

    const closeBtn = document.getElementById("gt-drawer-close");
    const delBtn = document.getElementById("gt-drawer-delete");
    const addCommentBtn = document.getElementById("gt-comment-add");
    const commentInput = document.getElementById("gt-comment-input");

    drawer.querySelectorAll(".gt-drawer-backdrop").forEach((b) => {
      b.onclick = closeDetailDrawer;
    });

    if (closeBtn) closeBtn.onclick = closeDetailDrawer;

    if (delBtn) {
      delBtn.onclick = () => {
        if (!confirm("Delete this task?")) return;
        APP_STATE.tasks = APP_STATE.tasks.filter((t) => t.id !== task.id);
        schedulePush();
        renderTasks();
        renderBoardView();
        if (APP_STATE.currentView === "dashboard" && canViewDashboard()) {
          renderDashboardView();
        }
        closeDetailDrawer();
      };
    }

    if (addCommentBtn && commentInput) {
      addCommentBtn.onclick = () => {
        const text = commentInput.value.trim();
        if (!text) return;
        const entry = {
          id: `c_${Math.random().toString(36).slice(2, 7)}`,
          text,
          user: APP_STATE.runtime.email || "unknown",
          timestamp: new Date().toISOString(),
        };
        task.comments = task.comments || [];
        task.comments.push(entry);
        commentInput.value = "";
        touch(task);
        openDetailDrawer(task.id); // re-render drawer to show new comment
      };
    }
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
    const grids = Array.isArray(APP_STATE.grids) ? APP_STATE.grids : [];
    const gridCards = grids.length
      ? grids
          .map(
            (g) => `<div class="gt-grid-card">
              <div class="gt-grid-card-title">${g.name || "Grid"}</div>
              <div class="gt-grid-card-meta">${Object.keys(g.filters || {}).length ? "Custom filters" : "No filters"}</div>
              <button class="gt-button gt-button-small" data-grid-open="${g.id}">Open</button>
            </div>`
          )
          .join("")
      : `<div class="gt-muted">No grids yet</div>`;

    const assignedHtml = buildDashboardTableHtml(assignedByDay);
    const completedHtml = buildDashboardTableHtml(completedByDay);

    root.innerHTML = `
      <div class="gt-dashboard-section">
        <h3 class="gt-dashboard-title">Grids in this workspace</h3>
        <p class="gt-dashboard-sub">Switch to any grid or add a new one from the Data view.</p>
        <div class="gt-grid-card-list">${gridCards}</div>
      </div>

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

    root.querySelectorAll("[data-grid-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-grid-open");
        setActiveView("table", { skipRender: true });
        setActiveGrid(id);
        renderViewTabs();
      });
    });
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
    task.updatedBy = APP_STATE.runtime.email || task.updatedBy || null;
    schedulePush();
  }

  function duplicateTask(taskId) {
    const original = APP_STATE.tasks.find((t) => t.id === taskId);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = `t_${Math.random().toString(36).slice(2)}`;
    copy.title = `${original.title || "Untitled"} Copy`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.completedAt = null;
    APP_STATE.tasks.push(copy);
    touch(copy);
    renderTasks();
    renderBoardView();
  }

  function assignTaskToSelf(taskId) {
    const me = APP_STATE.runtime.email || null;
    if (!me) {
      showToast("No user email found", "error");
      return;
    }
    const task = APP_STATE.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const prev = task.assigneeEmail || null;
    task.assigneeEmail = me;
    trackChange(task, "assignee", prev, me);
    notifyAssignment(task, me);
    touch(task);
    renderTasks();
    renderBoardView();
  }

  function addTask() {
    if (!APP_STATE.currentWorkspaceId) return;

    const now = new Date().toISOString();
    const task = {
      id: `t_${Math.random().toString(36).slice(2)}`,
      title: "New Task",
      status: "todo",
      assigneeEmail: APP_STATE.runtime.email || "",
      createdBy: APP_STATE.runtime.email || null,
      createdAt: now,
      updatedAt: now,
      updatedBy: APP_STATE.runtime.email || null,
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
    renderFiltersBar();
    updateWorkspaceShellVisibility();
    updateWorkspaceActionsVisibility();

    const addBtn = document.getElementById("gt-add-task");
    if (addBtn) addBtn.onclick = addTask;

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
