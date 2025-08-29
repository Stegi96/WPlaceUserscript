// ==UserScript==
// @name         Wplace ELAUBros Overlay Loader
// @namespace    https://github.com/Stegi96
// @version      1.0
// @description  Lädt alle Overlays aus einer JSON-Datei für Wplace.live, positioniert nach Pixel-URL, mit Menü und Transparenz-Slider
// @author       ELAUBros
// @match        https://wplace.live/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG_URL = "https://raw.githubusercontent.com/Stegi96/WPlaceUserscript/refs/heads/main/overlays.json";

    const overlays = {}; // gespeichert für Menüsteuerung

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

                    // Pixel-Koordinaten aus pixelUrl extrahieren
                    const match = overlay.pixelUrl.match(/x=(\d+)&y=(\d+)/);
                    if (!match) return;
                    const pixelX = parseInt(match[1]);
                    const pixelY = parseInt(match[2]);

                    // Overlay-Bild erstellen
                    const img = new Image();
                    img.src = overlay.imageUrl;
                    img.style.position = "absolute";
                    img.style.left = (pixelX + (overlay.offsetX || 0)) + "px";
                    img.style.top  = (pixelY + (overlay.offsetY || 0)) + "px";
                    img.style.opacity = overlay.opacity ?? 0.5;
                    img.style.pointerEvents = "none";
                    img.style.zIndex = 9999;
                    img.style.display = "none"; // startet unsichtbar
                    document.body.appendChild(img);

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
                        overlays[name].style.display = e.target.checked ? "block" : "none";
                    });

                    // Slider: Transparenz
                    slider.addEventListener("input", function(e) {
                        img.style.opacity = e.target.value;
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(slider);
                    menu.appendChild(wrapper);

                });

            } catch(e) {
                console.error("Fehler beim Parsen der Overlay JSON:", e);
            }
        }
    });

})();