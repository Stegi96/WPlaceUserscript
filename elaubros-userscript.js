// ==UserScript==
// @name         Wplace ELAUBros Overlay Loader(Beta)
// @namespace    https://github.com/Stegi96
// @version      1.33.2
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
    const DEV = false; // Enable debug logs: set to true
    if (DEV) { try { console.log('[ELAUBros] userscript loaded', { version: '1.33.2' }); } catch(_) {} }

    const CONFIG_URL = "https://raw.githubusercontent.com/Stegi96/WPlaceUserscript/refs/heads/main/overlays.json";
    const TILE_SIZE = 1000;
    const overlays = {}; // { name: { img, worldX, worldY, offsetX, offsetY, opacity, enabled, processedCanvas } }
    const settings = { paletteMatch: true, alphaHarden: true, renderMode: 'normal' };
    const LS_KEY = 'elaubros_state_v1';
    const state = (function(){
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(_) { return {}; }
    })();
    function saveState(){ try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_) {} }

    // Wplace palette (Free)
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

    // Ensure constants are defined before first use (avoid TDZ)
    // (verschoben nach oben)

    // Symbol patterns (offsets relative to cell center) for "Symbols" mode
    const SYMBOL_PATTERNS = [
        // Plus
        [[0,0],[-1,0],[1,0],[0,-1],[0,1]],
        // X
        [[0,0],[-1,-1],[1,1],[-1,1],[1,-1]],
        // Small square
        [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[1,-1],[-1,1]],
        // T (top)
        [[0,0],[-1,0],[1,0],[0,1]],
        // L
        [[0,0],[1,0],[0,1]],
        // I vertical
        [[0,-1],[0,0],[0,1]],
        // I horizontal
        [[-1,0],[0,0],[1,0]],
        // Dot
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

    // Helper: find the main game canvas
    function findWplaceCanvas() {
        const canvases = Array.from(document.getElementsByTagName('canvas'));
        if (canvases.length === 0) return null;
        return canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    }

    // Legacy DOM overlay helpers removed (tile-based rendering only)

    // Camera helper removed; not needed for tile-based compositing

    // Legacy DOM minify/positioning code removed

    // Tile hook (like Overlay Pro): intercept tile requests and compose overlays
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
                
                let m = u.pathname.match(/\/files\/[^/]+\/tiles\/(\d+)\/(\d+)\.png$/i);
                if (!m) m = u.pathname.match(/\/(\d+)\/(\d+)\.png$/i);
                if (!m) return null;
                return { chunk1: parseInt(m[1], 10), chunk2: parseInt(m[2], 10) };
            } catch { return null; }
        }

        async function composeTile(originalBlob, chunk1, chunk2) {
            // Collect active overlays
            const active = Object.values(overlays).filter(o => o.enabled && o.img && o.img.naturalWidth > 0);
            if (active.length === 0) return originalBlob;

            try {
                const tileImg = await createImageBitmap(originalBlob);
                const canvas = document.createElement('canvas');
                canvas.width = TILE_SIZE;
                canvas.height = TILE_SIZE;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = false;
                // Draw original tile
                ctx.drawImage(tileImg, 0, 0, TILE_SIZE, TILE_SIZE);

                
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
                    
                    scaledCtx.drawImage(tileImg, 0, 0, tileW, tileH);
                }

                const tileOriginX = chunk1 * TILE_SIZE;
                const tileOriginY = chunk2 * TILE_SIZE;

                for (const ov of active) {
                    const drawX = (ov.worldX + (ov.offsetX||0)) - tileOriginX;
                    const drawY = (ov.worldY + (ov.offsetY||0)) - tileOriginY;
                    if ((drawX + ov.img.naturalWidth) <= 0 || (drawY + ov.img.naturalHeight) <= 0 || drawX >= TILE_SIZE || drawY >= TILE_SIZE) {
                        continue; // completely outside this tile
                    }
                    const opacity = Number(ov.opacity ?? 0.5);
                    if ((settings.renderMode === 'minify' || settings.renderMode === 'symbols') && scaledCtx) {
                        
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
                        // Normal mode: draw full image
                        ctx.globalAlpha = opacity;
                        const src = (settings.paletteMatch && ov.processedCanvas) ? ov.processedCanvas : ov.img;
                        ctx.drawImage(src, Math.round(drawX), Math.round(drawY));
                        ctx.globalAlpha = 1;
                    }
                }
                if ((settings.renderMode === 'minify' || settings.renderMode === 'symbols') && scaledCanvas) {
                    // Return the upscaled tile (page will downscale when rendering)
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
        // Attach to page context
        page.fetch = hookedFetch;
        window.fetch = hookedFetch;

        // Also hook Image.src if tiles load via <img>
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
                                // Fetch original, compose, replace with blob URL
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

    // Build in-page menu (UI)
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

    // Collapse/expand menu (hide/show body only)
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

    // Make menu draggable; persist position
    (function(){
      if (state.menuPos && typeof state.menuPos.left === 'number' && typeof state.menuPos.top === 'number') {
        menu.style.left = state.menuPos.left + 'px';
        menu.style.top = state.menuPos.top + 'px';
        menu.style.right = 'auto';
      }
      let dragging=false, startX=0, startY=0, startLeft=0, startTop=0;
      headerEl.addEventListener('mousedown',(ev)=>{
        if (ev && ev.target && ev.target.id === 'elaubros-toggle') return; // do not drag when clicking the toggle
        dragging=true; startX=ev.clientX; startY=ev.clientY;
        const rect = menu.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      function onMove(ev){ if(!dragging) return; const dx=ev.clientX-startX, dy=ev.clientY-startY; const left = Math.max(0, Math.min(window.innerWidth-40, startLeft+dx)); const top = Math.max(0, Math.min(window.innerHeight-24, startTop+dy)); menu.style.left=left+'px'; menu.style.top=top+'px'; menu.style.right='auto'; }
      function onUp(){ dragging=false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); const rect=menu.getBoundingClientRect(); state.menuPos={left: Math.round(rect.left), top: Math.round(rect.top)}; saveState(); }
    })();

    // Global options
    const palCb = document.getElementById('elaubros-palette');
    const alphaCb = document.getElementById('elaubros-alpha');
    const modeSel = document.getElementById('elaubros-mode');
    // Initialize settings from persisted state
    if (typeof state.settings === 'object') {
      if (typeof state.settings.paletteMatch === 'boolean') { palCb.checked = state.settings.paletteMatch; settings.paletteMatch = palCb.checked; }
      if (typeof state.settings.alphaHarden === 'boolean') { alphaCb.checked = state.settings.alphaHarden; settings.alphaHarden = alphaCb.checked; }
      if (typeof state.settings.renderMode === 'string') { modeSel.value = state.settings.renderMode; settings.renderMode = modeSel.value; }
    }
    palCb.addEventListener('change', () => { settings.paletteMatch = palCb.checked; state.settings = Object.assign({}, state.settings, { paletteMatch: palCb.checked }); saveState(); });
    alphaCb.addEventListener('change', () => { settings.alphaHarden = alphaCb.checked; state.settings = Object.assign({}, state.settings, { alphaHarden: alphaCb.checked }); saveState(); 
        // Re-quantize if desired
        Object.values(overlays).forEach(o => { if (o.img && o.img.naturalWidth) o.processedCanvas = quantizeToPalette(o.img, settings.alphaHarden); });
    });
    modeSel.addEventListener('change', () => { 
        settings.renderMode = modeSel.value; state.settings = Object.assign({}, state.settings, { renderMode: modeSel.value }); saveState();
        // Tile-based modes only; no DOM overlay
    });
    // No extra checkbox for symbols; use dropdown mode

    // Load overlays JSON
    GM_xmlhttpRequest({
        method: "GET",
        url: CONFIG_URL,
        onload: function(response) {
            try {
                const config = JSON.parse(response.responseText);
                if (!config.overlays) return;

                config.overlays.forEach((overlay, index) => {
                    // Extract world coordinates (chunk + position) from pixelUrl
                    // Example: https://backend.wplace.live/s0/pixel/1088/678?x=254&y=673
                    const full = overlay.pixelUrl || "";
                    const m = full.match(/\/pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/);
                    if (!m) return;
                    const chunk1 = parseInt(m[1], 10);
                    const chunk2 = parseInt(m[2], 10);
                    const posX = parseInt(m[3], 10);
                    const posY = parseInt(m[4], 10);
                    const pixelX = chunk1 * TILE_SIZE + posX;
                    const pixelY = chunk2 * TILE_SIZE + posY;

                    // Load overlay image (CORS-safe) and quantize
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
                    img.style.display = "none"; // start hidden

                    // Store world coordinates for later compositing
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

                    // Menu entry per overlay
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

                    // Initialize per-overlay state
                    if (!state.overlays) state.overlays = {};
                    if (state.overlays[name]) {
                      if (typeof state.overlays[name].enabled === 'boolean') checkbox.checked = state.overlays[name].enabled;
                      if (typeof state.overlays[name].opacity === 'number') slider.value = String(state.overlays[name].opacity);
                    }

                    // Checkbox: enable/disable (tile compositing)
                    checkbox.addEventListener("change", function(e) {
                        const name = e.target.dataset.overlay;
                        const ov = overlays[name];
                        ov.enabled = !!e.target.checked;
                        state.overlays[name] = Object.assign({}, state.overlays[name], { enabled: ov.enabled, opacity: Number(slider.value) });
                        saveState();
                    });

                    // Slider: opacity (tile compositing)
                    slider.addEventListener("input", function(e) {
                        overlays[name].opacity = Number(e.target.value);
                        state.overlays[name] = Object.assign({}, state.overlays[name], { enabled: checkbox.checked, opacity: overlays[name].opacity });
                        saveState();
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(slider);
                    document.getElementById('elaubros-body').appendChild(wrapper);
                });

                // Install tile hook (Normal/Minify/Symbols)
                installTileHook();
                // No DOM overlay for minify

            } catch(e) {
                console.error("Fehler beim Parsen der Overlay JSON:", e);
            }
        }
    });

})();
