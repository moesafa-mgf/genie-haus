// api/ghl-users.js
// Fetch GHL users for a given location using your Private Integration Token (PIT)

const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

// Force Node.js runtime on Vercel (NOT Edge)
module.exports.config = {
  runtime: "nodejs",
};

function getPIT() {
  const key = process.env.GHL_PRIVATE_API_TOKEN;
  if (!key) {
    console.error(
      "[ghl-users] Missing env var GHL_PRIVATE_API_TOKEN (your PIT)."
    );
    throw new Error("Missing GHL_PRIVATE_API_TOKEN");
  }
  return key;
}

function normalizeUser(u) {
  if (!u) return null;
  const first = u.firstName || u.first_name || "";
  const last = u.lastName || u.last_name || "";
  const name =
    u.name ||
    `${first} ${last}`.trim() ||
    u.email ||
    "Unknown user";

  return {
    id: u.id,
    email: u.email || "",
    name,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { locationId } = req.query || {};
  if (!locationId) {
    return res
      .status(400)
      .json({ ok: false, error: "locationId query param is required" });
  }

  let pit;
  try {
    pit = getPIT();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    // 👇 CHANGE IS HERE: use /users?locationId= instead of /locations/{id}/users
    const url = `${API_BASE}/users/?locationId=${encodeURIComponent(
      locationId
    )}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Accept: "application/json",
        Version: API_VERSION,
      },
    });

    const rawText = await resp.text();
    let json;
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch (err) {
      console.warn("[ghl-users] Non-JSON response from GHL:", rawText);
      json = {};
    }

    if (!resp.ok) {
      console.error(
        "[ghl-users] GHL returned error:",
        resp.status,
        JSON.stringify(json)
      );
      return res.status(resp.status).json({
        ok: false,
        error: "Failed to fetch users from GHL",
        status: resp.status,
        detail: json,
      });
    }

    const list = Array.isArray(json.users)
      ? json.users
      : Array.isArray(json)
      ? json
      : [];

    const staff = list.map(normalizeUser).filter((u) => u && u.email);

    return res.status(200).json({
      ok: true,
      locationId,
      count: staff.length,
      staff,
    });
  } catch (err) {
    console.error("[ghl-users] unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error in /api/ghl-users",
      detail: err.message || String(err),
    });
  }
};
