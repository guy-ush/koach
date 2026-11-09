/* יומן כוח — RM and training log.
   Local-first: everything lives in localStorage on this device.
   Optional: automatic backup of one JSON file to the user's own Google Drive. */
(() => {
'use strict';

const CFG = window.KOACH_CONFIG || {};
const KEY = 'koach.v1', SNAP_KEY = 'koach.snaps', TOKEN_KEY = 'koach.gtoken';
const DEFAULT_LIFTS = [
  { id: 'squat', name: 'בק סקוואט', color: 'var(--squat)' },
  { id: 'ohp',   name: 'מיליטרי פרס', color: 'var(--ohp)' },
  { id: 'dead',  name: 'דדליפט', color: 'var(--dead)' },
  { id: 'bench', name: 'בנץ׳ פרס', color: 'var(--bench)' }
];
const EXTRA_COLORS = ['var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)', 'var(--c9)', 'var(--c10)'];
const DEFAULTS = { round: 2.5, theme: 'auto', lastBackup: null, rmTypes: [1, 5, 10], lifts: null, installDismissed: false,
  drive: { on: false, fileId: null, lastAt: null, lastHash: null, error: null } };

/* ---------- storage ---------- */
let db = load();
function normalize(d) {
  const settings = { ...DEFAULTS, ...(d.settings || {}) };
  settings.drive = { ...DEFAULTS.drive, ...(settings.drive || {}) };
  if (!Array.isArray(settings.lifts) || !settings.lifts.length) settings.lifts = DEFAULT_LIFTS.map(l => ({ ...l }));
  if (!Array.isArray(settings.rmTypes) || !settings.rmTypes.length) settings.rmTypes = [1, 5, 10];
  // 10RM became a default later: add it once for existing users (stays removed if they remove it)
  if (!settings.rm10) { if (!settings.rmTypes.map(Number).includes(10)) settings.rmTypes = [...settings.rmTypes, 10]; settings.rm10 = true; }
  settings.rmTypes = [...new Set(settings.rmTypes.map(Number))].sort((a, b) => a - b);
  const workouts = (d.workouts || []).map(w => ({ ...w, items: (w.items || []).map(i => ({ base: 1, ...i })) }));
  return { tests: d.tests || [], workouts, settings };
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { /* fall through */ }
  return normalize({});
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('השמירה נכשלה — כדאי לגבות עכשיו'); }
  snapshot();
  mirror.put(db);
}
// Second copy in IndexedDB: if localStorage is wiped but IndexedDB survives, data comes back.
const mirror = (() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('koach', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => open().then(d => new Promise((res, rej) => {
    const t = d.transaction('kv', mode), q = fn(t.objectStore('kv'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  }));
  return {
    put: data => { try { tx('readwrite', st => st.put(JSON.stringify(data), 'db')).catch(() => {}); } catch (e) { /* no idb */ } },
    get: () => { try { return tx('readonly', st => st.get('db')).then(v => v ? JSON.parse(v) : null).catch(() => null); } catch (e) { return Promise.resolve(null); } }
  };
})();
const hasData = d => d && ((d.tests || []).length || (d.workouts || []).length);
async function recoverIfWiped() {
  if (hasData(db)) { mirror.put(db); return; }
  let src = await mirror.get();
  if (!hasData(src)) { const s = snaps()[0]; if (s) src = { ...s.data, settings: db.settings }; }
  if (!hasData(src)) return;
  db = normalize(src); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  toast(`הנתונים שוחזרו (${db.workouts.length} אימונים, ${db.tests.length} RM)`); route();
}
// Places where the browser throws data away on close: in-app browsers and private tabs.
const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram|Snapchat|; wv\)|GSA\/|Claude/i.test(navigator.userAgent);
let storageRisk = null; // null = unknown, '' = fine, else a reason
async function checkStorage() {
  let persisted = false;
  try { if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch (e) { /* ignore */ }
  let quota = Infinity;
  try { if (navigator.storage && navigator.storage.estimate) quota = (await navigator.storage.estimate()).quota || Infinity; } catch (e) { /* ignore */ }
  storageRisk = inAppBrowser() ? 'inapp' : quota < 150 * 1024 * 1024 && !standalone() ? 'private' : '';
  db.settings._persisted = persisted;
  if (storageRisk && /^#\/(home|settings)|^$/.test(location.hash)) route();
}
function storageWarning() {
  if (!storageRisk) return '';
  const why = storageRisk === 'inapp'
    ? 'האפליקציה פתוחה בתוך דפדפן של אפליקציה אחרת (וואטסאפ, אינסטגרם וכו׳). שם הנתונים נמחקים כשסוגרים.'
    : 'נראה שזו לשונית גלישה פרטית. בה הנתונים נמחקים כשסוגרים.';
  return `<div class="card warn"><b>⚠️ הנתונים כאן לא יישמרו</b><p class="small">${why}<br>פתח את הקישור ב${isIOS() ? 'ספארי' : 'כרום'} רגיל והוסף למסך הבית.</p></div>`;
}
const lifts = () => db.settings.lifts.filter(l => !l.hidden);
const LIFT = id => db.settings.lifts.find(l => l.id === id) || { id, name: id, color: 'var(--muted)' };
const RMS = () => db.settings.rmTypes;

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const toDate = s => new Date(s + 'T12:00:00');
const fmtDate = s => { const d = toDate(s); return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`; };
const fmtLong = s => toDate(s).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = s => toDate(s).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
const fmtStamp = t => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const kg = n => (n == null || isNaN(n)) ? '—' : (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const roundTo = (w, step) => step > 0 ? Math.round(w / step) * step : w;
// Epley: estimated 1RM from a set, and the reverse (weight you could move for N reps).
const e1rm = (w, reps) => !w || !reps ? 0 : reps === 1 ? w : w * (1 + reps / 30);
const ICON = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'
};

/* ---------- derived data ---------- */
const testsFor = (lift, rm) => db.tests.filter(t => t.lift === lift && (!rm || t.rm === rm)).sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
const latest = (lift, rm, asOf) => { const l = testsFor(lift, rm).filter(t => !asOf || t.date <= asOf); return l[l.length - 1] || null; };

// The xRM that percentages are taken from: the latest tested xRM (on or before the date).
// Only RMs that were actually entered count — nothing is estimated from another RM.
function baseRM(lift, rm, asOf) {
  if (!rm) return null;
  const t = latest(lift, rm, asOf) || latest(lift, rm);
  return t ? { w: t.weight, rm, src: `${rm}RM מ־${fmtDate(t.date)}` } : null;
}
// RM types this lift has data for, in list order.
const availBases = lift => RMS().filter(r => testsFor(lift, r).length);
function setWeight(set, lift, date, base) {
  if (set.pct != null) {
    const b = baseRM(lift, base, date);
    return b ? roundTo(b.w * set.pct / 100, db.settings.round) : null;
  }
  return set.weight;
}
const sortedWorkouts = () => [...db.workouts].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
function bestTraining(lift) { // best estimated 1RM per workout
  return db.workouts.map(w => {
    let best = 0, top = null;
    w.items.filter(i => i.lift === lift).forEach(i => i.sets.forEach(s => {
      const e = e1rm(s.weight, s.reps); if (e > best) { best = e; top = s; }
    }));
    return best ? { date: w.date, e: best, set: top } : null;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- UI primitives ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
function sheet(title, body, foot = '') {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="סגירה">${ICON.x}</button></div>
      <div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </div>`;
  const el = $('.sheet', root), bd = $('.sheet-backdrop', root);
  requestAnimationFrame(() => { el.classList.add('show'); bd.classList.add('show'); });
  const close = () => { el.classList.remove('show'); bd.classList.remove('show'); setTimeout(() => { if (root.contains(el)) root.innerHTML = ''; }, 300); };
  bd.onclick = close; $('[data-close]', el).onclick = close;
  return { el, close };
}
function confirmBox(msg, okLabel = 'מחיקה', danger = true) {
  return new Promise(res => {
    const s = sheet('לאשר?', `<p class="confirm-body">${esc(msg)}</p>
      <div class="confirm-actions"><button class="btn" data-no>ביטול</button><button class="btn primary" data-yes ${danger ? 'style="background:var(--over);border-color:var(--over)"' : ''}>${esc(okLabel)}</button></div>`);
    $('[data-no]', s.el).onclick = () => { s.close(); res(false); };
    $('[data-yes]', s.el).onclick = () => { s.close(); res(true); };
  });
}
const rmSeg = (attr, current, extra = '', list = RMS()) => list.length < 2 ? '' :
  `<div class="seg ${extra}">${list.map(r => `<button ${attr}="${r}" aria-pressed="${r === current}">${r}RM</button>`).join('')}</div>`;

/* ---------- router ---------- */
const view = $('#view');
function go(hash) { location.hash = hash; }
function route() {
  const [, a = 'home', b] = (location.hash || '#/home').split('/');
  const tab = a === 'lift' ? 'home' : a === 'workout' ? 'workouts' : a;
  $$('#tabs button').forEach(x => x.setAttribute('aria-current', x.dataset.tab === tab ? 'page' : 'false'));
  $('#fab').hidden = !(a === 'home' || a === 'workouts');
  ({ home: renderHome, lift: () => renderLift(b), workouts: renderWorkouts, workout: () => renderEditor(b),
     progress: renderProgress, calc: renderCalc, settings: renderSettings }[a] || renderHome)();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
$$('#tabs button').forEach(b => b.onclick = () => go('#/' + b.dataset.tab));
$('#fab').onclick = () => go('#/workout/new');

/* ---------- home ---------- */
function spark(points) {
  if (points.length < 2) return '';
  const xs = points.map(p => toDate(p.date).getTime()), ys = points.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 120, H = 36, px = x => x1 === x0 ? W / 2 : (x - x0) / (x1 - x0) * W, py = y => y1 === y0 ? H / 2 : H - 3 - (y - y0) / (y1 - y0) * (H - 6);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline vector-effect="non-scaling-stroke" points="${points.map((p, i) => `${px(xs[i]).toFixed(1)},${py(ys[i]).toFixed(1)}`).join(' ')}"/></svg>`;
}
function renderHome() {
  const n = db.workouts.length, last = sortedWorkouts()[0];
  view.innerHTML = `
    <div class="top"><div class="brand"><img src="icons/logo.png" alt="ZONE Strength Club"><div><h1>יומן כוח</h1><p class="muted small">${n ? `${n} אימונים · אחרון ${fmtDate(last.date)}` : 'מתחילים: הוסף RM לכל תרגיל'}</p></div></div></div>
    ${storageWarning()}${transferCard()}${installCard()}
    <div class="lifts">${lifts().map(l => {
      // each lift shows the RM it actually tracks; others it also has go underneath
      const av = availBases(l.id), main = av[0] || RMS()[0], rest = av.slice(1);
      const tm = testsFor(l.id, main), cur = tm[tm.length - 1], first = tm[0];
      const d = cur && first && cur !== first ? cur.weight - first.weight : null;
      return `<button class="lift" style="--lc:${l.color}" data-lift="${l.id}">
        <span class="hd"><span class="nm">${esc(l.name)}</span>${cur ? `<span class="badge one">${main}RM</span>` : ''}</span>
        <span class="big num">${cur ? kg(cur.weight) : '—'}<small>${cur ? 'ק״ג' : ''}</small></span>
        <span class="sub">${!cur ? '<span>עוד אין RM</span>' : ''}${rest.map(r => `<span>${r}RM: <b class="num">${kg(latest(l.id, r).weight)}</b></span>`).join('')}${d != null ? `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${kg(Math.abs(d))}</span>` : ''}</span>
        ${spark(tm.length > 1 ? tm.map(t => ({ date: t.date, v: t.weight })) : trainingSeries(l.id, 'top').map(p => ({ date: p.d, v: p.v })))}
      </button>`;
    }).join('')}</div>
    <div class="section-title"><h2>אימונים אחרונים</h2>${n ? '<button class="btn ghost sm" data-all>הכל</button>' : ''}</div>
    ${n ? `<div class="list">${sortedWorkouts().slice(0, 3).map(workoutRow).join('')}</div>`
        : `<div class="list"><div class="empty">עוד לא נרשמו אימונים.<br>לחץ על ＋ כדי לתעד אימון.</div></div>`}
    ${backupNag()}`;
  $$('[data-lift]').forEach(b => b.onclick = () => go('#/lift/' + b.dataset.lift));
  $$('[data-wk]').forEach(b => b.onclick = () => go('#/workout/' + b.dataset.wk));
  const all = $('[data-all]'); if (all) all.onclick = () => go('#/workouts');
  const bk = $('[data-backup]'); if (bk) bk.onclick = exportJSON;
  bindInstall(); bindTransfer();
}
function backupNag() {
  if (db.settings.drive.on && db.settings.drive.lastAt && Date.now() - db.settings.drive.lastAt < 7 * 864e5) return '';
  const total = db.tests.length + db.workouts.length;
  if (total < 5) return '';
  const lb = db.settings.lastBackup;
  if (lb && (Date.now() - lb) < 14 * 864e5) return '';
  return `<div class="card row" style="margin-top:18px"><div class="grow"><b>גיבוי</b><p class="muted small">הנתונים שמורים רק בטלפון הזה. ${lb ? 'הגיבוי האחרון לפני יותר משבועיים.' : 'עוד לא גיבית.'}</p></div><button class="btn sm primary" data-backup>גיבוי</button></div>`;
}
function workoutRow(w) {
  const vol = w.items.reduce((s, i) => s + i.sets.reduce((a, x) => a + (x.weight || 0) * (x.reps || 0), 0), 0);
  return `<button class="li wk" data-wk="${w.id}">
    <div class="grow">
      <div class="row between"><span class="t">${fmtLong(w.date)}</span><span class="s num">${vol ? kg(vol) + ' ק״ג נפח' : ''}</span></div>
      <div class="lines">${w.items.map(i => `<div class="line" style="--lc:${LIFT(i.lift).color}"><i class="dot"></i><span>${esc(LIFT(i.lift).name)}</span><span class="sets">${summarizeSets(i.sets)}</span></div>`).join('')}</div>
      ${w.note ? `<p class="s" style="margin-top:4px">${esc(w.note)}</p>` : ''}
    </div>${ICON.chev}</button>`;
}
function summarizeSets(sets) { // "3×5 @ 100 · 1×3 @ 110"
  const groups = [];
  sets.forEach(s => {
    const g = groups[groups.length - 1];
    if (g && g.reps === s.reps && g.weight === s.weight) g.n++; else groups.push({ n: 1, reps: s.reps, weight: s.weight });
  });
  return groups.map(g => `${g.n}×${g.reps} @ ${kg(g.weight)}`).join(' · ');
}

/* ---------- install / share ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (/#\/home|^$/.test(location.hash)) route(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHow() {
  if (installEvt) return 'אפשר להתקין את האפליקציה במסך הבית בלחיצה אחת.';
  if (isIOS()) return 'בספארי: לחץ על כפתור השיתוף <b>⬆︎</b> ואז <b>„הוספה למסך הבית”</b>.';
  return 'בכרום: תפריט <b>⋮</b> ואז <b>„התקנת אפליקציה”</b> או <b>„הוספה למסך הבית”</b>.';
}
function installCard() {
  if (standalone() || db.settings.installDismissed) return '';
  return `<div class="card install"><div class="grow"><b>להתקין על הטלפון</b><p class="muted small">${installHow()}</p></div>
    <div class="col">${installEvt ? '<button class="btn sm primary" data-install>התקנה</button>' : ''}<button class="icon-btn" data-dismiss aria-label="סגירה">${ICON.x}</button></div></div>`;
}
function bindInstall() {
  const i = $('[data-install]'); if (i) i.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; route(); };
  const d = $('[data-dismiss]'); if (d) d.onclick = () => { db.settings.installDismissed = true; save(); route(); };
}
async function shareApp() {
  const url = new URL('./', location.href).href;
  const text = 'יומן כוח – מעקב RM ואימונים. הכל נשמר רק אצלך בטלפון, בלי הרשמה.';
  if (navigator.share) { try { await navigator.share({ title: 'יומן כוח', text, url }); } catch (e) { /* cancelled */ } return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('הקישור הועתק'); } catch (e) { prompt('העתק את הקישור:', url); }
}

/* ---------- lift detail ---------- */
let range = 'all', tableBase = 1;
function renderLift(id) {
  const l = db.settings.lifts.find(x => x.id === id); if (!l) return go('#/home');
  const tr = bestTraining(id), best = tr.reduce((m, x) => x.e > m.e ? x : m, { e: 0 });
  const av = availBases(id);
  if (!av.includes(tableBase)) tableBase = av[0];
  const b = baseRM(id, tableBase);
  const dashes = ['', '6 5', '2 4', '10 4 2 4', '1 3'];
  view.innerHTML = `
    <button class="back" data-back>${ICON.back} תרגילים</button>
    <div class="top" style="--lc:${l.color}"><div><h1>${esc(l.name)}</h1></div></div>
    <div class="hero" style="--n:${RMS().length + 1}">
      ${RMS().map(r => { const t = latest(id, r); return `<div class="stat"><b class="num">${t ? kg(t.weight) : '—'}</b><span>${r}RM</span><em>${t ? fmtDate(t.date) : ''}</em></div>`; }).join('')}
      <div class="stat"><b class="num">${best.e ? kg(Math.round(best.e * 2) / 2) : '—'}</b><span>1RM משוערך מאימון</span><em>${best.e ? `${best.set.reps}×${kg(best.set.weight)}` : ''}</em></div>
    </div>
    <div class="section-title"><h2>התקדמות</h2></div>
    <div class="card chart-card" style="--lc:${l.color}">
      <div class="seg" style="margin-bottom:10px">${[['3m', '3 חו׳'], ['6m', '6 חו׳'], ['1y', 'שנה'], ['all', 'הכל']].map(([k, t]) => `<button data-range="${k}" aria-pressed="${range === k}">${t}</button>`).join('')}</div>
      <div class="chart" id="chart"></div>
      <div class="legend">${RMS().map((r, i) => `<span><svg class="lg" viewBox="0 0 18 4"><line x1="1" y1="2" x2="17" y2="2" stroke="${l.color}" stroke-width="2.5" stroke-linecap="round" ${dashes[i % dashes.length] ? `stroke-dasharray="${dashes[i % dashes.length]}"` : ''} opacity="${i ? .75 : 1}"/></svg>${r}RM</span>`).join('')}<span><i class="pt"></i>משוערך מאימונים</span></div>
    </div>
    <div class="section-title"><h2>בדיקות RM</h2><button class="btn sm primary" data-add>${ICON.plus} RM חדש</button></div>
    ${rmList(id)}
    <div class="section-title"><h2>טבלת אחוזים</h2><span class="muted small">${b ? b.src : ''}</span></div>
    ${rmSeg('data-tb', tableBase, 'mb', av)}
    ${b ? pctTable(b.w, null, tableBase) : '<div class="list"><div class="empty">הוסף RM כדי לראות טבלת אחוזים</div></div>'}
    <div class="section-title"><h2>סטים אחרונים</h2></div>
    ${recentSets(id)}`;
  $('[data-back]').onclick = () => go('#/home');
  $('[data-add]').onclick = () => rmSheet(id);
  $$('[data-range]').forEach(x => x.onclick = () => { range = x.dataset.range; $$('[data-range]').forEach(y => y.setAttribute('aria-pressed', y === x)); drawChart(id); });
  $$('[data-tb]').forEach(x => x.onclick = () => { tableBase = +x.dataset.tb; renderLift(id); });
  $$('[data-test]').forEach(x => x.onclick = () => rmSheet(id, db.tests.find(t => t.id === x.dataset.test)));
  $$('[data-wk]').forEach(x => x.onclick = () => go('#/workout/' + x.dataset.wk));
  drawChart(id);
}
function rmList(id) {
  const all = testsFor(id).filter(t => RMS().includes(t.rm)).reverse();
  if (!all.length) return `<div class="list"><div class="empty">הוסף ${RMS().map(r => r + 'RM').join(' או ')} כדי להתחיל לעקוב ולחשב אחוזים.</div></div>`;
  return `<div class="list" style="--lc:${LIFT(id).color}">${all.map((t, i) => {
    const prev = all.slice(i + 1).find(p => p.rm === t.rm);
    const d = prev ? t.weight - prev.weight : null;
    return `<button class="li" data-test="${t.id}"><span class="badge ${t.rm === RMS()[0] ? 'one' : ''}">${t.rm}RM</span>
      <div class="grow"><div class="t">${fmtLong(t.date)}</div>${t.note ? `<div class="s">${esc(t.note)}</div>` : ''}</div>
      ${d ? `<span class="delta small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${kg(Math.abs(d))}</span>` : ''}
      <span class="v">${kg(t.weight)} ק״ג</span></button>`;
  }).join('')}</div>`;
}
function pctTable(base, hl, rm = 1) {
  const rows = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105];
  // rough reps available at each intensity of this RM (inverse Epley)
  const reps = p => { const one = e1rm(base, rm), w = base * p / 100; return w >= one ? 1 : Math.max(1, Math.round(30 * (one / w - 1))); };
  return `<div class="list"><table class="pct-table">${rows.map(p => `<tr class="${p === hl ? 'hl' : ''}"><td class="num">${p}%</td><td class="reps">~${reps(p)} חזרות</td><td class="num">${kg(roundTo(base * p / 100, db.settings.round))} ק״ג</td></tr>`).join('')}</table></div>`;
}
function recentSets(id) {
  const ws = sortedWorkouts().filter(w => w.items.some(i => i.lift === id)).slice(0, 6);
  if (!ws.length) return `<div class="list"><div class="empty">אין עדיין אימונים עם התרגיל הזה.</div></div>`;
  return `<div class="list">${ws.map(w => {
    const sets = w.items.filter(i => i.lift === id).flatMap(i => i.sets);
    return `<button class="li" data-wk="${w.id}"><div class="grow"><div class="t">${fmtDate(w.date)}</div><div class="s num" style="direction:ltr;text-align:end">${summarizeSets(sets)}</div></div>${ICON.chev}</button>`;
  }).join('')}</div>`;
}

/* chart: one line per RM type, training e1RM as faint dots */
const rangeFrom = () => { const cut = { '3m': 91, '6m': 183, '1y': 365 }[range]; return cut ? new Date(Date.now() - cut * 864e5).toISOString().slice(0, 10) : ''; };
function drawChart(id) {
  const box = $('#chart'); if (!box) return;
  const from = rangeFrom();
  const series = RMS().map(r => testsFor(id, r).filter(t => t.date >= from).map(t => ({ d: t.date, v: t.weight })));
  const st = bestTraining(id).filter(t => t.date >= from).map(t => ({ d: t.date, v: Math.round(t.e * 10) / 10 }));
  plot(box, LIFT(id).color, [
    { pts: st, r: 4, op: .35, lbl: 'משוערך · ', noLine: true },
    ...series.map((s, i) => ({ pts: s, i, r: i ? 3.5 : 4.5, op: i ? .8 : 1, ring: true, lbl: RMS()[i] + 'RM · ' })).reverse()
  ]);
}
// Per-workout training numbers for a lift: heaviest weight, best estimated 1RM, total volume.
function trainingSeries(lift, metric) {
  return db.workouts.map(w => {
    const sets = w.items.filter(i => i.lift === lift).flatMap(i => i.sets);
    if (!sets.length) return null;
    const v = metric === 'top' ? Math.max(...sets.map(s => s.weight || 0))
      : metric === 'e1' ? Math.round(Math.max(...sets.map(s => e1rm(s.weight, s.reps))) * 10) / 10
      : sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
    return v ? { d: w.date, v } : null;
  }).filter(Boolean).sort((a, b) => a.d.localeCompare(b.d))
    // one point per day: keep the day's best
    .reduce((acc, p) => { const l = acc[acc.length - 1]; if (l && l.d === p.d) { if (p.v > l.v) l.v = p.v; } else acc.push({ ...p }); return acc; }, []);
}
function plot(box, color, layers, unit = 'ק״ג') {
  const all = layers.flatMap(l => l.pts);
  if (!all.length) { box.innerHTML = `<div class="chart-empty">אין נתונים בטווח הזה</div>`; return; }
  const W = Math.max(280, box.clientWidth || 320), H = 210, L = 44, R = 12, T = 12, B = 26;
  const xs = all.map(p => toDate(p.d).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 - x0 < 7 * 864e5) { x0 -= 4 * 864e5; x1 += 4 * 864e5; }
  let y0 = Math.min(...all.map(p => p.v)), y1 = Math.max(...all.map(p => p.v));
  const pad = Math.max(5, (y1 - y0) * 0.12); y0 = Math.max(0, y0 - pad); y1 += pad;
  const step = niceStep((y1 - y0) / 4); y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  const px = t => L + (t - x0) / (x1 - x0) * (W - L - R);
  const py = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const P = p => [px(toDate(p.d).getTime()), py(p.v)];
  let g = '';
  for (let v = y0; v <= y1 + 1e-9; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}"/><text x="${L - 6}" y="${py(v) + 4}" text-anchor="end">${kg(v)}</text>`;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = x0 + (x1 - x0) * i / ticks, d = new Date(t);
    g += `<text x="${px(t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}">${d.getDate()}/${d.getMonth() + 1}${range === 'all' || range === '1y' ? '/' + String(d.getFullYear()).slice(2) : ''}</text>`;
  }
  const dashes = ['', '6 5', '2 4', '10 4 2 4', '1 3'];
  const line = (s, i = 0) => s.length > 1 ? `<polyline points="${s.map(p => P(p).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${dashes[i % dashes.length] ? ` stroke-dasharray="${dashes[i % dashes.length]}" opacity=".75"` : ''}/>` : '';
  const dots = (s, r, op, ring, lbl = '') => s.map(p => { const [x, y] = P(p); return `<circle cx="${x}" cy="${y}" r="${r}" fill="${ring ? 'var(--surface)' : color}" stroke="${color}" stroke-width="${ring ? 2.5 : 0}" opacity="${op}"><title>${lbl}${fmtDate(p.d)} · ${kg(p.v)} ${unit}</title></circle>`; }).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="גרף התקדמות">${g}${layers.map(l => (l.noLine ? '' : line(l.pts, l.i)) + dots(l.pts, l.r ?? 4, l.op ?? 1, l.ring, l.lbl)).join('')}</svg>`;
}
/* ---------- progress: charts for every lift ---------- */
const METRICS = [
  ['rm', 'RM', 'בדיקות RM'],
  ['top', 'משקל מקס׳', 'המשקל הכבד ביותר בכל אימון'],
  ['e1', '1RM משוער', 'לפי הסט הטוב בכל אימון (Epley)'],
  ['vol', 'נפח', 'סך ק״ג × חזרות בכל אימון']
];
let metric = null;
function liftSeries(id, m, from) {
  if (m === 'rm') return availBases(id).map((r, i) => ({ pts: testsFor(id, r).filter(t => t.date >= from).map(t => ({ d: t.date, v: t.weight })), i, r: i ? 3.5 : 4.5, ring: true, lbl: r + 'RM · ', rm: r }));
  return [{ pts: trainingSeries(id, m).filter(p => p.d >= from), r: 3.5, ring: true }];
}
function renderProgress() {
  if (!metric) metric = db.tests.length ? 'rm' : 'top';
  const from = rangeFrom(), M = METRICS.find(x => x[0] === metric);
  const cards = lifts().map(l => ({ l, layers: liftSeries(l.id, metric, from) })).filter(c => c.layers.some(x => x.pts.length));
  view.innerHTML = `
    <div class="top"><div><h1>התקדמות</h1><p class="muted small">${M[2]}</p></div></div>
    <div class="seg" style="margin-bottom:8px">${METRICS.map(([k, t]) => `<button data-metric="${k}" aria-pressed="${k === metric}">${t}</button>`).join('')}</div>
    <div class="seg sm" style="margin-bottom:14px">${[['3m', '3 חודשים'], ['6m', '6 חודשים'], ['1y', 'שנה'], ['all', 'הכל']].map(([k, t]) => `<button data-range="${k}" aria-pressed="${range === k}">${t}</button>`).join('')}</div>
    <div class="stack">${cards.length ? cards.map(({ l, layers }) => {
      const main = layers[0].pts, first = main[0], last = main[main.length - 1];
      const d = main.length > 1 ? last.v - first.v : null, unit = metric === 'vol' ? 'ק״ג נפח' : 'ק״ג';
      return `<div class="card chart-card" style="--lc:${l.color}">
        <button class="pg-head" data-lift="${l.id}"><i class="dot"></i><b class="grow">${esc(l.name)}</b>
          <span class="pg-val"><b>${kg(last.v)}</b> <small class="muted">${metric === 'rm' ? layers[0].rm + 'RM' : unit}</small></span>
          ${d ? `<span class="delta small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${kg(Math.abs(d))}</span>` : ''}${ICON.chev}</button>
        <div class="chart" data-chart="${l.id}"></div>
        ${metric === 'rm' && layers.length > 1 ? `<div class="legend">${layers.map(x => `<span><svg class="lg" viewBox="0 0 18 4"><line x1="1" y1="2" x2="17" y2="2" stroke="${l.color}" stroke-width="2.5" ${x.i ? 'stroke-dasharray="6 5" opacity=".75"' : ''}/></svg>${x.rm}RM</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('') : `<div class="list"><div class="empty">${metric === 'rm' ? 'עוד אין בדיקות RM בטווח הזה.<br>מוסיפים RM בלחיצה על תרגיל במסך הראשי.' : 'עוד אין אימונים בטווח הזה.'}</div></div>`}</div>`;
  $$('[data-metric]').forEach(b => b.onclick = () => { metric = b.dataset.metric; renderProgress(); });
  $$('[data-range]').forEach(b => b.onclick = () => { range = b.dataset.range; renderProgress(); });
  $$('[data-lift]').forEach(b => b.onclick = () => go('#/lift/' + b.dataset.lift));
  drawProgressCharts(cards);
}
function drawProgressCharts(cards) {
  cards = cards || lifts().map(l => ({ l, layers: liftSeries(l.id, metric, rangeFrom()) }));
  cards.forEach(({ l, layers }) => { const box = $(`[data-chart="${l.id}"]`); if (box) plot(box, l.color, [...layers].reverse(), metric === 'vol' ? 'ק״ג נפח' : 'ק״ג'); });
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const m = location.hash.match(/#\/lift\/([\w-]+)/); if (m) drawChart(m[1]); else if (location.hash.startsWith('#/progress')) drawProgressCharts(); }, 150); });

/* RM add / edit sheet */
function rmSheet(lift, t) {
  // a new test defaults to the RM this lift is usually measured in
  const editing = !!t; t = t || { rm: testsFor(lift).slice(-1)[0]?.rm || RMS()[0], date: today(), weight: '', note: '' };
  let rm = t.rm;
  const s = sheet(`${editing ? 'עריכת' : 'הוספת'} RM · ${LIFT(lift).name}`, `
    <div class="stack">
      ${rmSeg('data-rm', rm)}
      <label class="field"><span>משקל (ק״ג)</span><input class="input num" id="rm-w" type="number" inputmode="decimal" step="0.5" min="0" value="${t.weight}" placeholder="0"></label>
      <p class="note" id="rm-hint"></p>
      <label class="field"><span>תאריך</span><input class="input" id="rm-d" type="date" value="${t.date}" max="${today()}"></label>
      <label class="field"><span>הערה (לא חובה)</span><input class="input" id="rm-n" value="${esc(t.note || '')}" placeholder="למשל: חגורה, RPE 9"></label>
    </div>`,
    `<div class="row">${editing ? `<button class="btn danger" data-del>${ICON.trash}</button>` : ''}<button class="btn primary block grow" data-ok>שמירה</button></div>`);
  const hint = () => {
    const w = num($('#rm-w', s.el).value);
    $('#rm-hint', s.el).textContent = rm !== 1 && w ? `1RM משוערך: ~${kg(roundTo(e1rm(w, rm), db.settings.round))} ק״ג` : '';
  };
  $$('[data-rm]', s.el).forEach(b => b.onclick = () => { rm = +b.dataset.rm; $$('[data-rm]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)); hint(); });
  $('#rm-w', s.el).oninput = hint; hint();
  setTimeout(() => $('#rm-w', s.el).focus(), 320);
  $('[data-ok]', s.el).onclick = () => {
    const w = num($('#rm-w', s.el).value), d = $('#rm-d', s.el).value;
    if (!w || w <= 0) return toast('צריך להזין משקל');
    if (!d) return toast('צריך לבחור תאריך');
    const rec = { ...t, lift, rm, weight: w, date: d, note: $('#rm-n', s.el).value.trim() };
    if (editing) db.tests = db.tests.map(x => x.id === t.id ? rec : x);
    else {
      const prevBest = Math.max(0, ...testsFor(lift, rm).map(x => x.weight));
      db.tests.push({ ...rec, id: uid(), created: Date.now() });
      if (prevBest && w > prevBest) setTimeout(() => toast(`שיא ${rm}RM חדש! +${kg(w - prevBest)} ק״ג 💪`), 350);
    }
    save(); drive.auto(true); s.close(); renderLift(lift);
  };
  const del = $('[data-del]', s.el);
  if (del) del.onclick = async () => { s.close(); if (await confirmBox(`למחוק את ה־${t.rm}RM מ־${fmtDate(t.date)}?`)) { db.tests = db.tests.filter(x => x.id !== t.id); save(); renderLift(lift); } };
}

/* ---------- workouts list ---------- */
function renderWorkouts() {
  const ws = sortedWorkouts();
  let html = `<div class="top"><div><h1>אימונים</h1><p class="muted small">${ws.length ? `${ws.length} אימונים מתועדים` : ''}</p></div><button class="btn sm primary" data-new>${ICON.plus} אימון</button></div>`;
  if (!ws.length) html += `<div class="list"><div class="empty">עוד אין אימונים.<br>תעד סטים לפי ק״ג או לפי אחוז מה־RM.</div></div>`;
  let month = '';
  ws.forEach((w, i) => {
    const m = w.date.slice(0, 7);
    if (m !== month) { if (month) html += '</div>'; month = m; html += `<div class="month">${fmtMonth(w.date)}</div><div class="list">`; }
    html += workoutRow(w);
    if (i === ws.length - 1) html += '</div>';
  });
  view.innerHTML = html;
  $('[data-new]').onclick = () => go('#/workout/new');
  $$('[data-wk]').forEach(b => b.onclick = () => go('#/workout/' + b.dataset.wk));
}

/* ---------- workout editor ---------- */
let draft = null;
function renderEditor(id) {
  if (id === 'new') {
    if (!draft || draft.id) draft = { date: today(), note: '', items: [] };
  } else if (id === 'copy') {
    if (!draft) return go('#/workout/new');
  } else {
    const w = db.workouts.find(x => x.id === id); if (!w) return go('#/workouts');
    if (!draft || draft.id !== id) draft = JSON.parse(JSON.stringify(w));
  }
  const d = draft, isNew = !d.id;
  view.innerHTML = `
    <button class="back" data-back>${ICON.back} אימונים</button>
    <div class="top"><div><h1>${isNew ? 'אימון חדש' : 'עריכת אימון'}</h1></div>
      ${!isNew ? `<div class="row"><button class="icon-btn" data-repeat aria-label="חזרה על האימון" title="חזרה על האימון">${ICON.copy}</button><button class="icon-btn" data-del aria-label="מחיקה" style="color:var(--over)">${ICON.trash}</button></div>` : ''}</div>
    <div class="stack">
      <label class="field"><span>תאריך</span><input class="input" type="date" id="w-date" value="${d.date}"></label>
      <div id="items" class="stack"></div>
      <div class="card addex-card"><h3 id="addex-title"></h3><div class="addex" id="addex"></div></div>
      <label class="field"><span>הערות</span><textarea class="input" id="w-note" placeholder="איך הרגיש, RPE, כאבים...">${esc(d.note)}</textarea></label>
    </div>
    <div class="save-bar"><button class="btn primary block" data-save>שמירת אימון</button></div>`;
  $('[data-back]').onclick = () => { draft = null; go('#/workouts'); };
  $('#w-date').onchange = e => { d.date = e.target.value || today(); drawItems(); };
  $('#w-note').oninput = e => d.note = e.target.value;
  $('[data-save]').onclick = saveDraft;
  const rp = $('[data-repeat]');
  if (rp) rp.onclick = () => {
    draft = { date: today(), note: '', items: d.items.map(i => {
      // keep the same base if it still exists; otherwise fall back to the only RM, or to kg
      const av = availBases(i.lift), base = av.includes(i.base) ? i.base : av.length === 1 ? av[0] : null;
      return { lift: i.lift, base, sets: i.sets.map(s => base ? { ...s } : { ...s, pct: null }) };
    }) };
    toast('הועתק לאימון חדש — אחוזים מחושבים לפי ה־RM הנוכחי'); go('#/workout/copy');
  };
  const del = $('[data-del]');
  if (del) del.onclick = async () => { if (await confirmBox(`למחוק את האימון מ־${fmtDate(d.date)}?`)) { db.workouts = db.workouts.filter(x => x.id !== d.id); draft = null; save(); go('#/workouts'); } };
  drawItems();
}
function drawItems() {
  const d = draft, box = $('#items');
  box.innerHTML = d.items.map((it, ii) => {
    const l = LIFT(it.lift), av = availBases(it.lift), base = it.base, b = baseRM(it.lift, base, d.date);
    return `<div class="ex" style="--lc:${l.color}" data-ii="${ii}">
      <div class="ex-head"><i class="dot"></i><h3>${esc(l.name)}</h3>
        <button class="icon-btn" data-rmex aria-label="הסרת תרגיל">${ICON.x}</button></div>
      <div class="ex-base">
        ${av.length > 1 ? `<span class="s">% מתוך</span><div class="seg sm">${av.map(r => `<button data-base="${r}" aria-pressed="${r === base}">${r}RM</button>`).join('')}</div>` : ''}
        <span class="s grow" style="text-align:end">${b ? `${av.length > 1 ? "" : "% מתוך "}<bdi>${base}RM = ${kg(b.w)}</bdi>` : 'אין RM — רישום בק״ג'}</span>
      </div>
      ${it.sets.map((s, si) => setRow(s, si, it)).join('')}
      <div class="ex-foot"><button class="btn sm" data-addset>${ICON.plus} סט</button>${it.sets.length ? '<button class="btn sm ghost" data-dupset>שכפל אחרון</button>' : ''}</div>
    </div>`;
  }).join('');
  // every exercise stays available (the same one can be added twice, e.g. heavy + back-off sets)
  const count = id => d.items.filter(i => i.lift === id).length;
  $('#addex-title').textContent = d.items.length ? 'הוספת תרגיל נוסף' : 'אילו תרגילים באימון? אפשר לבחור כמה';
  $('#addex').innerHTML = lifts().map(l => `<button data-addex="${l.id}" style="--lc:${l.color}" class="${count(l.id) ? 'on' : ''}"><i class="dot"></i>${esc(l.name)}${count(l.id) ? ` <b>✓${count(l.id) > 1 ? count(l.id) : ''}</b>` : ''}</button>`).join('')
    + `<button data-newex>${ICON.plus} תרגיל אחר</button>`;
  $('[data-newex]').onclick = () => {
    const s = sheet('תרגיל חדש', `<label class="field"><span>שם התרגיל</span><input class="input" id="nx" placeholder="למשל: מתח, חתירה, פרונט סקוואט"></label>
      <p class="note" style="margin-top:8px">התרגיל יישמר ברשימה ויופיע גם באימונים הבאים.</p>`, '<button class="btn primary block" data-ok>הוספה לאימון</button>');
    setTimeout(() => $('#nx', s.el).focus(), 320);
    $('[data-ok]', s.el).onclick = () => {
      const name = $('#nx', s.el).value.trim(); if (!name) return toast('צריך שם לתרגיל');
      const usedC = new Set(db.settings.lifts.map(x => x.color)), id = 'x' + uid();
      db.settings.lifts.push({ id, name, color: EXTRA_COLORS.find(c => !usedC.has(c)) || EXTRA_COLORS[db.settings.lifts.length % EXTRA_COLORS.length] });
      save(); s.close();
      d.items.push({ lift: id, base: null, sets: [{ reps: 8, pct: null, weight: null }] }); drawItems();
    };
  };
  $$('[data-addex]').forEach(b => b.onclick = () => {
    const lift = b.dataset.addex, av = availBases(lift);
    const add = base => {
      d.items.push({ lift, base, sets: [base ? { reps: 5, pct: 70, weight: null } : { reps: 5, pct: null, weight: null }] });
      drawItems();
    };
    if (av.length < 2) return add(av[0] || null); // only one RM entered (or none): use it
    askBase(lift, av, add);                       // several entered: ask
  });
  $$('.ex').forEach(ex => {
    const it = d.items[+ex.dataset.ii];
    $('[data-rmex]', ex).onclick = () => { d.items.splice(+ex.dataset.ii, 1); drawItems(); };
    $$('[data-base]', ex).forEach(b => b.onclick = () => {
      const nb = +b.dataset.base;
      if (!baseRM(it.lift, nb, d.date)) return toast(`אין ${nb}RM לתרגיל הזה`);
      it.base = nb; drawItems();
    });
    $('[data-addset]', ex).onclick = () => { const last = it.sets[it.sets.length - 1]; it.sets.push(last ? { ...last } : { reps: 5, pct: null, weight: null }); drawItems(); };
    const dup = $('[data-dupset]', ex); if (dup) dup.onclick = () => { it.sets.push({ ...it.sets[it.sets.length - 1] }); drawItems(); };
    $$('.set', ex).forEach(row => {
      const s = it.sets[+row.dataset.si];
      const upd = () => { row.querySelector('.calc').innerHTML = calcLine(s, it); };
      $('[data-reps]', row).oninput = e => { s.reps = parseInt(e.target.value) || null; };
      $('[data-val]', row).oninput = e => { const v = num(e.target.value); if (s.pct != null) s.pct = v ?? 0; else s.weight = v; upd(); };
      $('[data-unit]', row).onclick = () => {
        if (s.pct == null && !it.base) {
          const av = availBases(it.lift);
          if (!av.length) return toast('צריך קודם להזין RM לתרגיל');
          if (av.length > 1) return askBase(it.lift, av, nb => { it.base = nb; s.pct = s.weight ? Math.round(s.weight / baseRM(it.lift, nb, d.date).w * 100) : 70; drawItems(); });
          it.base = av[0];
        }
        const b = baseRM(it.lift, it.base, d.date);
        if (s.pct != null) { s.weight = setWeight(s, it.lift, d.date, it.base); s.pct = null; }
        else {
          if (!b) return toast(`צריך קודם להזין RM לתרגיל`);
          s.pct = s.weight ? Math.round(s.weight / b.w * 100) : 70;
        }
        drawItems();
      };
      $('[data-delset]', row).onclick = () => { it.sets.splice(+row.dataset.si, 1); drawItems(); };
    });
  });
}
function askBase(lift, av, done) {
  const s = sheet(`${LIFT(lift).name} · אחוזים מתוך?`, `<p class="note" style="margin-bottom:12px">לתרגיל הזה יש כמה RM. מאיזה לחשב את האחוזים באימון?</p>
    <div class="list">${av.map(r => { const b = baseRM(lift, r, draft.date); return `<button class="li" data-pick="${r}"><span class="badge one" style="--lc:${LIFT(lift).color}">${r}RM</span><div class="grow"><div class="t">${kg(b.w)} ק״ג</div><div class="s">${b.src}</div></div>${ICON.chev}</button>`; }).join('')}</div>`);
  $$('[data-pick]', s.el).forEach(b => b.onclick = () => { s.close(); done(+b.dataset.pick); });
}
function setRow(s, si, it) {
  const isPct = s.pct != null;
  return `<div class="set" data-si="${si}">
    <span class="n">${si + 1}</span>
    <input data-reps type="number" inputmode="numeric" min="1" step="1" value="${s.reps ?? ''}" placeholder="חזרות" aria-label="חזרות">
    <span class="x">×</span>
    <input data-val type="number" inputmode="decimal" min="0" step="${isPct ? 2.5 : 0.5}" value="${isPct ? s.pct : (s.weight ?? '')}" placeholder="${isPct ? '%' : 'ק״ג'}" aria-label="${isPct ? 'אחוז מה־RM' : 'משקל'}">
    <button class="unit ${isPct ? 'pct' : ''}" data-unit aria-label="החלפה בין ק״ג לאחוזים">${isPct ? '%' : 'ק״ג'}</button>
    <button class="del" data-delset aria-label="מחיקת סט">${ICON.trash}</button>
    <div class="calc">${calcLine(s, it)}</div>
  </div>`;
}
function calcLine(s, it) {
  const base = it.base;
  if (s.pct == null) {
    const b = baseRM(it.lift, base, draft.date);
    return b && s.weight ? `${Math.round(s.weight / b.w * 100)}% מה־${base}RM` : '';
  }
  const w = setWeight(s, it.lift, draft.date, base);
  return w != null ? `<b class="num">${kg(w)} ק״ג</b> · ${kg(s.pct)}% מה־${base}RM` : 'אין RM לחישוב';
}
function saveDraft() {
  const d = draft;
  // resolve % to kg at save time so history stays fixed even when the RM changes later
  const items = d.items.map(i => ({ lift: i.lift, base: i.base || null, sets: i.sets.map(s => ({ reps: s.reps, pct: s.pct ?? null, weight: setWeight(s, i.lift, d.date, i.base) })).filter(s => s.reps > 0 && s.weight > 0) })).filter(i => i.sets.length);
  if (!items.length) return toast('צריך לפחות סט אחד עם חזרות ומשקל');
  const empty = d.items.filter(i => !i.sets.some(s => s.reps > 0 && setWeight(s, i.lift, d.date, i.base) > 0)).map(i => LIFT(i.lift).name);
  if (empty.length && !d.confirmedEmpty) {
    d.confirmedEmpty = true;
    return toast(`חסר משקל ב: ${empty.join(', ')}. לחץ שוב לשמירה בלעדיהם`);
  }
  const rec = { id: d.id || uid(), created: d.created || Date.now(), date: d.date, note: (d.note || '').trim(), items };
  if (d.id) db.workouts = db.workouts.map(w => w.id === d.id ? rec : w); else db.workouts.push(rec);
  save(); drive.auto(true);
  // flag training e1RM above the tested 1RM
  const prs = items.map(i => { const b = latest(i.lift, 1); const e = Math.max(...i.sets.map(s => e1rm(s.weight, s.reps))); return b && e > b.weight ? LIFT(i.lift).name : null; }).filter(Boolean);
  draft = null; go('#/workouts');
  toast(prs.length ? `נשמר · ה־1RM המשוערך עבר את הבדיקה ב${prs.join(', ')} 🔥` : 'האימון נשמר');
}

/* ---------- percentage calculator ---------- */
let calcLift = null, calcPct = 80, calcBase = 1;
function renderCalc() {
  if (!lifts().some(l => l.id === calcLift)) calcLift = lifts()[0]?.id;
  const av = calcLift ? availBases(calcLift) : [], opts = av.length ? av : RMS();
  if (!opts.includes(calcBase)) calcBase = opts[0];
  const b = calcLift ? baseRM(calcLift, calcBase) : null;
  view.innerHTML = `
    <div class="top"><div><h1>מחשבון אחוזים</h1><p class="muted small">עיגול ל־${kg(db.settings.round)} ק״ג</p></div></div>
    <div class="chips">${lifts().map(l => `<button class="chip" data-cl="${l.id}" aria-pressed="${l.id === calcLift}">${esc(l.name)}</button>`).join('')}</div>
    <div class="card stack" style="margin-top:8px">
      ${rmSeg('data-cb', calcBase, '', opts)}
      <label class="field"><span>${calcBase}RM (ק״ג)</span><input class="input num" id="c-base" type="number" inputmode="decimal" value="${b ? kg(b.w) : ''}" placeholder="הזן ${calcBase}RM"></label>
      <p class="note">${b ? b.src : 'אין RM שמור לתרגיל — אפשר להזין ידנית'}</p>
      <label class="field"><span>אחוז: <b id="c-pv" class="num">${calcPct}%</b></span><input id="c-pct" type="range" min="40" max="110" step="2.5" value="${calcPct}" style="width:100%;accent-color:var(--accent)"></label>
      <div style="text-align:center"><div class="muted small">משקל לעבודה</div><div id="c-out" class="num" style="font-size:42px;font-weight:500"></div></div>
    </div>
    <div class="section-title"><h2>כל האחוזים</h2></div><div id="c-table"></div>`;
  const upd = () => {
    const base = num($('#c-base').value);
    $('#c-pv').textContent = calcPct + '%';
    $('#c-out').textContent = base ? kg(roundTo(base * calcPct / 100, db.settings.round)) + ' ק״ג' : '—';
    $('#c-table').innerHTML = base ? pctTable(base, calcPct, calcBase) : '';
  };
  $$('[data-cl]').forEach(c => c.onclick = () => { calcLift = c.dataset.cl; renderCalc(); });
  $$('[data-cb]').forEach(c => c.onclick = () => { calcBase = +c.dataset.cb; renderCalc(); });
  $('#c-base').oninput = upd;
  $('#c-pct').oninput = e => { calcPct = +e.target.value; upd(); };
  upd();
}

/* ---------- settings ---------- */
function renderSettings() {
  const st = db.settings, dr = st.drive;
  view.innerHTML = `
    <div class="top"><div><h1>הגדרות</h1></div></div>
    <div class="stack">
      <div class="list">
        <button class="li" data-share>${ICON.share}<div class="grow"><div class="t">שליחת האפליקציה לחבר</div><div class="s">כל אחד מקבל אפליקציה משלו, והנתונים נשמרים רק אצלו בטלפון</div></div>${ICON.chev}</button>
        ${standalone() ? '' : `<div class="li"><div class="grow"><div class="t">התקנה על הטלפון</div><div class="s">${installHow()}</div></div>${installEvt ? '<button class="btn sm primary" data-install>התקנה</button>' : ''}</div>`}
      </div>

      <div class="section-title" style="margin:8px 4px 0"><h2>תרגילים</h2><button class="btn sm" data-addlift>${ICON.plus} תרגיל</button></div>
      <div class="list">${st.lifts.map(l => `<div class="li" style="--lc:${l.color}"><i class="dot"></i><div class="grow"><div class="t" ${l.hidden ? 'style="opacity:.5"' : ''}>${esc(l.name)}</div></div>
        <button class="btn sm ghost" data-editlift="${l.id}">עריכה</button></div>`).join('')}</div>

      <div class="section-title" style="margin:8px 4px 0"><h2>סוגי RM</h2><button class="btn sm" data-addrm>${ICON.plus} RM</button></div>
      <div class="card"><div class="chips wrap">${RMS().map(r => `<span class="chip static">${r}RM${r !== 1 ? ` <button class="chip-x" data-delrm="${r}" aria-label="הסרת ${r}RM">${ICON.x}</button>` : ''}</span>`).join('')}</div>
        <p class="note" style="padding:6px 0 0">כל סוג RM נרשם עם תאריך, מופיע בגרף, ואפשר לחשב ממנו אחוזים באימון.</p></div>

      <div class="card stack">
        <div class="field"><span>עיגול משקל מחושב (ק״ג)</span><div class="seg">${[1, 1.25, 2.5, 5].map(r => `<button data-round="${r}" aria-pressed="${st.round === r}">${r}</button>`).join('')}</div></div>
        <div class="field"><span>תצוגה</span><div class="seg">${[['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, t]) => `<button data-theme="${k}" aria-pressed="${st.theme === k}">${t}</button>`).join('')}</div></div>
      </div>

      <div class="section-title" style="margin:8px 4px 0"><h2>גיבוי</h2></div>
      ${drive.available() ? `<div class="card stack">
        <div class="row"><div class="grow"><b>גיבוי אוטומטי לגוגל דרייב</b><p class="muted small">${dr.on
          ? (dr.lastAt ? `גיבוי אחרון: ${fmtStamp(dr.lastAt)}` : 'מחובר — הגיבוי הראשון יתבצע עכשיו') + (dr.error ? `<br><span class="down">${esc(dr.error)}</span>` : '')
          : 'קובץ אחד בדרייב שלך שמתעדכן אחרי כל אימון. רק לאפליקציה יש גישה אליו.'}</p></div>
          <label class="toggle"><input type="checkbox" id="drive-on" ${dr.on ? 'checked' : ''}><span></span></label></div>
        ${dr.on ? '<div class="row"><button class="btn sm" data-drive-now>גיבוי עכשיו</button><button class="btn sm ghost" data-drive-restore>שחזור מהדרייב</button></div>' : ''}
      </div>` : ''}
      <p class="note">הכל נשמר בטלפון הזה. בנוסף נשמר כל יום עותק מקומי (14 הימים האחרונים).</p>
      <div class="list">
        <button class="li" data-copy><div class="grow"><div class="t">העתקת הנתונים</div><div class="s">להעברה מספארי לאפליקציה במסך הבית, או לטלפון אחר</div></div>${ICON.chev}</button>
        <button class="li" data-paste><div class="grow"><div class="t">הדבקת נתונים</div><div class="s">מוסיף את מה שהועתק, בלי למחוק את מה שכבר כאן</div></div>${ICON.chev}</button>
        <button class="li" data-exp><div class="grow"><div class="t">שמירת גיבוי לקובץ</div><div class="s">${st.lastBackup ? 'אחרון: ' + new Date(st.lastBackup).toLocaleDateString('he-IL') : 'לשמירה בדרייב, בקבצים או במייל'}</div></div>${ICON.chev}</button>
        <button class="li" data-imp><div class="grow"><div class="t">שחזור מקובץ גיבוי</div><div class="s">מחליף את הנתונים הנוכחיים</div></div>${ICON.chev}</button>
        <button class="li" data-snaps><div class="grow"><div class="t">עותקים יומיים במכשיר</div><div class="s">${snaps().length} עותקים</div></div>${ICON.chev}</button>
        <button class="li" data-csv><div class="grow"><div class="t">ייצוא לאקסל (CSV)</div><div class="s">RM ואימונים</div></div>${ICON.chev}</button>
        <button class="li" data-wipe><div class="grow"><div class="t" style="color:var(--over)">מחיקת כל הנתונים</div></div></button>
      </div>
      <p class="note">${db.tests.length} בדיקות RM · ${db.workouts.length} אימונים<br>הערכות RM מחושבות בנוסחת Epley: 1RM = משקל × (1 + חזרות/30).</p>
    </div>`;
  $('[data-share]').onclick = shareApp;
  bindTransfer();
  bindInstall();
  $('[data-addlift]').onclick = () => liftSheet();
  $$('[data-editlift]').forEach(b => b.onclick = () => liftSheet(st.lifts.find(l => l.id === b.dataset.editlift)));
  $('[data-addrm]').onclick = addRmType;
  $$('[data-delrm]').forEach(b => b.onclick = async () => {
    const r = +b.dataset.delrm, n = db.tests.filter(t => t.rm === r).length;
    if (n && !await confirmBox(`להסיר את ${r}RM מהרשימה? ${n} הבדיקות שנרשמו יישמרו ויחזרו אם תוסיף אותו שוב.`, 'הסרה')) return;
    st.rmTypes = st.rmTypes.filter(x => x !== r); save(); renderSettings();
  });
  $$('[data-round]').forEach(b => b.onclick = () => { st.round = +b.dataset.round; save(); renderSettings(); });
  $$('[data-theme]').forEach(b => b.onclick = () => { st.theme = b.dataset.theme; save(); applyTheme(); renderSettings(); });
  const don = $('#drive-on');
  if (don) don.onchange = () => don.checked ? drive.connect() : drive.disconnect();
  const dn = $('[data-drive-now]'); if (dn) dn.onclick = () => drive.backup(true, true);
  const drs = $('[data-drive-restore]'); if (drs) drs.onclick = () => drive.restore();
  $('[data-exp]').onclick = exportJSON;
  $('[data-imp]').onclick = () => $('#file-json').click();
  $('[data-snaps]').onclick = snapsSheet;
  $('[data-csv]').onclick = exportCSV;
  $('[data-wipe]').onclick = async () => { if (await confirmBox('למחוק את כל בדיקות ה־RM והאימונים? אי אפשר לבטל.', 'מחיקת הכל')) { db = normalize({ settings: db.settings }); save(); toast('נמחק'); renderSettings(); } };
}
function liftSheet(l) {
  const editing = !!l, hasData = l && (db.tests.some(t => t.lift === l.id) || db.workouts.some(w => w.items.some(i => i.lift === l.id)));
  const s = sheet(editing ? 'עריכת תרגיל' : 'תרגיל חדש', `<div class="stack">
      <label class="field"><span>שם התרגיל</span><input class="input" id="lf-n" value="${esc(l?.name || '')}" placeholder="למשל: פרונט סקוואט"></label>
      ${editing ? `<label class="row"><span class="grow">להציג בתרגילים ובאימונים</span><span class="toggle"><input type="checkbox" id="lf-v" ${l.hidden ? '' : 'checked'}><span></span></span></label>` : ''}
      ${editing && hasData ? '<p class="note">יש נתונים לתרגיל הזה, לכן אפשר רק להסתיר אותו. הנתונים נשמרים.</p>' : ''}
    </div>`,
    `<div class="row">${editing && !hasData ? `<button class="btn danger" data-del>${ICON.trash}</button>` : ''}<button class="btn primary block grow" data-ok>שמירה</button></div>`);
  setTimeout(() => $('#lf-n', s.el).focus(), 320);
  $('[data-ok]', s.el).onclick = () => {
    const name = $('#lf-n', s.el).value.trim(); if (!name) return toast('צריך שם לתרגיל');
    if (editing) { l.name = name; l.hidden = !$('#lf-v', s.el).checked; }
    else {
      const used = new Set(db.settings.lifts.map(x => x.color));
      db.settings.lifts.push({ id: 'x' + uid(), name, color: EXTRA_COLORS.find(c => !used.has(c)) || EXTRA_COLORS[db.settings.lifts.length % EXTRA_COLORS.length] });
    }
    save(); s.close(); renderSettings();
  };
  const del = $('[data-del]', s.el);
  if (del) del.onclick = () => { db.settings.lifts = db.settings.lifts.filter(x => x.id !== l.id); save(); s.close(); renderSettings(); };
}
function addRmType() {
  const s = sheet('הוספת סוג RM', `<div class="stack">
      <label class="field"><span>מספר חזרות</span><input class="input num" id="rmt" type="number" inputmode="numeric" min="2" max="20" placeholder="למשל 3"></label>
      <div class="chips">${[2, 3, 8, 10].filter(r => !RMS().includes(r)).map(r => `<button class="chip" data-q="${r}">${r}RM</button>`).join('')}</div>
    </div>`, '<button class="btn primary block" data-ok>הוספה</button>');
  $$('[data-q]', s.el).forEach(b => b.onclick = () => { $('#rmt', s.el).value = b.dataset.q; });
  $('[data-ok]', s.el).onclick = () => {
    const r = parseInt($('#rmt', s.el).value);
    if (!(r >= 1 && r <= 20)) return toast('מספר חזרות בין 1 ל־20');
    if (RMS().includes(r)) return toast(`${r}RM כבר ברשימה`);
    db.settings.rmTypes = [...RMS(), r].sort((a, b) => a - b); save(); s.close(); renderSettings();
  };
}

/* ---------- backups: file, daily on-device snapshots ---------- */
const payload = () => ({ app: 'koach', version: 2, exported: new Date().toISOString(), tests: db.tests, workouts: db.workouts, settings: { ...db.settings, drive: undefined } });
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function exportJSON() {
  const text = JSON.stringify(payload(), null, 1);
  const name = `koach-backup-${today()}.json`;
  const file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'גיבוי יומן כוח' }); } catch (e) { if (e.name === 'AbortError') return; download(name, text, 'application/json'); }
  } else download(name, text, 'application/json');
  db.settings.lastBackup = Date.now(); save(); toast('הגיבוי נוצר');
  if (/^#\/(settings|home)|^$/.test(location.hash)) route();
}
function restoreFrom(d) {
  if (!Array.isArray(d.tests) || !Array.isArray(d.workouts)) throw new Error('bad');
  snapshot(true); // keep what we had, just in case
  const keepDrive = db.settings.drive;
  db = normalize({ tests: d.tests, workouts: d.workouts, settings: { ...(d.settings || {}), drive: keepDrive } });
  save(); applyTheme(); route();
}
/* ---------- move data between Safari and the home-screen app (separate storage on iPhone) ---------- */
const PFX = 'KOACH1:';
function transferCode() {
  const json = JSON.stringify({ tests: db.tests, workouts: db.workouts, settings: { lifts: db.settings.lifts, rmTypes: db.settings.rmTypes, round: db.settings.round } });
  return PFX + btoa(unescape(encodeURIComponent(json)));
}
function parseTransfer(text) {
  const t = String(text || '').trim(), i = t.indexOf(PFX);
  if (i < 0) throw new Error('nocode');
  const d = JSON.parse(decodeURIComponent(escape(atob(t.slice(i + PFX.length).split(/\s/)[0]))));
  if (!Array.isArray(d.tests) || !Array.isArray(d.workouts)) throw new Error('bad');
  return d;
}
// Union by id, so nothing already here is lost.
function mergeIn(d) {
  snapshot(true);
  const byId = (a, b) => { const m = new Map(a.map(x => [x.id, x])); b.forEach(x => { if (!m.has(x.id)) m.set(x.id, x); }); return [...m.values()]; };
  const before = db.tests.length + db.workouts.length;
  db.tests = byId(db.tests, d.tests); db.workouts = byId(db.workouts, d.workouts);
  const known = new Set(db.settings.lifts.map(l => l.id));
  (d.settings?.lifts || []).forEach(l => { if (!known.has(l.id)) db.settings.lifts.push(l); });
  db.settings.rmTypes = [...new Set([...db.settings.rmTypes, ...(d.settings?.rmTypes || [])])].sort((a, b) => a - b);
  save();
  return db.tests.length + db.workouts.length - before;
}
async function copyTransfer() {
  if (!hasData(db)) return toast('אין עדיין נתונים להעתיק');
  const code = transferCode();
  try { await navigator.clipboard.writeText(code); toast('הנתונים הועתקו ✓ עכשיו פתח את האפליקציה ממסך הבית ולחץ „הדבקת נתונים”'); }
  catch (e) {
    const s = sheet('העתקת הנתונים', `<p class="note" style="margin-bottom:8px">סמן הכל והעתק:</p><textarea class="input" style="min-height:140px;direction:ltr;font-size:12px" readonly>${code}</textarea>`);
    const ta = $('textarea', s.el); ta.focus(); ta.select();
  }
}
function pasteTransfer() {
  const s = sheet('הדבקת נתונים', `<div class="stack">
      <p class="note">ב${isIOS() ? 'ספארי' : 'דפדפן'}: הגדרות ← „העתקת הנתונים”. אחר כך חזור לכאן והדבק.</p>
      <button class="btn primary block" data-clip>הדבקה מהלוח</button>
      <textarea class="input" id="tr-code" style="min-height:110px;direction:ltr;font-size:12px" placeholder="או הדבק כאן ידנית (לחיצה ארוכה ← הדבק)"></textarea>
    </div>`, '<button class="btn block" data-go>העברה</button>');
  const run = text => {
    try { const n = mergeIn(parseTransfer(text)); s.close(); toast(n ? `הועברו ${n} רשומות ✓` : 'הכל כבר היה כאן'); route(); }
    catch (e) { toast(e.message === 'nocode' ? 'לא נמצא קוד נתונים — העתק שוב מהדפדפן' : 'הקוד לא תקין — העתק שוב'); }
  };
  $('[data-clip]', s.el).onclick = async () => {
    try { const t = await navigator.clipboard.readText(); $('#tr-code', s.el).value = t; run(t); }
    catch (e) { toast('אין גישה ללוח — הדבק בתיבה ידנית'); $('#tr-code', s.el).focus(); }
  };
  $('[data-go]', s.el).onclick = () => run($('#tr-code', s.el).value);
}
function transferCard() {
  if (!isIOS()) return '';
  if (standalone() && !hasData(db)) return `<div class="card install"><div class="grow"><b>רשמת כבר נתונים בספארי?</b><p class="muted small">באייפון, האפליקציה במסך הבית שומרת בנפרד מספארי. אפשר להעביר אותם לכאן פעם אחת.</p></div><div class="col"><button class="btn sm primary" data-paste>העברה</button></div></div>`;
  if (!standalone() && hasData(db) && !db.settings.transferDismissed) return `<div class="card install"><div class="grow"><b>מתקין למסך הבית?</b><p class="muted small">שם הנתונים נשמרים בנפרד. העתק אותם עכשיו, ואחרי ההתקנה לחץ „העברה” באפליקציה.</p></div><div class="col"><button class="btn sm primary" data-copy>העתקה</button><button class="icon-btn" data-tdismiss aria-label="סגירה">${ICON.x}</button></div></div>`;
  return '';
}
function bindTransfer() {
  const c = $('[data-copy]'); if (c) c.onclick = copyTransfer;
  const p = $('[data-paste]'); if (p) p.onclick = pasteTransfer;
  const d = $('[data-tdismiss]'); if (d) d.onclick = () => { db.settings.transferDismissed = true; save(); route(); };
}
$('#file-json').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.tests) || !Array.isArray(d.workouts)) throw new Error();
    if (!await confirmBox(`לשחזר ${d.tests.length} בדיקות RM ו־${d.workouts.length} אימונים? הנתונים הנוכחיים יוחלפו.`, 'שחזור')) return;
    restoreFrom(d); toast('שוחזר בהצלחה');
  } catch (_) { toast('הקובץ לא תקין'); }
};
function snaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; } catch (e) { return []; } }
function snapshot(force) {
  if (!db.tests.length && !db.workouts.length) return;
  const list = snaps(), day = today();
  if (!force && list[0] && list[0].day === day) list[0] = { day, at: Date.now(), data: { tests: db.tests, workouts: db.workouts } };
  else list.unshift({ day, at: Date.now(), data: { tests: db.tests, workouts: db.workouts } });
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 14))); }
  catch (e) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 3))); } catch (_) { /* full */ } }
}
function snapsSheet() {
  const list = snaps();
  const s = sheet('עותקים יומיים במכשיר', list.length ? `<p class="note" style="margin-bottom:10px">עותק אחד לכל יום שבו נרשם משהו. לחיצה משחזרת אותו (המצב הנוכחי נשמר קודם כעותק).</p>
    <div class="list">${list.map((x, i) => `<button class="li" data-snap="${i}"><div class="grow"><div class="t">${fmtLong(x.day)}</div><div class="s">${x.data.tests.length} RM · ${x.data.workouts.length} אימונים · ${fmtStamp(x.at)}</div></div>${ICON.chev}</button>`).join('')}</div>`
    : '<div class="empty">עוד אין עותקים</div>');
  $$('[data-snap]', s.el).forEach(b => b.onclick = async () => {
    const x = list[+b.dataset.snap]; s.close();
    if (await confirmBox(`לשחזר את המצב מ־${fmtDate(x.day)}?`, 'שחזור', false)) { restoreFrom({ ...x.data, settings: db.settings }); toast('שוחזר'); }
  });
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['סוג', 'תאריך', 'תרגיל', 'סט', 'חזרות', 'משקל', 'אחוז', 'בסיס', 'הערה'].map(q).join(',')];
  [...db.tests].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([`${t.rm}RM`, t.date, LIFT(t.lift).name, '', t.rm, t.weight, '', '', t.note].map(q).join(',')));
  [...db.workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach(w => w.items.forEach(i => i.sets.forEach((s, si) =>
    rows.push(['אימון', w.date, LIFT(i.lift).name, si + 1, s.reps, s.weight, s.pct ?? '', s.pct != null ? `${i.base || 1}RM` : '', si === 0 ? w.note : ''].map(q).join(',')))));
  download(`koach-${today()}.csv`, '﻿' + rows.join('\n'), 'text/csv');
}

/* ---------- Google Drive auto-backup ----------
   Uses Google Identity Services in the browser (no server). Scope drive.file: the app
   can only see the one file it created. Google needs a click to hand out a new token,
   so uploads run right after the user saves something; a token lasts about an hour. */
const drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const NAME = 'יומן כוח – גיבוי.json';
  let client = null, pending = null, loading = null;
  const available = () => !!CFG.googleClientId;
  const st = () => db.settings.drive;
  const tok = () => { try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY)); return t && t.exp > Date.now() + 60e3 ? t.v : null; } catch (e) { return null; } };
  function load() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return loading || (loading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = res; s.onerror = () => { loading = null; rej(new Error('net')); }; document.head.appendChild(s);
    }));
  }
  function init() {
    if (client || !window.google?.accounts?.oauth2) return client;
    client = google.accounts.oauth2.initTokenClient({
      client_id: CFG.googleClientId, scope: SCOPE,
      callback: r => {
        const p = pending; pending = null; if (!p) return;
        if (r.error || !r.access_token) return p.rej(new Error(r.error || 'denied'));
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 }));
        p.res(r.access_token);
      },
      error_callback: e => { const p = pending; pending = null; if (p) p.rej(new Error(e.type || 'popup')); }
    });
    return client;
  }
  // Must be called synchronously inside a click handler when a popup may be needed.
  function token(consent) {
    const t = tok(); if (t) return Promise.resolve(t);
    if (!init()) return Promise.reject(new Error('notready'));
    return new Promise((res, rej) => { pending = { res, rej }; client.requestAccessToken({ prompt: consent ? 'consent' : '' }); });
  }
  const hash = () => { const s = JSON.stringify([db.tests, db.workouts, db.settings.lifts, db.settings.rmTypes]); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length; };
  async function api(t, url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
    if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error('auth'); }
    return r;
  }
  async function upload(t) {
    const body = JSON.stringify(payload());
    if (st().fileId) {
      const r = await api(t, `https://www.googleapis.com/upload/drive/v3/files/${st().fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      if (r.ok) return;
      if (r.status !== 404 && r.status !== 403) throw new Error('http ' + r.status);
      st().fileId = null; // file deleted in Drive: create a new one
    }
    const boundary = 'koach' + uid();
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NAME, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const r = await api(t, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
    if (!r.ok) throw new Error('http ' + r.status);
    st().fileId = (await r.json()).id;
  }
  const errText = e => e.message === 'auth' || /denied|access_denied|popup/.test(e.message) ? 'צריך לאשר שוב את הגישה לדרייב (לחץ „גיבוי עכשיו”)' : e.message === 'net' || e instanceof TypeError ? 'אין חיבור — ננסה שוב בפעם הבאה' : 'הגיבוי לדרייב נכשל';
  async function backup(interactive, announce) {
    try {
      const t = await token(false);
      await upload(t);
      Object.assign(st(), { lastAt: Date.now(), lastHash: hash(), error: null }); localStorage.setItem(KEY, JSON.stringify(db));
      if (announce) toast('גובה לגוגל דרייב ✓');
    } catch (e) {
      st().error = errText(e); localStorage.setItem(KEY, JSON.stringify(db));
      if (announce || interactive) toast(st().error);
    }
    if (location.hash.startsWith('#/settings')) renderSettings();
  }
  return {
    available,
    // fromClick: called right after a user action, so a token popup is allowed if one is needed
    auto(fromClick) {
      if (!available() || !st().on || st().lastHash === hash()) return;
      if (tok()) return void backup(false, false);
      // no valid token: ask Google again only from a click, and at most every few hours
      if (fromClick && client && (!st().lastAt || Date.now() - st().lastAt > 6 * 3600e3 || st().error)) backup(false, false);
    },
    backup,
    async connect() {
      try {
        if (!init()) { await load(); init(); }
        const t = await token(true);
        st().on = true; save();
        await upload(t);
        Object.assign(st(), { lastAt: Date.now(), lastHash: hash(), error: null }); save();
        toast('מחובר לגוגל דרייב ✓');
      } catch (e) {
        st().on = false; save(); toast(e.message === 'notready' ? 'החיבור לגוגל עוד נטען — נסה שוב' : 'החיבור לדרייב בוטל');
      }
      renderSettings();
    },
    disconnect() {
      const t = tok();
      if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
      localStorage.removeItem(TOKEN_KEY);
      Object.assign(st(), { on: false, error: null }); save(); renderSettings();
      toast('הגיבוי לדרייב כובה. הקובץ נשאר בדרייב שלך');
    },
    async restore() {
      try {
        const t = await token(false);
        if (!st().fileId) throw new Error('nofile');
        const r = await api(t, `https://www.googleapis.com/drive/v3/files/${st().fileId}?alt=media`);
        if (!r.ok) throw new Error('nofile');
        const d = await r.json();
        if (!await confirmBox(`לשחזר מהדרייב ${d.tests.length} בדיקות RM ו־${d.workouts.length} אימונים (${d.exported ? fmtStamp(d.exported) : ''})? הנתונים הנוכחיים יוחלפו.`, 'שחזור', false)) return;
        restoreFrom(d); toast('שוחזר מהדרייב');
      } catch (e) { toast(e.message === 'nofile' ? 'לא נמצא גיבוי בדרייב' : errText(e)); }
    },
    boot() { if (available() && st().on) load().then(() => { init(); this.auto(false); }).catch(() => {}); else if (available()) load().then(init).catch(() => {}); }
  };
})();

function applyTheme() {
  const t = db.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

/* ---------- boot ---------- */
recoverIfWiped();
checkStorage();
// opening animation on every open; tap to skip
(() => {
  const sp = $('#splash'); if (!sp) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return sp.remove();
  // cracks: jagged lines radiating from the impact, flattened onto the floor plane
  let r = 2166136261 ^ Date.now(); const rnd = () => ((r = Math.imul(r ^ (r >>> 15), 2246822507) ^ Math.imul(r ^ (r >>> 13), 3266489909)) >>> 0) / 4294967296;
  const cx = 200, cy = 80, flat = 0.36, paths = [];
  const crack = (x, y, ang, len, w, depth, wait) => {
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`, px = x, py = y, a = ang;
    const steps = 5 + (rnd() * 4 | 0);
    for (let i = 0; i < steps; i++) {
      a += (rnd() - .5) * .9; const l = len / steps * (.6 + rnd() * .8);
      px += Math.cos(a) * l; py += Math.sin(a) * l * flat; d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
      if (depth < 2 && rnd() < .35) crack(px, py, a + (rnd() < .5 ? -1 : 1) * (.5 + rnd() * .7), len * (.35 + rnd() * .3), w * .55, depth + 1, wait + .05 + i * .025);
    }
    paths.push({ d, w, dur: .22 + len / 900, wait });
  };
  const n = 9 + (rnd() * 4 | 0);
  for (let i = 0; i < n; i++) { const ang = Math.PI * 2 * i / n + (rnd() - .5) * .5; crack(cx + Math.cos(ang) * 24, cy + Math.sin(ang) * 24 * flat, ang, 90 + rnd() * 110, 2.6 + rnd() * 1.6, 0, rnd() * .06); }
  $('.sp-cracks', sp).innerHTML = paths.map(p => `<path class="h" pathLength="1" d="${p.d}" stroke-width="${(p.w * .5).toFixed(2)}" style="--d:${p.dur.toFixed(2)}s;--w:${p.wait.toFixed(2)}s"/><path class="c" pathLength="1" d="${p.d}" stroke-width="${p.w.toFixed(2)}" style="--d:${p.dur.toFixed(2)}s;--w:${p.wait.toFixed(2)}s"/>`).join('');
  const debris = () => {
    const box = $('.sp-debris', sp), H = innerHeight;
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('i'), s = 2 + rnd() * 5, g = 100 + rnd() * 70 | 0;
      el.style.cssText = `width:${s}px;height:${s * (.6 + rnd() * .8)}px;background:rgb(${g},${g - 6},${g - 14})`;
      box.appendChild(el);
      const vx = (rnd() - .5) * 340, vy = -(160 + rnd() * 320), T = .9 + rnd() * .5, frames = [];
      for (let k = 0; k <= 12; k++) { const t = T * k / 12, y = Math.min(vy * t + 900 * t * t, H * .02 + rnd() * 10); frames.push({ transform: `translate(${(vx * t).toFixed(1)}px,${y.toFixed(1)}px) rotate(${(k * 60 * (rnd() < .5 ? -1 : 1)) | 0}deg)`, opacity: k > 9 ? 1 - (k - 9) / 3 : 1 }); }
      el.animate(frames, { duration: T * 1000, easing: 'linear', fill: 'forwards' });
    }
  };
  // the logo drops from the top onto the kettlebell's body, like a stamp; the name stays up top
  const stamp = () => {
    const logo = $('.sp-logo', sp), kb = $('.sp-kb', sp);
    const a = logo.getBoundingClientRect(), k = kb.getBoundingClientRect();
    const size = k.width * .56, tx = k.left + k.width / 2, ty = k.top + k.height * .64; // centre of the bell
    const dx = tx - (a.left + a.width / 2), dy = ty - (a.top + a.height / 2), sc = size / a.width;
    logo.animate([
      { transform: 'none', filter: 'drop-shadow(0 10px 30px rgba(0,0,0,.6))' },
      { transform: `translate(${dx * .15}px,${dy * .05 - 14}px) scale(1.04)`, offset: .25 },
      { transform: `translate(${dx}px,${dy}px) scale(${sc * 1.12})`, offset: .82, filter: 'drop-shadow(0 18px 18px rgba(0,0,0,.7))' },
      { transform: `translate(${dx}px,${dy}px) scale(${sc})`, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.8)) brightness(.9) contrast(1.05)' }
    ], { duration: 750, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    setTimeout(() => {
      // curved-surface shading over the stamped logo so it sits on the iron ball
      const sh = document.createElement('div'); sh.className = 'sp-shade';
      sh.style.cssText = `left:${tx - size / 2}px;top:${ty - size / 2}px;width:${size}px;height:${size}px`;
      sp.appendChild(sh); sh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'forwards' });
      kb.animate([{ transform: 'translateY(5px) scale(1)' }, { transform: 'translateY(8px) scale(1.02,.97)' }, { transform: 'translateY(5px) scale(1)' }], { duration: 220, easing: 'ease-out' });
      sp.animate([{ transform: 'translateY(5px)' }, { transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
      try { navigator.vibrate && navigator.vibrate(30); } catch (e) { /* ignore */ }
    }, 750);
  };
  // the impact happens exactly when the fall animation ends; everything after is timed from there
  const timers = [];
  let hit = false;
  const impact = () => {
    if (hit) return; hit = true;
    sp.classList.add('hit'); debris(); try { navigator.vibrate && navigator.vibrate([70, 40, 30]); } catch (e) { /* ignore */ }
    timers.push(setTimeout(() => sp.classList.add('logo'), 1200), setTimeout(stamp, 2300), setTimeout(() => sp.classList.add('out'), 4300), setTimeout(() => sp.remove(), 4900));
  };
  $('.sp-kb', sp).addEventListener('animationend', e => { if (e.animationName === 'spFall') impact(); });
  timers.push(setTimeout(impact, 2500)); // safety net if the animation event never fires
  sp.onclick = () => { timers.forEach(clearTimeout); sp.classList.add('out'); setTimeout(() => sp.remove(), 600); };
})();
applyTheme();
route();
snapshot();
drive.boot();
// Updates: a new version installs in the background; when it takes over, offer a one-tap reload.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller; // false on the very first visit
  navigator.serviceWorker.register('sw.js').then(reg => {
    // look for a new version whenever the app comes back to the screen (at most every 10 minutes)
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 10 * 60e3) { last = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBar(); });
}
function showUpdateBar() {
  if ($('#update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span class="grow"><b>יש גרסה חדשה</b><small>הנתונים שלך נשמרים</small></span><button class="btn sm primary" data-upd>עדכון</button><button class="icon-btn" data-later aria-label="אחר כך">${ICON.x}</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
  $('[data-upd]', bar).onclick = async () => {
    if (draft && draft.items && draft.items.length && !await confirmBox('יש אימון שלא נשמר. לעדכן בכל זאת?', 'עדכון', false)) return;
    location.reload();
  };
  $('[data-later]', bar).onclick = () => { bar.classList.remove('show'); setTimeout(() => bar.remove(), 300); };
}
})();
