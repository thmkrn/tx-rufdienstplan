# Rufdienstplan Team Thoraxorgane – Deployment auf Netlify (mit Supabase)

Da ihr die App über **Netlify** hochladet, nutzt sie hier – statt Cloudflare KV – dieselbe
Supabase-Anbindung wie Dienstplan Studis. Enthalten in diesem Ordner:

```
index.html                          -> die App selbst (unverändert)
netlify.toml                        -> leitet /api/* an die Functions weiter
netlify/functions/doc.js            -> Backend: einzelne Datensätze lesen/schreiben/löschen
netlify/functions/collection.js     -> Backend: Material-Bilder auflisten
```

## Schritt 1: Supabase-Tabelle anlegen

Im selben (oder einem neuen) Supabase-Projekt, im **SQL Editor**, folgendes ausführen:

```sql
create table if not exists rufdienst_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table rufdienst_kv enable row level security;
```

Die Tabelle ist bewusst getrennt von der `kv_store`-Tabelle von Dienstplan Studis, damit sich
beide Apps nicht in die Quere kommen. RLS ist aktiviert, aber es braucht **keine** Policies,
weil der Zugriff ausschließlich über den Service-Role-Key aus der Netlify Function läuft
(der umgeht RLS automatisch, ist aber nie im Browser sichtbar).

## Schritt 2: Umgebungsvariablen in Netlify setzen

Im Netlify-Dashboard: **Site configuration → Environment variables → Add a variable**

| Name | Wert |
|---|---|
| `SUPABASE_URL` | eure Supabase-Projekt-URL, z. B. `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-Role-Key aus Supabase (**Settings → API**) – nicht der `anon`-Key! |
| `APP_PASSWORD` | optional, z. B. `tx-rufdienst` – schützt Speichern/Löschen zusätzlich serverseitig |

**Wichtig zum Service-Role-Key:** Der hat vollen Zugriff auf eure Datenbank. Er wird nur
serverseitig in der Netlify Function verwendet und landet nie im Browser – trotzdem nicht
öffentlich teilen.

## Schritt 3: Erneut deployen

Diesen kompletten Ordner (inkl. `netlify.toml` und `netlify/functions`) so hochladen, wie ihr es
bei Dienstplan Studis schon gemacht habt (Drag-and-Drop im Netlify-Dashboard ersetzt die ganze
Seite inklusive Functions-Ordner). Nach dem Setzen der Umgebungsvariablen aus Schritt 2 einmal
**Trigger deploy** klicken, damit die Functions die Variablen sehen.

## Passwort ändern

Falls ihr bei `APP_PASSWORD` ein anderes Passwort als `tx-rufdienst` setzt, muss es auch im
Code an der Stelle `const PASSWORD = "tx-rufdienst";` in `index.html` angepasst werden – sonst
können sich Mitarbeitende zwar einloggen, aber nichts mehr speichern. Sag mir einfach Bescheid,
dann baue ich es ein.

## Wie die App danach synchronisiert

- Alle, die eure Netlify-URL öffnen, teilen sich denselben Datenstand (in Supabase gespeichert).
- Änderungen werden alle paar Sekunden automatisch nachgeladen (kein Echtzeit-Push, aber im
  Alltag kaum spürbar).
- PDF- und iCal-Export laufen als ganz normaler Browser-Download.

## Kalender abonnieren (neu)

Im Bereich „Verfügbarkeit" bekommt jede Person nach Auswahl ihres Namens eine eigene Abo-Adresse
(`.../api/ical?person=<id>&token=<zufälliges Token>`). Diese Adresse kann in Apple Kalender,
Google Kalender oder Outlook als **Kalender-Abo** hinzugefügt werden – die App liefert dort
automatisch aktuell die Tage, an denen die Person als Primär oder Backup eingeplant ist, direkt
aus Supabase generiert (Zeitraum: 4 Wochen zurück bis 16 Wochen voraus).

Das zufällige Token wird beim ersten Laden automatisch pro Person erzeugt und dauerhaft
gespeichert – ohne dieses Token liefert die Adresse nur einen Fehler 403. Ein normales
Passwort wäre hier technisch nicht möglich, weil Kalender-Apps beim automatischen Abrufen des
Abos keine eigenen Zugangsdaten mitschicken können; das Token übernimmt stattdessen den Schutz,
genau wie bei eurer bisherigen Dienstplan-Studis-App.

## Falls etwas nicht funktioniert

Öffnet im Browser die Entwicklertools (F12) → Netzwerk-Tab und schaut, ob Aufrufe zu
`/api/doc` oder `/api/collection` mit Fehler 500 zurückkommen – das deutet fast immer auf
fehlende oder falsche Umgebungsvariablen (Schritt 2) hin. Sagt mir einfach, was dort steht,
dann helfe ich weiter.
