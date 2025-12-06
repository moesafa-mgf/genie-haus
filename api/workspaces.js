// api/workspaces.js
// CRUD for workspaces (Phase 1)

const postgres = require("postgres");

module.exports.config = { runtime: "nodejs" };

if (!process.env.DATABASE_URL) {
  console.error(
    "[workspaces] Missing DATABASE_URL env var. Set it in Vercel → Settings → Environment Variables."
  );
}

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { ssl: "require" })
  : null;

function parseJsonBody(req) {
  let body = req.body;
  // Vercel can hand us a Buffer; normalize to string first
  if (Buffer.isBuffer(body)) {
    body = body.toString("utf8");
  }
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      throw new Error("Invalid JSON in request body");
    }
  }
  if (!body) return {};
  if (typeof body === "object") return body;
  return {};
}

function getIdFromPath(req) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean); // [api, workspaces, :id?]
    return parts[2] || null;
  } catch (_) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (!sql) {
    return res
      .status(500)
      .json({ ok: false, error: "DATABASE_URL is not configured on the server" });
  }

  if (req.method === "GET") {
    const { locationId, userEmail } = req.query || {};
    if (!locationId) {
      return res.status(400).json({ ok: false, error: "locationId is required" });
    }

    try {
      let workspaces;

      if (userEmail) {
        // If the user has explicit roles, limit to those; otherwise return all
        const roleRows = await sql`
          SELECT workspace_id FROM workspace_roles
          WHERE location_id = ${locationId} AND user_email = ${userEmail.toLowerCase()}
        `;

        if (roleRows.length) {
          const ids = roleRows.map((r) => r.workspace_id);
          workspaces = await sql`
            SELECT id, location_id, name, icon_url, created_by, created_at, updated_at
            FROM workspaces
            WHERE location_id = ${locationId}
              AND archived_at IS NULL
              AND id = ANY (${sql.array(ids)})
            ORDER BY created_at ASC
          `;
        }
      }

      if (!workspaces) {
        workspaces = await sql`
          SELECT id, location_id, name, icon_url, created_by, created_at, updated_at
          FROM workspaces
          WHERE location_id = ${locationId} AND archived_at IS NULL
          ORDER BY created_at ASC
        `;
      }

      return res.status(200).json({ ok: true, workspaces });
    } catch (err) {
      console.error("[workspaces][GET] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (GET /api/workspaces)", detail: err.message });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = parseJsonBody(req);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    const { locationId, name, createdBy } = body;
    if (!locationId || !name) {
      return res.status(400).json({ ok: false, error: "locationId and name are required" });
    }

    try {
      const rows = await sql`
          INSERT INTO workspaces (location_id, name, icon_url, created_by)
          VALUES (${locationId}, ${name}, ${body.iconUrl || null}, ${createdBy || null})
        RETURNING id, location_id, name, icon_url, created_by, created_at, updated_at
      `;
      const workspace = rows[0];
      return res.status(201).json({ ok: true, workspace });
    } catch (err) {
      console.error("[workspaces][POST] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (POST /api/workspaces)", detail: err.message });
    }
  }

  if (req.method === "PATCH") {
    const id = getIdFromPath(req);
    if (!id) {
      return res.status(400).json({ ok: false, error: "Workspace id is required in path" });
    }

    let body;
    try {
      body = parseJsonBody(req);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

      const { name, iconUrl } = body;
      if (!name && typeof iconUrl === "undefined") {
        return res.status(400).json({ ok: false, error: "name or iconUrl is required" });
    }

    try {
      const rows = await sql`
        UPDATE workspaces
          SET
            name = COALESCE(${name}, name),
            icon_url = COALESCE(${iconUrl}, icon_url),
            updated_at = now()
        WHERE id = ${id} AND archived_at IS NULL
        RETURNING id, location_id, name, icon_url, created_by, created_at, updated_at
      `;

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Workspace not found" });
      }

      return res.status(200).json({ ok: true, workspace: rows[0] });
    } catch (err) {
      console.error("[workspaces][PATCH] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (PATCH /api/workspaces/:id)", detail: err.message });
    }
  }

  if (req.method === "DELETE") {
    const id = getIdFromPath(req);
    if (!id) {
      return res.status(400).json({ ok: false, error: "Workspace id is required in path" });
    }

    try {
      const rows = await sql`
        UPDATE workspaces
        SET archived_at = now(), updated_at = now()
        WHERE id = ${id} AND archived_at IS NULL
        RETURNING id
      `;

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Workspace not found" });
      }

      return res.status(200).json({ ok: true, archived: true, id });
    } catch (err) {
      console.error("[workspaces][DELETE] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (DELETE /api/workspaces/:id)", detail: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
