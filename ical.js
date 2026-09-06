// Netlify Function: /.netlify/functions/ical?person=<id>&token=<calendarToken>  (per netlify.toml auch unter /api/ical)
// Liefert einen öffentlich abonnierbaren iCal-Feed (text/calendar) mit den Rufdiensten
// (Primär + Backup) einer Person, live aus Supabase generiert - nach dem Vorbild der
// ics-feed.js aus der PHV-Dienstplan-App, inkl. Absicherung per Token (kein Passwort,
// da Kalender-Apps beim Abonnieren keine eigenen Header mitschicken können) und einem
// rollierenden Zeitfenster statt der kompletten Historie. Zusätzlich mit Materialwarnung
// im Termintext.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEEKS_BACK = 4;
const WEEKS_FORWARD = 16;

function pad(n) { return String(n).padStart(2, "0"); }
function dstr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function parseDstr(s) { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; }
function toDate(s) { const { y, m, d } = parseDstr(s); return new Date(Date.UTC(y, m, d)); }
function addDaysStr(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return dstr(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function todayStr() { const t = new Date(); return dstr(t.getFullYear(), t.getMonth(), t.getDate()); }
function icsDateFmt(s) { return s.replace(/-/g, ""); }
function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }

function materialTotal(m) { return (m.batches || []).reduce((sum, b) => sum + b.qty, 0); }
function isUnderstock(m) { return (m.minQty || 0) > 0 && materialTotal(m) < m.minQty; }

function buildIcsForPerson(data, personId) {
  const understocked = (data.materials || []).filter(isUnderstock);
  const warningLine = understocked.length > 0
    ? "ACHTUNG: " + understocked.length + " Material(ien) aktuell unter Mindestmenge (" + understocked.map((m) => m.name).join(", ") + "). Bitte Material-Tab pruefen."
    : "";

  const rangeStart = addDaysStr(todayStr(), -WEEKS_BACK * 7);
  const rangeEnd = addDaysStr(todayStr(), WEEKS_FORWARD * 7);
  const inRange = (ds) => ds >= rangeStart && ds <= rangeEnd;

  const primaryDates = Object.entries(data.assignments || {}).filter(([ds, pid]) => pid === personId && inRange(ds)).map(([ds]) => ds).sort();
  const backupDates = Object.entries(data.backupAssignments || {}).filter(([ds, pid]) => pid === personId && inRange(ds)).map(([ds]) => ds).sort();

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Team Thoraxorgane//Rufdienstplan//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Rufdienst Team Thoraxorgane"];

  function addEvent(dateStr, summary) {
    const nextDay = addDaysStr(dateStr, 1);
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + dateStr + "-" + personId + "-" + summary.replace(/\s+/g, "") + "@rufdienstplan.thoraxorgane");
    lines.push("DTSTAMP:" + icsDateFmt(todayStr()) + "T000000Z");
    lines.push("DTSTART;VALUE=DATE:" + icsDateFmt(dateStr));
    lines.push("DTEND;VALUE=DATE:" + icsDateFmt(nextDay));
    lines.push("SUMMARY:" + icsEscape(summary));
    lines.push("DESCRIPTION:" + icsEscape(warningLine || "Rufdienst Team Thoraxorgane"));
    lines.push("END:VEVENT");
  }

  primaryDates.forEach((ds) => addEvent(ds, "Rufdienst"));
  backupDates.forEach((ds) => addEvent(ds, "Rufdienst (Backup)"));

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const personId = params.person;
  const token = params.token;
  if (!personId || !token) return { statusCode: 400, body: "person oder token fehlt" };
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: "Supabase ist nicht konfiguriert." };
  }

  const url = SUPABASE_URL + "/rest/v1/rufdienst_kv?key=eq.app%2Fstate&select=value";
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
  });
  if (!res.ok) return { statusCode: 502, body: "Fehler beim Laden der Daten" };
  const rows = await res.json();
  if (!rows.length) return { statusCode: 404, body: "Noch keine Daten vorhanden" };

  const data = rows[0].value;
  const person = (data.members || []).find((m) => m.id === personId);
  if (!person || !person.calendarToken || person.calendarToken !== token) {
    return { statusCode: 403, body: "Ungueltiger oder abgelaufener Link." };
  }

  const ics = buildIcsForPerson(data, personId);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="rufdienst.ics"',
      "Cache-Control": "no-cache, max-age=0",
    },
    body: ics,
  };
};
