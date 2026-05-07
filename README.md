# Packliste

Persönliche Packlisten-App als PWA – installierbar auf Android, läuft offline.

## Features

- **Vorlagen** wiederverwenden: Eine konkrete Reise wird aus einer Vorlage abgeleitet (z. B. „Geschäftsreise" → „Berlin Mai"). Items aus der Vorlage werden in die Reise kopiert; zusätzliche lassen sich ergänzen.
- **Kategorien**: Standardsatz mitgeliefert (Kleidung, Hygiene, Elektronik, Dokumente, Medikamente, Sonstiges). Frei umbenennbar/erweiterbar.
- **Item-Bibliothek mit Häufigkeitsranking**: Jedes je benutzte Item bleibt in der Bibliothek. Autocomplete + durchsuchbare Liste sortieren nach `usageCount`.
- **Mengen** pro Item (Default 1, in der Liste editierbar).
- **Backup / Restore** als JSON-Datei (Settings → Daten).
- **Offline** und installierbar via Service Worker.
- **Dark Mode** automatisch nach Systemeinstellung.

## Tech-Stack

- Vue 3 (Composition API) · Vite · Pinia · Vue Router 4
- Dexie.js über IndexedDB
- Tailwind CSS
- vite-plugin-pwa (Workbox)
- Vitest (+ fake-indexeddb) für Logik-Tests

## Entwicklung

```sh
npm install
npm run dev            # http://localhost:5173
npm test               # Vitest – DB- + Store-Logik
npm run build          # Produktions-Build (PWA inkl. Service Worker)
npm run preview        # Build lokal servieren
npm run icons          # PWA-Icons aus SVG neu generieren
```

## Datenmodell (Kurzfassung)

Sechs IndexedDB-Stores:

- `items` (Bibliothek), `categories`, `templates`, `template_items`, `trips`, `trip_items`.

Jedes Item existiert in `items` genau einmal; `template_items` und `trip_items` referenzieren per FK. Beim Hinzufügen wird `items.usageCount` erhöht — daraus speist sich Autocomplete und Sortierung.

## Auf Android installieren

1. App-URL im **Chrome auf dem Handy** öffnen.
2. Menü „⋮" → **„Zum Startbildschirm hinzufügen"**.
3. Vom Homescreen starten – läuft im Vollbild ohne Browser-UI, auch offline.

## Verifikation

Siehe Plan-Datei (`%USERPROFILE%\.claude\plans\erstelle-mir-bitte-eine-effervescent-bubble.md`) für die End-to-End-Smoke-Tests.
