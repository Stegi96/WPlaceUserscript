// ==UserScript==
// @name         Wplace.live Overlay Loader (ELAUBros)
// @namespace    https://github.com/ELAUBros
// @version      1.0
// @description  Lädt mehrere Overlays aus einer JSON-Datei für Wplace.live
// @author       ELAUBros
// @match        https://wplace.live/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG_URL = "https://raw.githubusercontent.com/Stegi96/WPlaceUserscript/refs/heads/main/overlays.json";

    function loadJSON(url, callback) {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    callback(data);
                } catch (e) {
                    console.error("Fehler beim Parsen der JSON:", e);
                }
            }
        });
    }

    function addOverlays(config) {
        if (!config.overlays) return;

        config.overlays.forEach(overlay => {
            const img = new Image();
            img.src = overlay.imageUrl;
            img.style.position = "absolute";
            img.style.left = overlay.offsetX + "px";
            img.style.top = overlay.offsetY + "px";
            img.style.opacity = overlay.opacity ?? 0.5;
            img.style.pointerEvents = "none";
            img.style.zIndex = 9999;
            document.body.appendChild(img);
            console.log(`Overlay geladen: ${overlay.name}`);
        });
    }

    loadJSON(CONFIG_URL, addOverlays);

})();