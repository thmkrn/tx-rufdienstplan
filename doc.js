// Netlify Function: /.netlify/functions/doc  (per netlify.toml auch unter /api/doc erreichbar)
// Verwaltet einzelne JSON-Dokumente in einer Supabase-Tabelle "rufdienst_kv" (GET/PUT/DELETE).
// Benötigte Umgebungsvariablen in den Netlify-Site-Settings:
//   SUPABASE_URL               -> z. B. https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  -> Service-Role-Key aus Supabase (Settings -> API), NICHT der anon key
//   APP_PASSWORD (optional)    -> schützt Schreibzugriffe (PUT/DELETE) zusätzlich serverseitig

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_PASSWORD = process.env.APP_PASSWORD;

function json(body, statusCode) {
  return {
    statusCode: statusCode || 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function checkAuth(event) {
  if (!APP_PASSWORD) return true;
  const headers = event.headers || {};
  const header = headers["x-app-password"] || headers["X-App-Password"];
  return header === APP_PASSWORD;
}

function supaHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: "Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen als Umgebungsvariable)." }, 500);
  }

  const path = (event.queryStringParameters || {}).path;
  if (!path) return json({ error: "path fehlt" }, 400);

  if (event.httpMethod === "GET") {
    const url = SUPABASE_URL + "/rest/v1/rufdienst_kv?key=eq." + encodeURIComponent(path) + "&select=value";
    const res = await fetch(url, { headers: supaHeaders() });
    if (!res.ok) return json({ error: "Supabase-Fehler " + res.status }, 502);
    const rows = await res.json();
    if (!rows.length) return json({ exists: false });
    return json({ exists: true, data: rows[0].value });
  }

  if (event.httpMethod === "PUT") {
    if (!checkAuth(event)) return json({ error: "unauthorized" }, 401);
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return json({ error: "Body ist kein gültiges JSON" }, 400);
    }
    const url = SUPABASE_URL + "/rest/v1/rufdienst_kv";
    const res = await fetch(url, {
      method: "POST",
      headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: path, value: body, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: "Supabase-Fehler " + res.status + ": " + text }, 502);
    }
    return json({ ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!checkAuth(event)) return json({ error: "unauthorized" }, 401);
    const url = SUPABASE_URL + "/rest/v1/rufdienst_kv?key=eq." + encodeURIComponent(path);
    const res = await fetch(url, { method: "DELETE", headers: supaHeaders() });
    if (!res.ok) return json({ error: "Supabase-Fehler " + res.status }, 502);
    return json({ ok: true });
  }

  return json({ error: "Methode nicht erlaubt" }, 405);
};
