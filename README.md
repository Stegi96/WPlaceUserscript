# Wplace ELAUBros Overlay Loader

Ein Tampermonkey‑Userscript, das Overlays für https://wplace.live direkt in die Kacheln rendert (wie „Overlay Pro“), inklusive UI, Transparenz‑Regler, Paletten‑Matching und drei Darstellungsmodi (Normal, Minify, Symbols).

## Features

- Overlay‑Quelle: Lädt mehrere Overlays aus einer JSON‑Datei (`overlays.json`).
- UI im Spiel: Checkbox zum Ein-/Ausschalten je Overlay, Slider für Opazität, Modus‑Dropdown.
- Paletten‑Matching: Mapped Overlay‑Farben auf die komplette Wplace‑Palette (Free + Paid) für exakte Farbvorschau.
- Alpha hart: Härtet halbtransparente Pixel (klare Kanten statt weicher Ränder).
- Modi (Dropdown „Modus“):
  - Normal: Zeichnet die (palette‑gemappte) Vorlage 1:1 in die Tile.
  - Minify: Zeichnet einen kleinen Farb‑Punkt im Zentrum jedes Overlay‑Pixels (intern 5× skaliert, dann herunterskaliert).
  - Symbols: Zeichnet farbige 5×5‑Symbole je Palettenfarbe (intern 7× skaliert, dann herunterskaliert) – wie Overlay Pro.
- Robust gegen Zoom/Pan: Es wird direkt in die geladenen Tile‑Bilder gerendert (nicht nur als DOM‑Overlay).

## Installation (Tampermonkey)

1) Tampermonkey im Browser installieren (Chrome, Edge, Firefox, Safari).
2) Das Userscript `elaubros-userscript.js` in Tampermonkey hinzufügen (per „Create a new script“ und Inhalt einfügen) oder per „Raw“-Link importieren.
3) Seite https://wplace.live öffnen/reloaden (ggf. hart neu laden: Ctrl/Cmd+Shift+R).

## Konfiguration (overlays.json)

Die Overlays werden aus einer JSON‑Datei geladen – standardmäßig aus diesem Repo (kann auf deinen Fork zeigen). Beispiel:

```json
{
  "version": 1,
  "overlays": [
    {
      "version": 1,
      "name": "emily",
      "imageUrl": "https://raw.githubusercontent.com/USER/REPO/BRANCH/images/emily.png",
      "pixelUrl": "https://backend.wplace.live/s0/pixel/1088/678?x=254&y=673",
      "offsetX": 0,
      "offsetY": 0,
      "opacity": 0.7
    }
  ]
}
```

- `imageUrl`: Bild muss öffentlich erreichbar sein (z. B. GitHub Raw; private Repos funktionieren nicht ohne Auth). Discord‑CDN geht auch; Token‑Links können auslaufen.
- `pixelUrl`: Anker‑Pixel auf dem Board. Aus `.../s0/pixel/<chunk1>/<chunk2>?x=<posX>&y=<posY>` werden Weltkoordinaten berechnet.
- Offsets/Opazität: Feintuning je Overlay.

## Bedienung im Spiel

- Öffne das Overlay‑Panel oben rechts.
- Checkbox je Overlay: Ein‑/Ausschalten.
- Slider: Opazität (wirkt in allen Modi auf das Overlay/Symbol).
- Palette‑Match: Ein/Aus – mapped Overlay‑Farben auf die Wplace‑Palette (empfohlen: Ein).
- Alpha hart: Ein/Aus – harte Kanten statt Halbdurchsichtigkeiten.
- Modus (Normal/Minify/Symbols):
  - Normal: Volle Vorlage in die Tiles (1:1).
  - Minify: Kleiner Punkt im Zentrum jedes Overlay‑Pixels.
  - Symbols: Farbiges 5×5‑Symbol je Palettenfarbe.

## Troubleshooting

- „Ich sehe keine Overlays“: UI prüfen (Checkbox aktiv?), Bild‑URL erreichbar? Konsole: „overlay image loaded …“ sollte erscheinen.
- „Hook greift nicht“: Script muss im Page‑Kontext laufen. In der Konsole sollten bei neuen Tiles „ELAUBros hook composing tile …“ Logs stehen. Bei Bedarf Injection Mode = page setzen und harten Reload durchführen.
- „Minify/Symbols zeigen nichts Neues“: Tiles sind gecached. Kurz pan/zoom, oder Service Worker (Application → Service Workers) „Unregister/Update“ und dann neu laden.
- „Farbabweichungen“: Palette‑Match einschalten (nutzt Free+Paid Palette). Falls exakt Free‑Only nötig, bitte Issue/PR erstellen (kann optional schaltbar gemacht werden).

## Entwicklungsnotizen

- Das Script nutzt Tampermonkey API (`GM_xmlhttpRequest`, `GM_addStyle`) und ersetzt Tile‑Responses über Hooks (`fetch`, zusätzlich `Image.src`).
- Es läuft früh (`document-start`) im **Page‑Kontext** (nicht Content‑Sandbox), damit Tile‑Requests interceptet werden können.
- Image‑Loading per GM_xhr → Data‑URL, um CORS‑Probleme zu vermeiden.

## Lizenz und Danksagung

- Teile der Paletten‑ und Symbol‑Daten sowie die Render‑Idee der Minify/Symbols‑Modi sind von „Wplace Overlay Pro“ (Autor: shinkonet) inspiriert bzw. adaptiert. Vielen Dank!
- Dieses Userscript steht unter **GPLv3** (wie das Referenzprojekt). Bitte Lizenzhinweise beibehalten.
