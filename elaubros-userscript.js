// ==UserScript==
// @name         Wplace ELAUBros Overlay Loader
// @namespace    https://github.com/Stegi96
// @version      1.15
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
    const overlays = {}; // { name: { img, worldX, worldY, offsetX, offsetY, opacity, enabled, processedCanvas } }
    const settings = { paletteMatch: true, alphaHarden: true, renderMode: 'normal', minifyScale: 3 };

    // Wplace-Palette (Free)
    const WPLACE_FREE = [
        [0,0,0],[60,60,60],[120,120,120],[210,210,210],[255,255,255],
        [96,0,24],[237,28,36],[255,127,39],[246,170,9],[249,221,59],[255,250,188],
        [14,185,104],[19,230,123],[135,255,94],[12,129,110],[16,174,166],[19,225,190],[96,247,242],
        [40,80,158],[64,147,228],[107,80,246],[153,177,251],
        [120,12,153],[170,56,185],[224,159,249],
        [203,0,122],[236,31,128],[243,141,169],
        [104,70,52],[149,104,42],[248,178,119]
    ];

    function colorDist2(r1,g1,b1, r2,g2,b2){const dr=r1-r2,dg=g1-g2,db=b1-b2;return dr*dr+dg*dg+db*db;}
    function nearestPaletteColor(r,g,b){let best=WPLACE_FREE[0],bd=Infinity;for(const c of WPLACE_FREE){const d=colorDist2(r,g,b,c[0],c[1],c[2]);if(d<bd){bd=d;best=c;}}return best;}

    // GM fetch helpers to avoid CORS tainting
    function gmFetchBlob(url){return new Promise((resolve,reject)=>{try{GM_xmlhttpRequest({method:'GET',url,responseType:'blob',onload:(res)=>{if(res.status>=200&&res.status<300&&res.response)resolve(res.response);else reject(new Error('GM_xhr '+res.status));},onerror:()=>reject(new Error('GM_xhr network error')),ontimeout:()=>reject(new Error('GM_xhr timeout'))});}catch(e){reject(e);}})}
    function blobToDataURL(blob){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result));fr.onerror=reject;fr.readAsDataURL(blob);});}
    async function loadImageDataURL(url){const blob=await gmFetchBlob(url);if(!blob||!String(blob.type).startsWith('image/'))throw new Error('not image');return await blobToDataURL(blob);}    

    function quantizeToPalette(img, alphaHarden=true){
        try{
            const c=document.createElement('canvas');
            c.width=img.naturalWidth||img.width; c.height=img.naturalHeight||img.height;
            const ctx=c.getContext('2d',{willReadFrequently:true});
            ctx.imageSmoothingEnabled=false; ctx.drawImage(img,0,0);
            const id=ctx.getImageData(0,0,c.width,c.height); const d=id.data;
            for(let i=0;i<d.length;i+=4){let a=d[i+3]; if(alphaHarden){a=d[i+3]=(a>16?255:0);} if(a===0) continue; const n=nearestPaletteColor(d[i],d[i+1],d[i+2]); d[i]=n[0]; d[i+1]=n[1]; d[i+2]=n[2];}
            ctx.putImageData(id,0,0); return c;
        }catch(e){console.warn('quantize failed',e); return null;}
    }

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

    // Positionierung wie Overlay Pro: Weltkoordinaten → Bildschirmkoordinaten (DOM-Overlay; derzeit nur Debug)
    function positionOverlayLikeOverlayPro(img) {
        const overlayX = parseInt(img.dataset.pixelX) + (parseInt(img.dataset.offsetX) || 0);
        const overlayY = parseInt(img.dataset.pixelY) + (parseInt(img.dataset.offsetY) || 0);

        // Finde das Spielfeld-Canvas
        const canvas = findWplaceCanvas();
        if (!canvas) return;

        // Viewport-Rechteck des Canvas (CSS-Pixel)
        const rect = canvas.getBoundingClientRect();

        // Kamera lesen; wenn nicht verfügbar, fallback
        const camera = getCamera();
        if (!camera || camera.x == null || camera.y == null) {
            return positionOverlayOnCanvas(img);
        }
        let scale = Number(camera.scale) || 1;
        let camX = Number(camera.x);
        let camY = Number(camera.y);
        // Heuristik: Falls Kamera in Chunks statt Pixeln ist
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
        const cx = rect.width / 2, cy = rect.height / 2;
        const dCenter = Math.hypot(sxCenter - cx, syCenter - cy);
        const dTL = Math.hypot(sxTL - cx, syTL - cy);
        const useCenter = dCenter <= dTL;
        const screenX = useCenter ? sxCenter : sxTL;
        const screenY = useCenter ? syCenter : syTL;

        // Overlay-Layer erzeugen (als Geschwister des Canvas)
        let overlayLayer = document.getElementById("elaubros-overlay-layer");
        if (!overlayLayer) {
            overlayLayer = document.createElement("div");
            overlayLayer.id = "elaubros-overlay-layer";
            overlayLayer.style.position = "absolute";
            overlayLayer.style.pointerEvents = "none";
            overlayLayer.style.zIndex = 999999;
            canvas.parentElement.insertBefore(overlayLayer, canvas.nextSibling);
        }

        // Overlay-Layer exakt über das Canvas im Dokument platzieren (mit Scroll)
        overlayLayer.style.left = (window.scrollX + rect.left) + "px";
        overlayLayer.style.top = (window.scrollY + rect.top) + "px";
        overlayLayer.style.width = rect.width + "px";
        overlayLayer.style.height = rect.height + "px";
        // Transform des Canvas bzw. seines nächsten transformierten Vorfahren übernehmen
        // Keine Transform übernehmen – wir rechnen screenX/screenY selbst
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
                    overlayX, overlayY,
                    camera: { x: camX, y: camY, scale },
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                    screen: { x: Math.round(screenX), y: Math.round(screenY) },
                    mode: useCenter ? 'center' : 'top-left'
                });
            } catch(e) {}
            img.dataset._elaubros_logged = "1";
        }
        // Kurzer Ping-Marker, um die Ankerposition sichtbar zu machen
        if (!img.dataset._elaubros_pinged) {
            const dot = document.createElement("div");
            dot.style.position = "absolute";
            dot.style.width = "8px";
            dot.style.height = "8px";
            dot.style.left = `${Math.round(screenX) - 4}px`;
            dot.style.top = `${Math.round(screenY) - 4}px`;
            dot.style.background = "#ff3366";
            dot.style.border = "2px solid white";
            dot.style.borderRadius = "50%";
            dot.style.boxShadow = "0 0 6px rgba(0,0,0,0.6)";
            dot.style.pointerEvents = "none";
            const layer = document.getElementById("elaubros-overlay-layer");
            if (layer) {
                layer.appendChild(dot);
                setTimeout(() => dot.remove(), 1200);
            }
            img.dataset._elaubros_pinged = "1";
        }
        img.style.left = `${Math.round(screenX)}px`;
        img.style.top = `${Math.round(screenY)}px`;
        img.style.transform = `scale(${scale})`;
        img.style.transformOrigin = "top left";
    }

    // Tile-Hook wie Overlay Pro: fängt Tile-Requests ab und zeichnet Overlays hinein
    function installTileHook() {
        if (window._elaubros_hook_installed) return;
        window._elaubros_hook_installed = true;

        const TILE_SIZE = 1000;
        const page = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        const origFetch = (page.fetch || window.fetch).bind(page);

        function matchTileUrl(urlStr) {
            try {
                const u = new URL(urlStr, location.href);
                if (u.hostname !== "backend.wplace.live") return null;
                // Beispiele:
                //  - /files/s0/tiles/1088/678.png
                //  - /files/1088/678.png   (Fallback)
                let m = u.pathname.match(/\/files\/[^/]+\/tiles\/(\d+)\/(\d+)\.png$/i);
                if (!m) m = u.pathname.match(/\/(\d+)\/(\d+)\.png$/i);
                if (!m) return null;
                return { chunk1: parseInt(m[1], 10), chunk2: parseInt(m[2], 10) };
            } catch { return null; }
        }

        async function composeTile(originalBlob, chunk1, chunk2) {
            // Sammle aktive Overlays
            const active = Object.values(overlays).filter(o => o.enabled && o.img && o.img.naturalWidth > 0);
            if (active.length === 0) return originalBlob;

            try {
                const tileImg = await createImageBitmap(originalBlob);
                const canvas = document.createElement('canvas');
                canvas.width = TILE_SIZE;
                canvas.height = TILE_SIZE;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = false;
                // Zeichne Originaltile
                ctx.drawImage(tileImg, 0, 0, TILE_SIZE, TILE_SIZE);

                const tileOriginX = chunk1 * TILE_SIZE;
                const tileOriginY = chunk2 * TILE_SIZE;

                for (const ov of active) {
                    const drawX = (ov.worldX + (ov.offsetX||0)) - tileOriginX;
                    const drawY = (ov.worldY + (ov.offsetY||0)) - tileOriginY;
                    if ((drawX + ov.img.naturalWidth) <= 0 || (drawY + ov.img.naturalHeight) <= 0 || drawX >= TILE_SIZE || drawY >= TILE_SIZE) {
                        continue; // komplett außerhalb dieses Tiles
                    }
                    const opacity = Number(ov.opacity ?? 0.5);
                    if (settings.renderMode === 'minify') {
                        // Dot grid at pixel centers using minifyScale
                        const scale = Math.max(2, Math.floor(settings.minifyScale));
                        const center = Math.floor(scale / 2);
                        const srcCanvas = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : (() => {
                            const c=document.createElement('canvas'); c.width=ov.img.naturalWidth; c.height=ov.img.naturalHeight; const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false; cx.drawImage(ov.img,0,0); return c; })();
                        const sw = srcCanvas.width, sh = srcCanvas.height;
                        const sx0 = Math.max(0, -drawX), sy0 = Math.max(0, -drawY);
                        const sx1 = Math.min(sw, TILE_SIZE - drawX), sy1 = Math.min(sh, TILE_SIZE - drawY);
                        if (sx1>sx0 && sy1>sy0) {
                            const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
                            const imgd = sctx.getImageData(sx0, sy0, sx1 - sx0, sy1 - sy0);
                            const data = imgd.data; const w = imgd.width;
                            for (let y=0; y<imgd.height; y++) {
                                const ty = drawY + sy0 + y;
                                if ((ty % scale) !== center) continue;
                                for (let x=0; x<imgd.width; x++) {
                                    const tx = drawX + sx0 + x;
                                    if ((tx % scale) !== center) continue;
                                    const i = (y*w + x) * 4;
                                    const a = data[i+3]; if (a === 0) continue;
                                    const r=data[i], g=data[i+1], b=data[i+2];
                                    ctx.globalAlpha = (a/255) * opacity;
                                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                                    ctx.fillRect(tx, ty, 1, 1);
                                }
                            }
                            ctx.globalAlpha = 1;
                        }
                    } else {
                        ctx.globalAlpha = opacity;
                        const src = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : ov.img;
                        ctx.drawImage(src, Math.round(drawX), Math.round(drawY));
                        ctx.globalAlpha = 1;
                    }
                }

                return await new Promise((resolve, reject) => {
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
                });
            } catch (e) {
                console.warn('ELAUBros composeTile failed', e);
                return originalBlob;
            }
        }

        const hookedFetch = async function(input, init) {
            const url = typeof input === 'string' ? input : input?.url || '';
            const match = matchTileUrl(url);
            if (!match) return origFetch(input, init);
            const res = await origFetch(input, init);
            try {
                const ct = res.headers.get('content-type') || '';
                if (!ct.includes('image')) return res;
                const blob = await res.clone().blob();
                // Debug: signal that hook is active
                try { console.debug('ELAUBros hook composing tile', url, match); } catch {}
                const finalBlob = await composeTile(blob, match.chunk1, match.chunk2);
                return new Response(finalBlob, { status: res.status, statusText: res.statusText, headers: { 'Content-Type': 'image/png' } });
            } catch (e) {
                console.warn('ELAUBros fetch hook error', e);
                return res;
            }
        };
        // In Page-Kontext hängen
        page.fetch = hookedFetch;
        window.fetch = hookedFetch;
    }

    // Menü erstellen
    const menu = document.createElement("div");
    menu.id = "elaubros-menu";
    menu.innerHTML = `<strong>ELAUBros Overlays</strong> <button id="elaubros-toggle">–</button><br>
    <label><span>Palette-Match</span> <input type="checkbox" id="elaubros-palette" checked></label>
    <label><span>Alpha hart</span> <input type="checkbox" id="elaubros-alpha" checked></label>
    <label><span>Modus</span>
      <select id="elaubros-mode">
        <option value="normal" selected>Normal</option>
        <option value="minify">Minify</option>
      </select>
    </label>
    `;
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
        #elaubros-menu label span { flex: 1; }
        #elaubros-menu select { width: 100%; }
    `);

    // Menü minimieren/maximieren
    document.getElementById("elaubros-toggle").addEventListener("click", function() {
        const children = Array.from(menu.children).slice(1); // erstes Element ist Titel
        children.forEach(el => el.style.display = (el.style.display === "none" ? "block" : "none"));
        this.textContent = this.textContent === "–" ? "+" : "–";
    });

    // Globale Optionen
    const palCb = document.getElementById('elaubros-palette');
    const alphaCb = document.getElementById('elaubros-alpha');
    const modeSel = document.getElementById('elaubros-mode');
    palCb.addEventListener('change', () => { settings.paletteMatch = palCb.checked; });
    alphaCb.addEventListener('change', () => { settings.alphaHarden = alphaCb.checked; 
        // Neu quantisieren, falls gewünscht
        Object.values(overlays).forEach(o => { if (o.img && o.img.naturalWidth) o.processedCanvas = quantizeToPalette(o.img, settings.alphaHarden); });
    });
    modeSel.addEventListener('change', () => { settings.renderMode = modeSel.value; });

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

                    // Overlay-Bild laden (CORS-sicher) und palettieren
                    const img = new Image();
                    (async () => {
                        try {
                            const dataUrl = await loadImageDataURL(overlay.imageUrl);
                            img.src = dataUrl;
                        } catch(e) {
                            console.error('ELAUBros overlay image failed to load:', overlay.imageUrl, e);
                        }
                    })();
                    img.addEventListener('load', () => {
                        console.log('ELAUBros overlay image loaded:', overlay.name, img.naturalWidth + 'x' + img.naturalHeight);
                        const name = overlay.name || `Overlay ${index+1}`;
                        const qc = quantizeToPalette(img, settings.alphaHarden);
                        if (overlays[name]) overlays[name].processedCanvas = qc;
                    });
                    img.style.opacity = overlay.opacity ?? 0.5;
                    img.style.display = "none"; // startet unsichtbar

                    // Koordinaten für spätere Repositionierung speichern
                    img.dataset.pixelX = String(pixelX);
                    img.dataset.pixelY = String(pixelY);
                    img.dataset.offsetX = overlay.offsetX || 0;
                    img.dataset.offsetY = overlay.offsetY || 0;

                    const name = overlay.name || `Overlay ${index+1}`;
                    overlays[name] = {
                        name,
                        img,
                        worldX: pixelX,
                        worldY: pixelY,
                        offsetX: overlay.offsetX || 0,
                        offsetY: overlay.offsetY || 0,
                        opacity: overlay.opacity ?? 0.5,
                        enabled: false
                    };

                    // Menü-Eintrag
                    const wrapper = document.createElement("div");

                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.dataset.overlay = name;

                    const labelText = document.createElement("span");
                    labelText.textContent = name;

                    const label = document.createElement("label");
                    label.appendChild(checkbox);
                    label.appendChild(labelText);

                    const slider = document.createElement("input");
                    slider.type = "range";
                    slider.min = "0";
                    slider.max = "1";
                    slider.step = "0.05";
                    slider.value = String(overlays[name].opacity);

                    // Checkbox: Aktivieren/Deaktivieren (wir rendern in Tiles)
                    checkbox.addEventListener("change", function(e) {
                        const name = e.target.dataset.overlay;
                        const ov = overlays[name];
                        ov.enabled = !!e.target.checked;
                    });

                    // Slider: Transparenz (wir nutzen für Tile-Compositing)
                    slider.addEventListener("input", function(e) {
                        overlays[name].opacity = Number(e.target.value);
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(slider);
                    menu.appendChild(wrapper);
                });

                // Installiere Tile-Hook
                installTileHook();

            } catch(e) {
                console.error("Fehler beim Parsen der Overlay JSON:", e);
            }
        }
    });

})();
