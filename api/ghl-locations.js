// api/ghl-locations.js
// Debug helper: list locations visible to your Private Integration Token (PIT)

const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

module.exports.config = {
  runtime: "nodejs",
};

function getPIT() {
  const key = process.env.GHL_PRIVATE_API_TOKEN;
  if (!key) {
    console.error(
      "[ghl-locations] Missing env var GHL_PRIVATE_API_TOKEN (your PIT)."
    );
    throw new Error("Missing GHL_PRIVATE_API_TOKEN");
  }
  return key;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let pit;
  try {
    pit = getPIT();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    const resp = await fetch(`${API_BASE}/locations/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pit}`,
        Accept: "application/json",
        Version: API_VERSION,
      },
    });

    const raw = await resp.text();
    let json;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn("[ghl-locations] Non-JSON response:", raw);
      json = {};
    }

    if (!resp.ok) {
      console.error("[ghl-locations] GHL error:", resp.status, json);
      return res.status(resp.status).json({
        ok: false,
        error: "Failed to fetch locations from GHL",
        status: resp.status,
        detail: json,
      });
    }

    // json might be { locations: [...] } or a raw array
    const list = Array.isArray(json.locations)
      ? json.locations
      : Array.isArray(json)
      ? json
      : [];

    const simplified = list.map((loc) => ({
      id: loc.id,
      name: loc.name,
      companyId: loc.companyId,
      domain: loc.domain,
    }));

    return res.status(200).json({
      ok: true,
      count: simplified.length,
      locations: simplified,
    });
  } catch (err) {
    console.error("[ghl-locations] unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error in /api/ghl-locations",
      detail: err.message || String(err),
    });
  }
};
