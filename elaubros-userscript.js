// ==UserScript==
// @name         Wplace ELAUBros Overlay Loader(Beta)
// @namespace    https://github.com/Stegi96
// @version      1.33.1
// @description  Lädt alle Overlays aus einer JSON-Datei für Wplace.live, positioniert nach Pixel-URL, mit Menü und Transparenz-Slider, korrekt auf dem Spielfeld
// @author       ELAUBros
// @match        https://wplace.live/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      cdn.discordapp.com
// @connect      media.discordapp.net
// @run-at       document-start
// @inject-into  page
// @license      GPLv3
// ==/UserScript==

(function() {
    'use strict';
    const DEV = false; // Debug-Logs aktivieren: true setzen
    if (DEV) { try { console.log('[ELAUBros] userscript loaded', { version: '1.33.1' }); } catch(_) {} }

    const CONFIG_URL = "https://raw.githubusercontent.com/Stegi96/WPlaceUserscript/refs/heads/main/overlays.json";
    const TILE_SIZE = 1000; // wie Overlay Pro
    const overlays = {}; // { name: { img, worldX, worldY, offsetX, offsetY, opacity, enabled, processedCanvas } }
    const settings = { paletteMatch: true, alphaHarden: true, renderMode: 'normal' };
    const LS_KEY = 'elaubros_state_v1';
    const state = (function(){
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(_) { return {}; }
    })();
    function saveState(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_) {} }

    // Wplace-Palette (Free)
    // Palette and symbol data adapted from Wplace Overlay Pro (GPLv3)
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
    function nearestPaletteColor(r,g,b){let best=ALL_COLORS[0],bd=Infinity;for(const c of ALL_COLORS){const d=colorDist2(r,g,b,c[0],c[1],c[2]);if(d<bd){bd=d;best=c;}}return best;}
    function nearestPaletteIndex(r,g,b){let bestIdx=0,bd=Infinity;for(let i=0;i<ALL_COLORS.length;i++){const c=ALL_COLORS[i];const d=colorDist2(r,g,b,c[0],c[1],c[2]);if(d<bd){bd=d;bestIdx=i;}}return bestIdx;}

    // Full palette + symbol tiles (must be defined before use)
    const WPLACE_PAID = [
        [170,170,170],[165,14,30],[250,128,114],[228,92,26],[156,132,49],[197,173,49],[232,212,95],
        [74,107,58],[90,148,74],[132,197,115],[15,121,159],[187,250,242],[125,199,255],[77,49,184],
        [74,66,132],[122,113,196],[181,174,241],[155,82,73],[209,128,120],[250,182,164],[219,164,99],
        [123,99,82],[156,132,107],[214,181,148],[209,128,81],[255,197,165],[109,100,63],[148,140,107],
        [205,197,158],[51,57,65],[109,117,141],[179,185,209]
    ];
    const ALL_COLORS = [...WPLACE_FREE, ...WPLACE_PAID];
    const colorIndexMap = new Map(ALL_COLORS.map((c,i)=>[c.join(','), i]));
    function findColorIndexLUT(r,g,b){
        let best=-1, bestD=Infinity;
        for(let i=0;i<ALL_COLORS.length;i++){
            const c=ALL_COLORS[i];
            const d=colorDist2(r,g,b,c[0],c[1],c[2]);
            if(d<bestD){bestD=d;best=i;}
        }
        return best<0?0:best;
    }
    const SYMBOL_W = 5;
    const SYMBOL_H = 5;
    const SYMBOL_TILES = new Uint32Array([4897444,4756004,15241774,11065002,15269550,33209205,15728622,15658734,33226431,33391295,32641727,15589098,11516906,9760338,15399560,4685802,15587182,29206876,3570904,15259182,29224831,21427311,22511061,15161013,4667844,11392452,11375466,6812424,5225454,29197179,18285009,31850982,19267878,16236308,33481548,22708917,14352822,7847326,7652956,22501038,28457653,9179234,30349539,4685269,18295249,26843769,24483191,5211003,14829567,17971345,28873275,4681156,21392581,7460636,23013877,29010254,18846257,21825364,29017787,4357252,23057550,26880179,5242308,15237450]);
    const MINIFY_SCALE_SYMBOL = 7;

    // Ergänze Paid-Palette und Symboldaten VOR Nutzung (TDZ vermeiden)
    // (verschoben nach oben)

    // Symbolmuster (Offsets relativ zur Zellmitte) für "Symbols"-Modus
    const SYMBOL_PATTERNS = [
        // Plus
        [[0,0],[-1,0],[1,0],[0,-1],[0,1]],
        // X
        [[0,0],[-1,-1],[1,1],[-1,1],[1,-1]],
        // Quadrat (klein)
        [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[1,-1],[-1,1]],
        // T oben
        [[0,0],[-1,0],[1,0],[0,1]],
        // L
        [[0,0],[1,0],[0,1]],
        // I vertikal
        [[0,-1],[0,0],[0,1]],
        // I horizontal
        [[-1,0],[0,0],[1,0]],
        // Punkt
        [[0,0]]
    ];

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

    // Minify DOM-Layer (kleine Quadrate in Pixelmitte)
    function ensureMinifyLayer(rect) {
        let layer = document.getElementById('elaubros-minify-layer');
        if (!layer) {
            layer = document.createElement('canvas');
            layer.id = 'elaubros-minify-layer';
            layer.style.position = 'fixed';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = 999998;
            layer.style.imageRendering = 'pixelated';
            document.body.appendChild(layer);
        }
        if (rect) {
            layer.style.left = rect.left + 'px';
            layer.style.top = rect.top + 'px';
            layer.width = Math.max(1, Math.floor(rect.width));
            layer.height = Math.max(1, Math.floor(rect.height));
        }
        return layer.getContext('2d', { willReadFrequently: true });
    }

    let _minifyTimer = null;
    let _lastCam = { x: null, y: null, scale: null, w: null, h: null };
    function startMinifyLoop() {
        if (_minifyTimer) return;
        _minifyTimer = setInterval(renderMinifyOnce, 200);
    }
    function stopMinifyLoop() {
        if (_minifyTimer) { clearInterval(_minifyTimer); _minifyTimer = null; }
        const layer = document.getElementById('elaubros-minify-layer');
        if (layer) layer.remove();
    }

    function renderMinifyOnce() {
        if (settings.renderMode !== 'minify') return;
        const canvas = findWplaceCanvas();
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cam = getCamera();
        if (!cam || cam.x == null || cam.y == null) return;

        // Nur neu zeichnen, wenn sich Kamera/Rect geändert haben
        if (_lastCam.x === cam.x && _lastCam.y === cam.y && _lastCam.scale === cam.scale && _lastCam.w === rect.width && _lastCam.h === rect.height) return;
        _lastCam = { x: cam.x, y: cam.y, scale: cam.scale, w: rect.width, h: rect.height };

        const ctx = ensureMinifyLayer(rect);
        ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
        ctx.imageSmoothingEnabled = false;

        let scale = Number(cam.scale) || 1;
        let camX = Number(cam.x), camY = Number(cam.y);
        const centerOffsetX = rect.width / 2;
        const centerOffsetY = rect.height / 2;
        // Effektive CSS-Skalierung aus transform in Vorfahrenkette ermitteln
        function findTransformScale(el){
            let node = el, depth=0;
            while(node && depth < 6){
                const tf = getComputedStyle(node).transform;
                if (tf && tf !== 'none'){
                    const mm = tf.match(/matrix\(([-0-9.eE,\s]+)\)/);
                    if (mm){
                        const p = mm[1].split(',').map(s=>parseFloat(s));
                        const a=p[0], b=p[1];
                        const s = Math.hypot(a,b);
                        if (s>0) return s;
                    }
                }
                node = node.parentElement; depth++;
            }
            return 1;
        }
        const cssScaleFromTransform = findTransformScale(canvas);
        // zusätzliche Heuristik über Canvas-Größe
        const cssPerCanvasPx = (canvas.width > 0) ? (rect.width / canvas.width) : 1;
        // Beste Schätzung pro Weltpixel in CSS-Pixeln
        const cssPerWorldPx = Math.max(cssScaleFromTransform, cssPerCanvasPx, scale);
        // Kreuz-Arme: etwa 50% der sichtbaren Pixelbreite, Linienbreite 1 px
        const arm = Math.max(1, Math.round(cssPerWorldPx * 0.5 / 2)); // halbe Armlänge
        const thick = 1;

        for (const ov of Object.values(overlays)) {
            if (!ov.enabled || !ov.img || ov.img.naturalWidth === 0) continue;
            const src = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : (() => {
                const c=document.createElement('canvas'); c.width=ov.img.naturalWidth; c.height=ov.img.naturalHeight; const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false; cx.drawImage(ov.img,0,0); return c; })();
            const sctx = src.getContext('2d', { willReadFrequently: true });
            const imgd = sctx.getImageData(0, 0, src.width, src.height);
            const data = imgd.data; const w = imgd.width; const h = imgd.height;
            for (let y=0; y<h; y++) {
                const wy = ov.worldY + y;
                for (let x=0; x<w; x++) {
                    const i = (y*w + x) * 4;
                    const a = data[i+3]; if (a === 0) continue;
                    const r=data[i], g=data[i+1], b=data[i+2];
                    const wx = ov.worldX + x;
                    // Heuristik: Wenn Kamera in "Chunks" ist, in Weltpixel umrechnen
                    if (Math.abs(wx) > TILE_SIZE*10 && Math.abs(camX) < TILE_SIZE*10) { camX *= TILE_SIZE; camY *= TILE_SIZE; }
                    const sx = (wx - camX) * scale + centerOffsetX;
                    const sy = (wy - camY) * scale + centerOffsetY;
                    if (sx < 0 || sy < 0 || sx >= rect.width || sy >= rect.height) continue;
                    ctx.globalAlpha = (a/255) * Number(ov.opacity ?? 0.5);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    const cx = Math.round(sx), cy = Math.round(sy);
                    // Horizontaler Arm
                    ctx.fillRect(cx - arm, cy, arm*2 + 1, thick);
                    // Vertikaler Arm
                    ctx.fillRect(cx, cy - arm, thick, arm*2 + 1);
                }
            }
            ctx.globalAlpha = 1;
        }
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
        if (DEV && !img.dataset._elaubros_logged) {
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
        const NATIVE_FETCH = (page.fetch || window.fetch).bind(page);

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

                // Für Minify/Symbols: skaliere die Tile hoch (Pro-Pipeline)
                const MIN_SCALE = (settings.renderMode === 'symbols') ? MINIFY_SCALE_SYMBOL : 5;
                let scaledCanvas = null, scaledCtx = null;
                if (settings.renderMode === 'minify' || settings.renderMode === 'symbols') {
                    const tileW = TILE_SIZE * MIN_SCALE;
                    const tileH = TILE_SIZE * MIN_SCALE;
                    scaledCanvas = document.createElement('canvas');
                    scaledCanvas.width = tileW;
                    scaledCanvas.height = tileH;
                    scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
                    scaledCtx.imageSmoothingEnabled = false;
                    // Originaltile hochskaliert als Basis zeichnen
                    scaledCtx.drawImage(tileImg, 0, 0, tileW, tileH);
                }

                const tileOriginX = chunk1 * TILE_SIZE;
                const tileOriginY = chunk2 * TILE_SIZE;

                for (const ov of active) {
                    const drawX = (ov.worldX + (ov.offsetX||0)) - tileOriginX;
                    const drawY = (ov.worldY + (ov.offsetY||0)) - tileOriginY;
                    if ((drawX + ov.img.naturalWidth) <= 0 || (drawY + ov.img.naturalHeight) <= 0 || drawX >= TILE_SIZE || drawY >= TILE_SIZE) {
                        continue; // komplett außerhalb dieses Tiles
                    }
                    const opacity = Number(ov.opacity ?? 0.5);
                    if ((settings.renderMode === 'minify' || settings.renderMode === 'symbols') && scaledCtx) {
                        // Quelle: quantisierte oder Original-Overlay-Canvas
                        const srcCanvas = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : (() => {
                            const c=document.createElement('canvas'); c.width=ov.img.naturalWidth; c.height=ov.img.naturalHeight; const cx=c.getContext('2d',{willReadFrequently:true}); cx.imageSmoothingEnabled=false; cx.drawImage(ov.img,0,0); return c; })();
                        const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
                        const sw = srcCanvas.width, sh = srcCanvas.height;
                        const imgd = sctx.getImageData(0, 0, sw, sh);
                        const data = imgd.data; const rowW = imgd.width;
                        const centerX = (settings.renderMode === 'symbols') ? ((MIN_SCALE - SYMBOL_W) >> 1) : Math.floor(MIN_SCALE / 2);
                        const centerY = centerX;
                        let drawn = 0;
                        for (let y=0; y<sh; y++) {
                            const ty = drawY + y;
                            if (ty < 0 || ty >= TILE_SIZE) continue;
                            for (let x=0; x<sw; x++) {
                                const tx = drawX + x;
                                if (tx < 0 || tx >= TILE_SIZE) continue;
                                const idx = (y*rowW + x) * 4;
                                const a = data[idx+3]; if (a === 0) continue;
                                const r=data[idx], g=data[idx+1], b=data[idx+2];
                                const baseX = tx * MIN_SCALE;
                                const baseY = ty * MIN_SCALE;
                                if (settings.renderMode === 'symbols') {
                                    // Exakte Symbols-Logik wie Overlay Pro
                                    // Bestimme Farbindex (perfekt, wenn bereits paletteMatch erfolgte)
                                    const colorKey = `${r},${g},${b}`;
                                    const isPerfect = settings.paletteMatch;
                                    const colorIndex = isPerfect && colorIndexMap.has(colorKey) ? colorIndexMap.get(colorKey) : findColorIndexLUT(r,g,b);
                                    if (colorIndex >= 0 && colorIndex < SYMBOL_TILES.length) {
                                        const symbol = SYMBOL_TILES[colorIndex];
                                        const pal = ALL_COLORS[colorIndex];
                                        scaledCtx.globalAlpha = (a/255) * opacity;
                                        scaledCtx.fillStyle = `rgb(${pal[0]},${pal[1]},${pal[2]})`;
                                        for (let sy=0; sy<SYMBOL_H; sy++) {
                                            for (let sx=0; sx<SYMBOL_W; sx++) {
                                                const bitIdx = sy*SYMBOL_W + sx;
                                                if ((symbol >>> bitIdx) & 1) {
                                                    const outX = baseX + sx + centerX;
                                                    const outY = baseY + sy + centerY;
                                                    scaledCtx.fillRect(outX, outY, 1, 1);
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    // Minify: farbiger Punkt im Zentrum
                                    const c = settings.paletteMatch ? nearestPaletteColor(r,g,b) : [r,g,b];
                                    scaledCtx.globalAlpha = (a/255) * opacity;
                                    scaledCtx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
                                    const dotX = baseX + Math.floor(MIN_SCALE/2);
                                    const dotY = baseY + Math.floor(MIN_SCALE/2);
                                    scaledCtx.fillRect(dotX, dotY, 1, 1);
                                }
                                drawn++;
                            }
                        }
                        if (DEV) { try { console.debug('ELAUBros minify symbols drawn', drawn, 'on chunk', chunk1, chunk2); } catch(_) {} }
                    } else {
                        // Normalmodus: komplettes Bild einzeichnen
                        ctx.globalAlpha = opacity;
                        const src = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : ov.img;
                        ctx.drawImage(src, Math.round(drawX), Math.round(drawY));
                        ctx.globalAlpha = 1;
                    }
                }
                if ((settings.renderMode === 'minify' || settings.renderMode === 'symbols') && scaledCanvas) {
                    // Ersetze die Tile durch die hochskalierte Version (Seite skaliert beim Rendern herunter)
                    // Exportiere direkt den Inhalt der skalierten Canvas
                    return await new Promise((resolve, reject) => {
                        scaledCanvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed (scaled)')), 'image/png');
                    });
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
            if (!match) return NATIVE_FETCH(input, init);
            const res = await NATIVE_FETCH(input, init);
            try {
                const ct = res.headers.get('content-type') || '';
                if (!ct.includes('image')) return res;
                const blob = await res.clone().blob();
                // Debug: signal that hook is active
                if (DEV) { try { console.debug('ELAUBros hook composing tile', url, match); } catch(_) {} }
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

        // Zusätzlich: Image.src-Hook, falls Tiles via <img> geladen werden
        try {
            const desc = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
            if (desc && desc.configurable) {
                Object.defineProperty(Image.prototype, 'src', {
                    get: function() { return desc.get.call(this); },
                    set: function(v) {
                        try {
                            const val = String(v);
                            const m = matchTileUrl(val);
                            if (m) {
                                // Lade Original, compose, ersetze durch Blob-URL
                                NATIVE_FETCH(val).then(r => r.blob()).then(b => composeTile(b, m.chunk1, m.chunk2)).then(finalBlob => {
                                    const url = URL.createObjectURL(finalBlob);
                                    desc.set.call(this, url);
                                }).catch(() => desc.set.call(this, val));
                                return;
                            }
                        } catch {}
                        return desc.set.call(this, v);
                    }
                });
                if (DEV) { try { console.debug('ELAUBros Image.src hook installed'); } catch(_) {} }
            }
        } catch (e) { try { console.warn('ELAUBros Image hook failed', e); } catch {} }
    }

    // Menü erstellen
    const menu = document.createElement("div");
    menu.id = "elaubros-menu";
    menu.innerHTML = `
      <div id="elaubros-header">
        <span class="title">ELAUBros Overlays</span>
        <button id="elaubros-toggle">–</button>
      </div>
      <div id="elaubros-body">
        <label><span>Palette-Match</span> <input type="checkbox" id="elaubros-palette" checked></label>
        <label><span>Alpha hart</span> <input type="checkbox" id="elaubros-alpha" checked></label>
        <label><span>Modus</span>
          <select id="elaubros-mode">
            <option value="normal">Normal</option>
            <option value="minify">Minify</option>
            <option value="symbols">Symbols</option>
          </select>
        </label>
      </div>
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
            z-index: 1000001;
            max-width: 220px;
        }
        #elaubros-header { display: flex; align-items: center; gap: 8px; justify-content: space-between; cursor: move; user-select: none; }
        #elaubros-header .title { font-weight: 700; }
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
            padding: 2px 6px;
        }
        #elaubros-menu label span { flex: 1; }
        #elaubros-menu select, #elaubros-menu input[type="number"] {
            width: 100%;
            background: #1f1f1f;
            color: #fff;
            border: 1px solid #555;
            border-radius: 6px;
            padding: 4px 6px;
        }
        #elaubros-menu select:focus, #elaubros-menu input[type="number"]:focus {
            outline: none;
            border-color: #888;
        }
        #elaubros-menu select option {
            background: #1f1f1f;
            color: #fff;
        }
    `);

    // Menü minimieren/maximieren (nur Body ein-/ausblenden)
    const headerEl = document.getElementById('elaubros-header');
    const bodyEl = document.getElementById('elaubros-body');
    const toggleBtn = document.getElementById('elaubros-toggle');
    function applyCollapsed(collapsed){
      bodyEl.style.display = collapsed ? 'none' : 'block';
      toggleBtn.textContent = collapsed ? '+' : '–';
    }
    let collapsed = !!state.menuCollapsed;
    applyCollapsed(collapsed);
    toggleBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      collapsed = !collapsed; state.menuCollapsed = collapsed; saveState(); applyCollapsed(collapsed);
    });

    // Menü-Position (drag)
    (function(){
      if (state.menuPos && typeof state.menuPos.left === 'number' && typeof state.menuPos.top === 'number') {
        menu.style.left = state.menuPos.left + 'px';
        menu.style.top = state.menuPos.top + 'px';
        menu.style.right = 'auto';
      }
      let dragging=false, startX=0, startY=0, startLeft=0, startTop=0;
      headerEl.addEventListener('mousedown',(ev)=>{
        if (ev && ev.target && ev.target.id === 'elaubros-toggle') return; // nicht den Button ziehen
        dragging=true; startX=ev.clientX; startY=ev.clientY;
        const rect = menu.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      function onMove(ev){ if(!dragging) return; const dx=ev.clientX-startX, dy=ev.clientY-startY; const left = Math.max(0, Math.min(window.innerWidth-40, startLeft+dx)); const top = Math.max(0, Math.min(window.innerHeight-24, startTop+dy)); menu.style.left=left+'px'; menu.style.top=top+'px'; menu.style.right='auto'; }
      function onUp(){ dragging=false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); const rect=menu.getBoundingClientRect(); state.menuPos={left: Math.round(rect.left), top: Math.round(rect.top)}; saveState(); }
    })();

    // Globale Optionen
    const palCb = document.getElementById('elaubros-palette');
    const alphaCb = document.getElementById('elaubros-alpha');
    const modeSel = document.getElementById('elaubros-mode');
    // Initiale Werte aus State
    if (typeof state.settings === 'object') {
      if (typeof state.settings.paletteMatch === 'boolean') { palCb.checked = state.settings.paletteMatch; settings.paletteMatch = palCb.checked; }
      if (typeof state.settings.alphaHarden === 'boolean') { alphaCb.checked = state.settings.alphaHarden; settings.alphaHarden = alphaCb.checked; }
      if (typeof state.settings.renderMode === 'string') { modeSel.value = state.settings.renderMode; settings.renderMode = modeSel.value; }
    }
    palCb.addEventListener('change', () => { settings.paletteMatch = palCb.checked; state.settings = Object.assign({}, state.settings, { paletteMatch: palCb.checked }); saveState(); });
    alphaCb.addEventListener('change', () => { settings.alphaHarden = alphaCb.checked; state.settings = Object.assign({}, state.settings, { alphaHarden: alphaCb.checked }); saveState(); 
        // Neu quantisieren, falls gewünscht
        Object.values(overlays).forEach(o => { if (o.img && o.img.naturalWidth) o.processedCanvas = quantizeToPalette(o.img, settings.alphaHarden); });
    });
    modeSel.addEventListener('change', () => { 
        settings.renderMode = modeSel.value; state.settings = Object.assign({}, state.settings, { renderMode: modeSel.value }); saveState();
        // Tile-basierter Minify; DOM-Layer nicht nutzen
        stopMinifyLoop();
    });
    // no checkbox for symbols; use dropdown mode

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
                        if (DEV) { try { console.log('ELAUBros overlay image loaded:', overlay.name, img.naturalWidth + 'x' + img.naturalHeight); } catch(_) {} }
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

                    // Initialzustand aus State
                    if (!state.overlays) state.overlays = {};
                    if (state.overlays[name]) {
                      if (typeof state.overlays[name].enabled === 'boolean') checkbox.checked = state.overlays[name].enabled;
                      if (typeof state.overlays[name].opacity === 'number') slider.value = String(state.overlays[name].opacity);
                    }

                    // Checkbox: Aktivieren/Deaktivieren (wir rendern in Tiles)
                    checkbox.addEventListener("change", function(e) {
                        const name = e.target.dataset.overlay;
                        const ov = overlays[name];
                        ov.enabled = !!e.target.checked;
                        state.overlays[name] = Object.assign({}, state.overlays[name], { enabled: ov.enabled, opacity: Number(slider.value) });
                        saveState();
                    });

                    // Slider: Transparenz (wir nutzen für Tile-Compositing)
                    slider.addEventListener("input", function(e) {
                        overlays[name].opacity = Number(e.target.value);
                        state.overlays[name] = Object.assign({}, state.overlays[name], { enabled: checkbox.checked, opacity: overlays[name].opacity });
                        saveState();
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(slider);
                    document.getElementById('elaubros-body').appendChild(wrapper);
                });

                // Installiere Tile-Hook (Normal + Minify)
                installTileHook();
                // Kein DOM-Layer für Minify
                stopMinifyLoop();

            } catch(e) {
                console.error("Fehler beim Parsen der Overlay JSON:", e);
            }
        }
    });

})();
