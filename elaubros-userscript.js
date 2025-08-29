// ==UserScript==
// @name         Wplace ELAUBros Overlay Loader
// @namespace    https://github.com/Stegi96
// @version      1.9
// @description  Lädt alle Overlays aus einer JSON-Datei für Wplace.live, positioniert nach Pixel-URL, mit Menü und Transparenz-Slider, korrekt auf dem Spielfeld
// @author       ELAUBros
// @match        https://wplace.live/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG_URL = "https://raw.githubusercontent.com/Stegi96/WPlaceUserscript/refs/heads/main/overlays.json";
    const TILE_SIZE = 1000; // wie Overlay Pro
    const overlays = {}; // für Menüsteuerung und Repositionierung

    // Hilfsfunktion: Canvas finden
    function findWplaceCanvas() {
        const canvases = Array.from(document.getElementsByTagName('canvas'));
        if (canvases.length === 0) return null;
        return canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    }

    // Overlay-Layer direkt nach dem Canvas einfügen und exakt synchronisieren
    function positionOverlayOnCanvas(img) {
        const pixelX = parseInt(img.dataset.pixelX);
        const pixelY = parseInt(img.dataset.pixelY);
        const offsetX = parseInt(img.dataset.offsetX) || 0;
        const offsetY = parseInt(img.dataset.offsetY) || 0;

        const canvas = findWplaceCanvas();
        if (!canvas) return;

        // Overlay-Layer erzeugen (nur einmal, als Geschwister vom Canvas)
        let overlayLayer = document.getElementById("elaubros-overlay-layer");
        if (!overlayLayer) {
            overlayLayer = document.createElement("div");
            overlayLayer.id = "elaubros-overlay-layer";
            overlayLayer.style.position = "absolute";
            overlayLayer.style.pointerEvents = "none";
            overlayLayer.style.zIndex = 999999;
            // Direkt nach dem Canvas einfügen
            canvas.parentElement.insertBefore(overlayLayer, canvas.nextSibling);
        }

        // Exakte Position und Größe des Canvas im Dokument bestimmen
        const rect = canvas.getBoundingClientRect();
        const docLeft = window.scrollX + rect.left;
        const docTop = window.scrollY + rect.top;

        overlayLayer.style.left = docLeft + "px";
        overlayLayer.style.top = docTop + "px";
        overlayLayer.style.width = rect.width + "px";
        overlayLayer.style.height = rect.height + "px";

        // Transformation übernehmen (wichtig!)
        const style = window.getComputedStyle(canvas);
        overlayLayer.style.transform = style.transform;
        overlayLayer.style.transformOrigin = style.transformOrigin;

        // Overlay-Bild einfügen (nur einmal)
        if (img.parentElement !== overlayLayer) {
            overlayLayer.appendChild(img);
            img.style.position = "absolute";
            img.style.pointerEvents = "none";
            img.style.zIndex = 1;
        }

        // Overlay-Bild exakt auf die gewünschte Pixelposition legen
        img.style.left = (pixelX + offsetX) + "px";
        img.style.top = (pixelY + offsetY) + "px";
        img.style.transform = ""; // kein eigenes scale!
        img.style.transformOrigin = "top left";
    }

    // Hilfsfunktion: Kamera-Infos holen (wie Overlay Pro)
    function getCamera() {
        try {
            const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
            if (w.store && w.store.state && w.store.state.camera) {
                return w.store.state.camera;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    // Positionierung wie Overlay Pro: Weltkoordinaten → Bildschirmkoordinaten
    function positionOverlayLikeOverlayPro(img) {
        const overlayX = parseInt(img.dataset.pixelX) + (parseInt(img.dataset.offsetX) || 0);
        const overlayY = parseInt(img.dataset.pixelY) + (parseInt(img.dataset.offsetY) || 0);

        const camera = getCamera();
        if (!camera) {
            // Fallback: Lege einfach im Canvas-Koordinatensystem ab (ggf. ungenau bei Zoom)
            return positionOverlayOnCanvas(img);
        }

        // Finde das Spielfeld-Canvas
        const canvas = findWplaceCanvas();
        if (!canvas) return;

        // Viewport-Rechteck des Canvas (CSS-Pixel)
        const rect = canvas.getBoundingClientRect();

        // Berechne Bildschirmposition in CSS-Pixeln; Kamera-Ursprung kann center oder top-left sein.
        let scale = camera.scale || 1;
        let camX = camera.x;
        let camY = camera.y;
        // Heuristik: Kamera-Koordinaten ggf. von Chunk- in Weltpixel umrechnen
        if (Math.abs(overlayX) > TILE_SIZE * 10 && Math.abs(camX) < TILE_SIZE * 10) {
            camX *= TILE_SIZE;
            camY *= TILE_SIZE;
        }
        const centerOffsetX = rect.width / 2;
        const centerOffsetY = rect.height / 2;
        const sxCenter = (overlayX - camX) * scale + centerOffsetX;
        const syCenter = (overlayY - camY) * scale + centerOffsetY;
        const sxTL = (overlayX - camX) * scale;
        const syTL = (overlayY - camY) * scale;
        // Wähle die Variante, die im sichtbaren Canvas liegt, falls möglich
        const inRectCenter = sxCenter >= 0 && syCenter >= 0 && sxCenter <= rect.width && syCenter <= rect.height;
        const inRectTL = sxTL >= 0 && syTL >= 0 && sxTL <= rect.width && syTL <= rect.height;
        const screenX = inRectCenter || !inRectTL ? sxCenter : sxTL;
        const screenY = inRectCenter || !inRectTL ? syCenter : syTL;

        // Overlay-Layer erzeugen (global, fixiert im Viewport)
        let overlayLayer = document.getElementById("elaubros-overlay-layer");
        if (!overlayLayer) {
            overlayLayer = document.createElement("div");
            overlayLayer.id = "elaubros-overlay-layer";
            overlayLayer.style.position = "fixed";
            overlayLayer.style.pointerEvents = "none";
            overlayLayer.style.zIndex = 9999;
            document.body.appendChild(overlayLayer);
        }

        // Overlay-Layer exakt über das Canvas im Viewport platzieren (in Seitenkoordinaten)
        overlayLayer.style.left = rect.left + "px";
        overlayLayer.style.top = rect.top + "px";
        overlayLayer.style.width = rect.width + "px";
        overlayLayer.style.height = rect.height + "px";
        // WICHTIG: keine CSS-Transformation übernehmen – wir rechnen die Kamera selbst ein
        overlayLayer.style.transform = "none";
        overlayLayer.style.transformOrigin = "top left";

        // Overlay-Bild einfügen (nur einmal)
        if (img.parentElement !== overlayLayer) {
            overlayLayer.appendChild(img);
            img.style.position = "absolute";
            img.style.pointerEvents = "none";
            img.style.zIndex = 1;
            img.style.imageRendering = "pixelated";
        }

        // Overlay-Bild exakt auf die berechnete Position legen
        if (!img.dataset._elaubros_logged) {
            try {
                console.log("ELAUBros overlay", {
                    name: img.alt || "",
                    overlayX, overlayY, scale,
                    camera: { x: camera.x, y: camera.y, scale: camera.scale },
                    usedCam: { x: camX, y: camY, scale },
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                    screen: { x: screenX, y: screenY },
                    used: (inRectCenter || !inRectTL) ? "center" : "top-left"
                });
            } catch(e) {}
            img.dataset._elaubros_logged = "1";
        }
        img.style.left = `${Math.round(screenX)}px`;
        img.style.top = `${Math.round(screenY)}px`;
        img.style.transform = `scale(${scale})`;
        img.style.transformOrigin = "top left";
    }

    // Menü erstellen
    const menu = document.createElement("div");
    menu.id = "elaubros-menu";
    menu.innerHTML = `<strong>ELAUBros Overlays</strong> <button id="elaubros-toggle">–</button><br>`;
    document.body.appendChild(menu);

    GM_addStyle(`
        #elaubros-menu {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 10px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            max-width: 220px;
        }
        #elaubros-menu label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 5px 0;
        }
        #elaubros-menu input[type="checkbox"] {
            margin-right: 6px;
        }
        #elaubros-menu input[type="range"] {
            width: 100%;
            margin-top: 3px;
        }
        #elaubros-menu button {
            float: right;
            background: #444;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    `);

    // Menü minimieren/maximieren
    document.getElementById("elaubros-toggle").addEventListener("click", function() {
        const children = Array.from(menu.children).slice(1); // erstes Element ist Titel
        children.forEach(el => el.style.display = (el.style.display === "none" ? "block" : "none"));
        this.textContent = this.textContent === "–" ? "+" : "–";
    });

    // JSON laden
    GM_xmlhttpRequest({
        method: "GET",
        url: CONFIG_URL,
        onload: function(response) {
            try {
                const config = JSON.parse(response.responseText);
                if (!config.overlays) return;

                config.overlays.forEach((overlay, index) => {
                    // Vollständige Koordinaten (Chunk + Position) aus pixelUrl extrahieren
                    // Beispiel: https://backend.wplace.live/s0/pixel/1088/678?x=254&y=673
                    const full = overlay.pixelUrl || "";
                    const m = full.match(/\/pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/);
                    if (!m) return;
                    const chunk1 = parseInt(m[1], 10);
                    const chunk2 = parseInt(m[2], 10);
                    const posX = parseInt(m[3], 10);
                    const posY = parseInt(m[4], 10);
                    const pixelX = chunk1 * TILE_SIZE + posX;
                    const pixelY = chunk2 * TILE_SIZE + posY;

                    // Overlay-Bild erstellen
                    const img = new Image();
                    img.src = overlay.imageUrl;
                    img.style.opacity = overlay.opacity ?? 0.5;
                    img.style.display = "none"; // startet unsichtbar

                    // Koordinaten für spätere Repositionierung speichern
                    img.dataset.pixelX = String(pixelX);
                    img.dataset.pixelY = String(pixelY);
                    img.dataset.offsetX = overlay.offsetX || 0;
                    img.dataset.offsetY = overlay.offsetY || 0;

                    overlays[overlay.name || `Overlay ${index+1}`] = img;

                    // Menü-Eintrag
                    const wrapper = document.createElement("div");

                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.dataset.overlay = overlay.name;

                    const labelText = document.createElement("span");
                    labelText.textContent = overlay.name;

                    const label = document.createElement("label");
                    label.appendChild(checkbox);
                    label.appendChild(labelText);

                    const slider = document.createElement("input");
                    slider.type = "range";
                    slider.min = "0";
                    slider.max = "1";
                    slider.step = "0.05";
                    slider.value = img.style.opacity;

                    // Checkbox: Sichtbarkeit
                    checkbox.addEventListener("change", function(e) {
                        const name = e.target.dataset.overlay;
                        const img = overlays[name];
                        img.style.display = e.target.checked ? "block" : "none";
                        if (e.target.checked) {
                            positionOverlayLikeOverlayPro(img);
                        }
                    });

                    // Slider: Transparenz
                    slider.addEventListener("input", function(e) {
                        img.style.opacity = e.target.value;
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(slider);
                    menu.appendChild(wrapper);
                });

                // Repositioniere Overlays regelmäßig (z.B. alle 200ms)
                setInterval(() => {
                    Object.values(overlays).forEach(img => {
                        if (img.style.display !== "none") {
                            positionOverlayLikeOverlayPro(img);
                        }
                    });
                }, 200);

                window.addEventListener("resize", () => {
                    Object.values(overlays).forEach(img => {
                        if (img.style.display !== "none") {
                            positionOverlayLikeOverlayPro(img);
                        }
                    });
                });

            } catch(e) {
                console.error("Fehler beim Parsen der Overlay JSON:", e);
            }
        }
    });

})();
