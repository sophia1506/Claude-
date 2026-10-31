# Mondzeit – Datenformat (für Export, Import & „Brains 0.2")

Ein Backup ist eine einzelne JSON-Datei (`mondzeit-backup-YYYY-MM-DD.json`).
Alle Datumsangaben sind **lokale Kalendertage** im Format `YYYY-MM-DD`.

```jsonc
{
  "format": "mondzeit-backup",      // Erkennungsmerkmal
  "schemaVersion": 1,               // wird bei inkompatiblen Änderungen erhöht
  "exportedAt": "2026-10-31T19:12:00.000Z",
  "app": { "name": "Mondzeit", "version": "1.0.0" },

  "settings": {
    "theme": "light",               // "light" | "dark" | "auto"
    "defaultCycleLength": 28,
    "defaultPeriodLength": 5,
    "reminder": { "enabled": true, "time": "20:30" },
    "pill": {
      "enabled": false,
      "type": "21_7",               // "21_7" | "24_4" | "28_placebo" | "continuous"
      "packStart": "2026-10-01",    // erste Pille des Blisters (oder null)
      "reminderEnabled": true,
      "reminderTime": "21:00"
    },
    "lastBackup": "2026-10-31T19:12:00.000Z"
  },

  "symptomCatalog": [
    { "id": "cramps", "label": "Krämpfe", "custom": false },
    { "id": "s_lx2abc", "label": "Rückenschmerzen", "custom": true }
  ],

  // Perioden als Zeiträume. end = null → läuft noch.
  "periods": [
    { "id": "p_lx1...", "start": "2026-10-03", "end": "2026-10-07" }
  ],

  // Ein Eintrag pro Tag; alle Felder optional (null / leer = nicht erfasst).
  "days": [
    {
      "date": "2026-10-03",
      "flow": "medium",             // "light" | "medium" | "heavy" | null  (nur an Periodentagen sinnvoll)
      "symptoms": ["cramps", "fatigue"],   // IDs aus symptomCatalog
      "mood": 3,                    // 1–5
      "energy": 2,                  // 1–5
      "focus": 2,                   // 1–5  (wie gut konnte ich lernen / mich konzentrieren)
      "sleepQuality": 4,            // 1–5
      "sleepHours": 7.5,            // Zahl oder null
      "meds": [{ "id": "m_...", "name": "Ibuprofen", "time": "09:30" }],
      "pillTaken": true,            // true | null
      "note": "",
      "updatedAt": "2026-10-03T20:31:00.000Z"
    }
  ],

  // Abgeleitete Werte – beim Import ignoriert. Praktisch für andere Apps,
  // die die Zykluslogik nicht nachbauen wollen.
  "derived": {
    "generatedFor": "2026-10-31",
    "pillMode": false,
    "cycles": [
      { "start": "2026-09-05", "end": "2026-10-02", "length": 28, "periodLength": 5, "excludedFromAverage": false }
    ],
    "averages": { "cycleLength": 28.5, "cycleLengthSD": 1.9, "periodLength": 4.8, "cyclesCounted": 6, "irregular": false },
    "prediction": {
      "nextPeriodMostLikely": "2026-11-13",
      "windowStart": "2026-11-11",
      "windowEnd": "2026-11-15",
      "confidence": "gut",           // "niedrig" | "mittel" | "gut"
      "isEstimate": true,
      "notContraception": true
    },
    "today": { "date": "2026-10-31", "cycleDay": 29, "phase": "luteal", "phaseLabel": "Lutealphase" }
  }
}
```

## Phasen-IDs
`menstruation`, `follicular`, `ovulation`, `luteal` – im Pillen-Modus gibt es keine Phasen (`today` ist dann `null`).

## Ideen für die Anbindung an Brains 0.2
- **Einfachster Weg:** In Brains eine Import-Funktion für diese JSON-Datei bauen und z. B. `derived.today.phase` und `days[].focus` nutzen, um Lernblöcke zu planen.
- **Gleiche Domain:** Wenn beide Apps unter derselben Adresse laufen (z. B. `deinname.github.io/mondzeit` und `deinname.github.io/brains`), teilen sie sich die IndexedDB des Origins. Brains könnte die Datenbank `mondzeit` (Stores `days`, `periods`, `meta`) dann direkt **lesend** öffnen – ganz ohne Export.
- Die Berechnungslogik steckt in `js/cycle.js` (reine Funktionen ohne Abhängigkeiten) und kann 1:1 in Brains wiederverwendet werden.
