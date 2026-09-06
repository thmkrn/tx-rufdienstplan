// Netlify Function: /.netlify/functions/collection  (per netlify.toml auch unter /api/collection erreichbar)
// Listet alle Dokumente unter einem Schlüssel-Prefix aus der Supabase-Tabelle "rufdienst_kv" auf
// (wird für die Material-Bilder verwendet, die unter "materials/<id>" liegen).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(body, statusCode) {
  return {
    statusCode: statusCode || 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: "Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen als Umgebungsvariable)." }, 500);
  }

  const prefix = (event.queryStringParameters || {}).path;
  if (!prefix) return json({ error: "path fehlt" }, 400);
  const fullPrefix = prefix.endsWith("/") ? prefix : prefix + "/";

  const supaHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
  };

  const url = SUPABASE_URL + "/rest/v1/rufdienst_kv?key=like." + encodeURIComponent(fullPrefix + "*") + "&select=key,value";
  const res = await fetch(url, { headers: supaHeaders });
  if (!res.ok) return json({ error: "Supabase-Fehler " + res.status }, 502);
  const rows = await res.json();
  const docs = rows.map((r) => ({ id: r.key.slice(fullPrefix.length), data: r.value }));
  return json({ docs });
};
