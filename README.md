# Mondzeit 🌙 – persönlicher Periodentracker (PWA)

Privat, offline, nur auf deinem Gerät. Kein Konto, keine Cloud, kein Tracking.

## Funktionen
- **Ein-Tap-Eintrag:** großer Button „Periode heute" / „Periode vorbei" (mit Rückgängig bzw. „War gestern")
- **Optional pro Tag:** Stärke, Symptome (+ eigene), Stimmung, Energie, Fokus, Schlaf (Qualität + Stunden), Schmerzmittel mit Uhrzeit, Pille, Notiz
- **Kalender** mit Periode, Vorhersage, Zeitfenster, Zyklusphasen und Pillenpausen
- **Vorhersage als Zeitfenster:** robuster Durchschnitt der letzten 6 Zyklen (Ausreißer werden gedämpft, Lücken über 90 Tage ignoriert); das Fenster wird breiter, je unregelmäßiger dein Zyklus ist
- **Phasen-Tipps** fürs Lernen und für deine Energie
- **Statistik:** Ø Zyklus- und Periodenlänge, Schwankung, Zykluslängen-Diagramm, häufigste Symptome pro Phase, Verlauf von Stimmung/Energie/Fokus/Schlaf über den Zyklus
- **Pillen-Modus:** tägliches Abhaken, Pillenpause, Hinweis auf Abbruchblutung, keine Phasen-Vorhersagen
- **Backup:** Export/Import als JSON ([Format](DATENFORMAT.md)), Backup-Erinnerung nach 14 Tagen
- **Hell/Dunkel/Automatisch**

## Tech-Struktur
Vanilla JavaScript (ES-Module), kein Framework, kein Build-Schritt, keine Abhängigkeiten.

```
index.html            App-Gerüst + Navigation
manifest.webmanifest  PWA-Manifest (Name, Icons, Standalone)
sw.js                 Service Worker (Offline-Cache)
css/styles.css        Design (Farb-Tokens für Hell/Dunkel)
js/app.js             Start, Routing, Rendering
js/db.js              IndexedDB-Zugriff
js/store.js           Zustand + alle Schreiboperationen (Perioden, Tage, Einstellungen)
js/cycle.js           Zykluslogik: Statistik, Vorhersage, Phasen, Pille, Tipps (reine Funktionen)
js/context.js         Abgeleitete Daten pro Render + Auswertungen für Statistik
js/backup.js          JSON-Export/-Import
js/reminders.js       In-App-Erinnerungen + Kalender-Datei (.ics)
js/charts.js          SVG-Diagramme
js/ui.js              Toast, Bottom-Sheet, Skalen
js/views/*.js         Heute, Kalender, Statistik, Einstellungen, Tageseintrag
tests/cycle.test.mjs  Tests der Zykluslogik (node tests/cycle.test.mjs)
```

## Lokal ausprobieren
```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```
(Direkt per Doppelklick auf `index.html` geht es nicht – ES-Module und Service Worker brauchen einen Webserver.)

## Hosten
**GitHub Pages:** Repository → *Settings* → *Pages* → *Source: Deploy from a branch* → Branch wählen (z. B. `main`), Ordner `/ (root)` → *Save*. Nach ca. 1 Minute läuft die App unter `https://<benutzername>.github.io/<repo>/`.

**Netlify:** Auf [app.netlify.com/drop](https://app.netlify.com/drop) den Projektordner per Drag & Drop hochladen – fertig. Oder das GitHub-Repo verbinden (Build-Befehl leer lassen, Publish-Verzeichnis `/`).

Beides ist kostenlos und liefert HTTPS (für PWAs nötig). Der Server liefert nur die App-Dateien aus – **deine Daten verlassen nie dein Handy**.

**Updates:** Nach Änderungen an App-Dateien in `sw.js` die `VERSION` hochzählen. Die App zeigt dann „Neue Version verfügbar".

## Aufs Handy
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm" → Hinzufügen.
- **Android (Chrome):** Seite öffnen → Menü ⋮ → „App installieren" bzw. „Zum Startbildschirm hinzufügen".

Wichtig auf dem iPhone: Nutze die App über das Home-Bildschirm-Symbol. Safari kann Daten von Websites löschen, die länger nicht besucht wurden – installierte Web-Apps sind davon ausgenommen. Trotzdem: regelmäßig Backups machen.

## Erinnerungen – ehrlich
Eine App ohne Server kann **keine zuverlässigen Benachrichtigungen** schicken, wenn sie geschlossen ist. Web-Push (auch auf dem iPhone ab iOS 16.4) braucht immer einen Server, der die Nachricht verschickt. Deshalb:
1. **In-App-Hinweis** beim Öffnen ab deiner Erinnerungszeit (bzw. „Gestern nachtragen?").
2. **Kalender-Erinnerung (.ics):** In den Einstellungen ein Tap → täglicher Termin mit Alarm in deinem Handy-Kalender. Für die Pille werden Pausentage automatisch ausgelassen.
3. **Kurzbefehle (iPhone):** Automation „Tageszeit" → „App öffnen: Mondzeit". Oder ein Wecker / die Erinnerungen-App.

## Hinweis
Vorhersagen und Phasen sind Schätzungen. **Keine Verhütungsmethode** und kein Ersatz für ärztlichen Rat.
