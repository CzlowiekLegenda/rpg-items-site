/* Minimal SPA that loads and renders items from items.json */
// ===== File System Access + IndexedDB helpers =====
const DB_NAME = "rpg_items_db";
const STORE = "handles";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(key, value) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function readWithHandle(handle){
  try{
    // Check/query permission
    let perm = await handle.queryPermission({ mode: "read" });
    if (perm !== "granted") perm = await handle.requestPermission({ mode: "read" });
    if (perm !== "granted") throw new Error("Brak uprawnień do odczytu pliku.");
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  }catch(err){
    throw err;
  }
}

const QORDER = { "Zwykła": 0, "Niezwykła": 1, "Rzadka": 2, "Epicka": 3, "Legendarna": 4 };

const el = sel => document.querySelector(sel);
const els = sel => Array.from(document.querySelectorAll(sel));

function normalize(s){ return (s||'').toLowerCase(); }

function classesOf(entry){
  if (Array.isArray(entry.klasy)) return entry.klasy;
  if (Array.isArray(entry.Class)) return entry.Class;
  if (typeof entry.Class === 'string') return [entry.Class];
  return [];
}

function toArray(data){
  // Support dict {"id": {..}} or list of objects with id field
  if (Array.isArray(data)){
    return data.map(o => ({ id: String(o.id ?? ""), ...o }));
  }
  return Object.entries(data).map(([id, obj]) => ({ id: String(id), ...obj }));
}

function sortItems(items){
  return items.slice().sort((a,b)=>{
    const lvla = (typeof a.req_lvl === "number") ? a.req_lvl : 1e9;
    const lvlb = (typeof b.req_lvl === "number") ? b.req_lvl : 1e9;
    if (lvla !== lvlb) return lvla - lvlb;
    const qa = QORDER[a.jakosc] ?? 99;
    const qb = QORDER[b.jakosc] ?? 99;
    if (qa !== qb) return qa - qb;
    const ta = String(a.typ||""); const tb = String(b.typ||"");
    if (ta !== tb) return ta.localeCompare(tb);
    const na = String(a.nazwa||""); const nb = String(b.nazwa||"");
    if (na !== nb) return na.localeCompare(nb);
    return String(a.id).localeCompare(String(b.id));
  });
}

function render(items){
  const content = el("#content");
  const toc = el("#toc");
  content.innerHTML = "";
  toc.innerHTML = "";

  const byLevel = new Map();
  const noLevel = [];
  for (const it of items){
    if (typeof it.req_lvl !== "number") noLevel.push(it);
    else {
      const key = it.req_lvl|0;
      if (!byLevel.has(key)) byLevel.set(key, []);
      byLevel.get(key).push(it);
    }
  }

  const levels = Array.from(byLevel.keys()).sort((a,b)=>a-b);
  if (noLevel.length) levels.push(null);

  // TOC
  for (const lvl of levels){
    const a = document.createElement("a");
    a.className = "chip";
    a.href = `#lvl-${lvl===null?'none':lvl}`;
    a.textContent = lvl===null ? "Bez poziomu" : `Poziom ${lvl}`;
    toc.appendChild(a);
  }

  // Sections
  for (const lvl of levels){
    const section = document.createElement("section");
    section.id = `lvl-${lvl===null?'none':lvl}`;
    section.dataset.level = lvl===null ? "" : String(lvl);

    const head = document.createElement("div");
    head.className = "lvl-head";
    const h2 = document.createElement("h2");
    h2.textContent = lvl===null ? "Bez poziomu" : `Poziom ${lvl}`;
    const span = document.createElement("span");
    const entries = (lvl===null ? noLevel : byLevel.get(lvl)) || [];
    span.className = "count muted";
    span.textContent = `(${entries.length} przedm.)`;
    head.appendChild(h2); head.appendChild(span);

    const ul = document.createElement("ul");
    ul.className = "items";

    for (const it of entries){
      const li = document.createElement("li");
      li.className = "item";
      li.dataset.id = it.id;
      li.dataset.typ = it.typ || "";
      li.dataset.jakosc = it.jakosc || "";
      li.dataset.klasy = classesOf(it).join(", ");
      li.dataset.req = (it.req_lvl ?? "");

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = it.nazwa || "(bez nazwy)";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <span class="tag">ID: ${it.id}</span>
        <span class="tag">Typ: ${it.typ || "?"}</span>
        <span class="tag">Jakość: ${it.jakosc || "?"}</span>
        <span class="tag">Klasy: ${classesOf(it).join(", ") || "—"}</span>
      `;

      const stats = document.createElement("div");
      stats.className = "stats";
      const parts = [];
      if (typeof it.dmg_flat === "number") parts.push(`⚔ +${it.dmg_flat}`);
      if (typeof it.def === "number") parts.push(`🛡 +${it.def}`);
      if (typeof it.mana_bonus === "number") parts.push(`🔮 +${it.mana_bonus} mana`);
      stats.textContent = parts.length ? parts.join(" • ") : "—";

      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(stats);
      ul.appendChild(li);
    }

    section.appendChild(head);
    section.appendChild(ul);
    content.appendChild(section);
  }

  // Initial count
  updateCount();
}

function updateCount(){
  const items = els("li.item");
  const visible = items.filter(el => el.style.display !== "none").length;
  el("#count").textContent = `Widoczne: ${visible} / ${items.length}`;
}

function applyFilters(){
  const qv = normalize(el("#q").value);
  const kv = el("#f-klasa").value;
  const tv = el("#f-typ").value;
  const jv = el("#f-jakosc").value;

  for (const li of els("li.item")){
    const name = normalize(li.querySelector(".name").textContent);
    const id = normalize(li.dataset.id);
    const typ = li.dataset.typ;
    const jakosc = li.dataset.jakosc;
    const klasy = (li.dataset.klasy || "").split(",").map(s=>s.trim());

    let ok = true;
    if (qv) ok = name.includes(qv) || id.includes(qv);
    if (ok && kv) ok = klasy.includes(kv);
    if (ok && tv) ok = typ === tv;
    if (ok && jv) ok = jakosc === jv;

    li.style.display = ok ? "" : "none";
  }
  updateCount();
}

function bindFilters(){
  document.querySelector('#q').addEventListener('input', applyFilters);
  document.querySelector('#f-klasa').addEventListener('change', applyFilters);
  document.querySelector('#f-typ').addEventListener('change', applyFilters);
  document.querySelector('#f-jakosc').addEventListener('change', applyFilters);
}

async function main(){
  const rememberBtn = document.getElementById('rememberBtn');
  const status = document.getElementById('status');
  // Try auto-load from saved handle first (helps when opening from file://)
  try{
    const saved = await idbGet('itemsHandle');
    if (saved && 'getFile' in saved) {
      status.textContent = 'Wczytywanie z zapamiętanego pliku…';
      const raw = await readWithHandle(saved);
      const items = sortItems(toArray(raw));
      render(items); bindFilters();
      status.textContent = 'Załadowano z zapamiętanego pliku.';
      return;
    }
  }catch(e){ /* ignore and try fetch */ }


  try{
    const res = await fetch('items.json', { cache: 'no-store' });
    const raw = await res.json();
    const items = sortItems(toArray(raw));
    render(items);
    bindFilters();
  }catch(err){
    console.warn('Brak serwera? Włączam tryb wczytywania pliku.', err);
    status.textContent = 'Nie wykryto serwera – możesz wczytać plik ręcznie albo zapamiętać lokalizację.';
    // Show persistent remember button if FS Access API is available
    if (window.showOpenFilePicker) {
      rememberBtn.style.display = '';
      rememberBtn.onclick = async ()=>{
        try{
          const [h] = await window.showOpenFilePicker({
            multiple: false,
            excludeAcceptAllOption: true,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
          });
          await idbPut('itemsHandle', h);
          status.textContent = 'Zapamiętano plik. Wczytuję…';
          const raw = await readWithHandle(h);
          const items = sortItems(toArray(raw));
          render(items); bindFilters();
          status.textContent = 'Załadowano.';
        }catch(e){ status.textContent = 'Anulowano lub błąd wyboru pliku.'; }
      };
    }

    const btn = document.getElementById('uploadBtn');
    const fi  = document.getElementById('fileInput');
    btn.style.display = '';
    btn.addEventListener('click', ()=> fi.click());
    fi.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        const items = sortItems(toArray(raw));
        render(items);
        bindFilters();
      } catch(parseErr){
        document.querySelector('#content').innerHTML = '<p style="color:#ffbbbb">Nieprawidłowy plik JSON.</p>';
      }
    });
  }
}
main();
