/* יומן כח-ZONE — nutrition: stars (protein / fat / carbs, as with the coach) and grams + calories side by side.
   Optional per person (Settings). Data lives with the rest of the app's data on this device.
   Linked to training: a day with a logged workout is a training day and can get its own carb target. */
(() => {
'use strict';
const K = () => window.KOACH;
const MAC = [['p', 'חלבון'], ['f', 'שומן'], ['c', 'פחמימה']];
const KCAL = { p: 4, f: 9, c: 4 };
const DEFAULT_MEALS = ['בוקר', 'ביניים', 'צהריים', 'אחה״צ', 'ערב'];
const ICO = {
  fork: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-3 4-3 7 0 1.7 1.3 3 3 3v8"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  bar: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>'
};

/* ---------- data ---------- */
function N() {
  const db = K().db;
  if (!db.nutrition) db.nutrition = {};
  const n = db.nutrition;
  const def = { on: false, grams: { p: 20, f: 10, c: 20 }, target: { p: 4, f: 3, c: 5 }, cTrain: null, cRest: null,
    meals: DEFAULT_MEALS.slice(), foods: [], fav: [], log: [], weights: [], claudeUrl: '', dayType: {}, body: null, plan: {} };
  for (const k in def) if (n[k] === undefined || n[k] === null && def[k] !== null) n[k] = def[k];
  return n;
}
const save = () => K().save();
const r2 = v => Math.round(v * 100) / 100;
const fmt = v => K().kg(r2(v));
const gramsOf = (k, stars) => stars * N().grams[k];
const kcalOf = st => Math.round(MAC.reduce((a, [k]) => a + gramsOf(k, st[k] || 0) * KCAL[k], 0));
const addDays = (iso, n) => { const d = K().toDate(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const workoutsOn = date => K().db.workouts.filter(w => w.date === date);
const isTrain = date => { const t = N().dayType[date]; return t ? t === 'train' : workoutsOn(date).length > 0; };
/* Coach's day-by-day plan (Lulik's table): carbs change daily, fat is usually fixed, protein is a
   minimum ("4+") or a range ("4-5"); some days carry only a note ("להשתדל להקפיד על החלבון", "חופשה"). */
function parseProtein(txt) {
  const t = String(txt ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)\+$/); if (m) return { p: +m[1], plus: true };
  m = t.match(/^(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)$/); if (m) return { p: +m[1], pMax: +m[2] };
  m = t.match(/^(\d+(?:\.\d+)?)$/); if (m) return { p: +m[1] };
  return null;
}
const proteinText = e => e.plus ? `${fmt(e.p)}+` : e.pMax != null ? `${fmt(e.p)}-${fmt(e.pMax)}` : (e.p != null ? fmt(e.p) : '');
const planOn = date => N().plan[date] || null;
const hasNumbers = e => e && (e.c != null || e.f != null || e.p != null);
function targetFor(date) {
  const n = N(), t = n.target, tr = isTrain(date), pl = planOn(date);
  const base = { p: +t.p || 0, f: +t.f || 0, c: tr ? (n.cTrain ?? +t.c ?? 0) : (n.cRest ?? +t.c ?? 0) };
  if (hasNumbers(pl)) return { p: pl.p ?? base.p, f: pl.f ?? base.f, c: pl.c ?? base.c, plus: !!pl.plus, pMax: pl.pMax ?? null, note: pl.note || '', src: 'plan' };
  return { ...base, note: pl?.note || '', src: pl ? 'note' : 'default' };
}
// target as the coach writes it, and whether eating above it counts as "over"
const targetText = (m, tg) => m === 'p' ? proteinText(tg) : fmt(tg[m]);
const isOver = (m, e, tg) => m === 'p' ? (tg.plus ? false : e > (tg.pMax ?? tg.p) + .01) : (tg[m] && e > tg[m] + .01);
const entriesOn = date => N().log.filter(e => e.date === date);
function totals(list) {
  const t = { p: 0, f: 0, c: 0 };
  list.forEach(e => MAC.forEach(([k]) => { t[k] += (e[k] || 0) * (e.qty || 1); }));
  return t;
}
function library() {
  const seed = (window.SEED_FOODS || []).map((f, i) => ({ id: 's' + i, name: f[0], serving: f[1], p: f[2], f: f[3], c: f[4], note: f[5] }));
  return [...N().foods, ...seed];
}
function recent() {
  const seen = new Set(), out = [];
  [...N().log].sort((a, b) => (b.at || 0) - (a.at || 0)).forEach(e => {
    if (seen.has(e.name)) return; seen.add(e.name);
    const lib = N().foods.find(f => f.name === e.name); // a saved food keeps its label values
    out.push(lib ? { ...lib, id: 'r:' + e.name } : e.p100 != null
      ? { id: 'r:' + e.name, name: e.name, serving: '100 גרם', ...starsFromGrams(labelGrams({ p: e.p100, f: e.f100, c: e.c100 }, 100)), p100: e.p100, f100: e.f100, c100: e.c100, g: e.grams }
      : { id: 'r:' + e.name, name: e.name, serving: e.serving, p: e.p, f: e.f, c: e.c });
  });
  return out.slice(0, 12);
}
const isFav = name => N().fav.includes(name);
const mealNow = () => { const h = new Date().getHours(), m = N().meals; const i = h < 10 ? 0 : h < 12 ? 1 : h < 15 ? 2 : h < 18 ? 3 : 4; return m[Math.min(i, m.length - 1)]; };

/* ---------- small UI parts ---------- */
const chips = st => `<span class="nchips">${MAC.map(([k]) => st[k] ? `<i class="nc ${k}">${fmt(st[k])}</i>` : '').join('')}</span>`;
const dayLabel = d => { const t = K().today(); return d === t ? 'היום' : d === addDays(t, -1) ? 'אתמול' : K().fmtLong(d); };
function ring(eaten, target, size = 128) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, f = target ? Math.min(eaten / target, 1) : 0, over = target && eaten > target * 1.05;
  return `<svg class="nring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="trk"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bar ${over ? 'over' : ''}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

/* ---------- views ---------- */
let curDate = null, sub = 'day', range = 7;
function render() {
  const k = K(), n = N();
  if (!n.on) { k.go('#/settings'); return; }
  if (!curDate) curDate = k.today();
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="top"><div><h1>תזונה</h1><p class="muted small">כוכבים · גרמים · קלוריות</p></div>
      ${n.claudeUrl ? `<a class="btn sm" href="${k.esc(n.claudeUrl)}" target="_blank" rel="noopener">${ICO.cam} צילום ב־Claude</a>` : ''}</div>
    <div class="seg" style="margin-bottom:14px">${[['day', 'יומן'], ['plan', 'יעדים'], ['stats', 'התקדמות'], ['weight', 'משקל']].map(([v, t]) => `<button data-sub="${v}" aria-pressed="${sub === v}">${t}</button>`).join('')}</div>
    <div id="nbody"></div>`;
  k.$$('[data-sub]').forEach(b => b.onclick = () => { sub = b.dataset.sub; render(); });
  ({ day: renderDay, plan: renderPlan, stats: renderStats, weight: renderWeight })[sub]();
}

function renderDay() {
  const k = K(), n = N(), box = document.getElementById('nbody');
  const list = entriesOn(curDate), tot = totals(list), tg = targetFor(curDate);
  const eatK = kcalOf(tot), tgK = kcalOf(tg), rem = tgK - eatK, tr = isTrain(curDate), wos = workoutsOn(curDate);
  const woNames = [...new Set(wos.flatMap(w => w.items.map(i => k.LIFT(i.lift).name)))];
  box.innerHTML = `
    <div class="datebar"><button class="icon-btn" data-d="-1" aria-label="יום קודם">${k.ICON.back}</button>
      <button class="d" data-today>${dayLabel(curDate)}<small>${k.fmtDate(curDate)}</small></button>
      <button class="icon-btn" data-d="1" aria-label="יום הבא" style="transform:scaleX(-1)" ${curDate >= k.today() ? 'disabled' : ''}>${k.ICON.back}</button></div>
    <button class="daytype ${tr ? 'train' : ''}" data-daytype>${tr ? `${ICO.bar} יום אימון${woNames.length ? ` · ${k.esc(woNames.join(', '))}` : ''}` : 'יום מנוחה'}<small>${n.dayType[curDate] ? 'נקבע ידנית · ' : ''}לחץ לשינוי</small></button>
    ${tg.src !== 'default' ? `<div class="plan-src">${tg.src === 'plan' ? '<b>יעד מלוליק</b>' : '<b>הערה מלוליק</b>'}${tg.note ? ` · ${k.esc(tg.note)}` : ''}</div>` : ''}
    <div class="card nsum">
      <div class="nring-wrap">${ring(eatK, tgK)}<div class="nring-val"><b class="num">${k.kg(Math.abs(rem))}</b><span>${rem >= 0 ? 'נשארו' : 'מעל היעד'}</span><small><bdi dir="ltr">${k.kg(eatK)} / ${k.kg(tgK)}</bdi> קק״ל</small></div></div>
      <div class="nmacros">${MAC.map(([m, name]) => {
        const e = tot[m], t = tg[m], pct = t ? Math.min(100, e / t * 100) : 0, over = isOver(m, e, tg);
        return `<div class="nm ${m}"><div class="row between"><span class="nm-n">${name}</span><span class="nm-s ${over ? 'over' : ''}"><bdi dir="ltr"><b class="num">${fmt(e)}</b>/${targetText(m, tg)}</bdi> ★</span></div>
          <div class="nbar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="nm-g"><bdi dir="ltr">${Math.round(gramsOf(m, e))} / ${Math.round(gramsOf(m, t))}</bdi> ג׳</div></div>`;
      }).join('')}</div>
    </div>
    ${n.meals.map(meal => {
      const es = list.filter(e => e.meal === meal), mt = totals(es), yest = entriesOn(addDays(curDate, -1)).filter(e => e.meal === meal);
      return `<div class="nmeal"><div class="nmeal-h"><b>${k.esc(meal)}</b>${es.length ? `<span class="muted small">${k.kg(kcalOf(mt))} קק״ל</span>${chips(mt)}` : ''}
          <span class="grow"></span>${!es.length && yest.length ? `<button class="btn sm ghost" data-copy="${k.esc(meal)}">כמו אתמול</button>` : ''}<button class="icon-btn" data-add="${k.esc(meal)}" aria-label="הוספה ל${k.esc(meal)}">${k.ICON.plus}</button></div>
        ${es.length ? `<div class="list">${es.map(e => `<button class="li" data-entry="${e.id}"><div class="grow"><div class="t">${k.esc(e.name)}</div><div class="s">${e.qty !== 1 ? `${fmt(e.qty)} × ` : ''}${k.esc(e.serving || '')}</div></div>${chips({ p: e.p * e.qty, f: e.f * e.qty, c: e.c * e.qty })}<span class="s num">${k.kg(kcalOf({ p: e.p * e.qty, f: e.f * e.qty, c: e.c * e.qty }))}</span></button>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}
    <div class="save-bar"><button class="btn primary block" data-add="">${k.ICON.plus} הוספת אוכל</button></div>`;
  k.$$('[data-d]').forEach(b => b.onclick = () => { curDate = addDays(curDate, +b.dataset.d); renderDay(); });
  k.$('[data-today]').onclick = () => { curDate = k.today(); renderDay(); };
  k.$('[data-daytype]').onclick = () => {
    const auto = workoutsOn(curDate).length > 0, cur = isTrain(curDate), next = cur ? 'rest' : 'train';
    if ((next === 'train') === auto) delete n.dayType[curDate]; else n.dayType[curDate] = next;
    save(); renderDay();
  };
  k.$$('[data-add]').forEach(b => b.onclick = () => addSheet(b.dataset.add || mealNow()));
  k.$$('[data-entry]').forEach(b => b.onclick = () => entrySheet(n.log.find(e => e.id === b.dataset.entry)));
  k.$$('[data-copy]').forEach(b => b.onclick = () => {
    const meal = b.dataset.copy;
    const added = entriesOn(addDays(curDate, -1)).filter(e => e.meal === meal).map(e => ({ ...e, id: k.uid(), date: curDate, at: Date.now() }));
    n.log.push(...added); save(); renderDay();
    undoBar(`הועתקו ${added.length} פריטים מאתמול ל${meal}`, () => {
      const ids = new Set(added.map(e => e.id)); n.log = n.log.filter(e => !ids.has(e.id)); save(); if (location.hash === '#/food') renderDay();
    });
  });
}

// a short bar with an undo button (e.g. after "כמו אתמול")
let undoT;
function undoBar(msg, onUndo) {
  const k = K(); document.getElementById('undo-bar')?.remove(); clearTimeout(undoT);
  const bar = document.createElement('div'); bar.id = 'undo-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span class="grow">${k.esc(msg)}</span><button class="btn sm" data-undo>ביטול</button>`;
  document.body.appendChild(bar); requestAnimationFrame(() => bar.classList.add('show'));
  const close = () => { bar.classList.remove('show'); setTimeout(() => bar.remove(), 300); };
  bar.querySelector('[data-undo]').onclick = () => { onUndo(); close(); k.toast('בוטל'); };
  undoT = setTimeout(close, 7000);
}

/* add food: search, recent, favourites, library, manual */
function addSheet(meal) {
  const k = K();
  const s = k.sheet('הוספת אוכל', `<div class="stack" style="gap:10px">
      <div class="chips" id="n-meals">${N().meals.map(m => `<button class="chip" data-meal="${k.esc(m)}" aria-pressed="${m === meal}">${k.esc(m)}</button>`).join('')}</div>
      <input class="input" id="n-q" placeholder="חיפוש מאכל…" autocomplete="off">
      <div id="n-res"></div>
    </div>`, `<button class="btn block" data-manual>${k.ICON.plus} מהתווית או ידנית (גרמים / כוכבים)</button>`);
  s.el.classList.add('full');
  const pick = () => s.el.querySelector('[data-meal][aria-pressed="true"]').dataset.meal;
  k.$$('[data-meal]', s.el).forEach(b => b.onclick = () => k.$$('[data-meal]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)));
  const row = f => `<div class="li nf"><button class="nf-main" data-pick="${k.esc(f.id)}"><div class="t">${k.esc(f.name)}</div><div class="s">${k.esc(f.serving || '')}${f.note ? ` · ${k.esc(f.note)}` : ''}</div></button>
      ${chips(f)}<span class="s num">${kcalOf(f) ? k.kg(kcalOf(f)) : ''}</span><button class="star-btn" data-fav="${k.esc(f.name)}" aria-pressed="${isFav(f.name)}" aria-label="מועדף">${ICO.star}</button></div>`;
  const all = () => { const lib = library(); const byName = new Map(); [...recent(), ...lib].forEach(f => { if (!byName.has(f.name)) byName.set(f.name, f); }); return byName; };
  const draw = () => {
    const q = k.$('#n-q', s.el).value.trim(), map = all();
    let html = '';
    if (!q) {
      const favs = N().fav.map(n => map.get(n)).filter(Boolean), rec = recent();
      if (favs.length) html += `<div class="nsec">מועדפים</div><div class="list">${favs.map(row).join('')}</div>`;
      if (rec.length) html += `<div class="nsec">אחרונים</div><div class="list">${rec.map(row).join('')}</div>`;
      html += `<div class="nsec">מאגר מזונות</div><div class="list">${library().map(row).join('')}</div>`;
    } else {
      const hits = [...map.values()].filter(f => f.name.includes(q));
      html = hits.length ? `<div class="list">${hits.map(row).join('')}</div>` : `<div class="empty">לא נמצא. אפשר „הוספה ידנית” למטה.</div>`;
    }
    k.$('#n-res', s.el).innerHTML = html;
    k.$$('[data-pick]', s.el).forEach(b => b.onclick = () => { const f = [...all().values()].find(x => x.id === b.dataset.pick); amountSheet(f, pick()); });
    k.$$('[data-fav]', s.el).forEach(b => b.onclick = e => {
      e.stopPropagation(); const name = b.dataset.fav, n = N();
      n.fav = isFav(name) ? n.fav.filter(x => x !== name) : [...n.fav, name]; save(); draw();
    });
  };
  k.$('#n-q', s.el).oninput = draw; draw();
  k.$('[data-manual]', s.el).onclick = () => manualSheet(pick());
}
/* Converting grams of a macro into stars, the way the coach's food list does it:
   exact stars = grams / grams-per-star (protein 20, fat 10, carbs 20);
   up to 0.3 of a star is not counted, 0.3–0.4 is a quarter, otherwise the nearest half star.
   (Checked against the Notion food list: 65 of 69 values match.) */
function starRule(x) {
  if (!(x > 0.3)) return 0;
  if (x < 0.4) return 0.25;
  return Math.floor(x * 2 + 0.5) / 2;
}
const exactStars = (k, grams) => (grams || 0) / N().grams[k];
const starsFromGrams = g => Object.fromEntries(MAC.map(([k]) => [k, starRule(exactStars(k, g[k]))]));
const labelGrams = (per100, grams) => Object.fromEntries(MAC.map(([k]) => [k, (per100[k] || 0) * grams / 100]));
const RULE_NOTE = 'כוכב = 20 ג׳ חלבון / 10 ג׳ שומן / 20 ג׳ פחמימה · עד 0.3 כוכב לא נספר · 0.3–0.4 = רבע · מעל זה מעגלים לחצי כוכב';

function amountSheet(f, meal, edit) {
  const k = K();
  const byWeight = f.p100 != null; // foods saved from a nutrition label are entered in grams
  let qty = edit ? edit.qty : 1, grams = edit?.grams || f.g || 100;
  const per100 = byWeight ? { p: f.p100, f: f.f100, c: f.c100 } : null;
  const s = k.sheet(f.name, `<div class="stack">
      <p class="muted small">${byWeight ? `לפי התווית ל־100 גרם: חלבון ${fmt(per100.p)} · שומן ${fmt(per100.f)} · פחמימה ${fmt(per100.c)} ג׳` : `מנה: ${k.esc(f.serving || '—')}`}${f.note ? ` · ${k.esc(f.note)}` : ''}</p>
      <div class="row between"><b style="font-weight:500">${byWeight ? 'כמה גרם' : 'כמות מנות'}</b>
        <div class="row"><button class="btn sm" data-q="${byWeight ? -10 : -0.5}">−</button><input class="input num" id="n-qty" type="number" inputmode="decimal" step="${byWeight ? 5 : 0.25}" min="0" value="${byWeight ? grams : qty}" style="width:84px;text-align:center"><button class="btn sm" data-q="${byWeight ? 10 : 0.5}">+</button></div></div>
      <div class="card" id="n-prev"></div>
      ${byWeight ? `<p class="note">${RULE_NOTE}</p>` : ''}
      <div class="chips">${N().meals.map(m => `<button class="chip" data-meal="${k.esc(m)}" aria-pressed="${m === meal}">${k.esc(m)}</button>`).join('')}</div>
    </div>`, `<div class="row">${edit ? `<button class="btn danger" data-del>${k.ICON.trash}</button>` : ''}<button class="btn primary block grow" data-ok>${edit ? 'שמירה' : 'הוספה'}</button></div>`);
  const stars = () => byWeight ? starsFromGrams(labelGrams(per100, grams)) : { p: f.p * qty, f: f.f * qty, c: f.c * qty };
  const prev = () => {
    const st = stars(), g = byWeight ? labelGrams(per100, grams) : null;
    k.$('#n-prev', s.el).innerHTML = `<div class="nprev">${MAC.map(([m, name]) => `<div class="${m}"><span>${name}</span><b class="num">${fmt(st[m])} ★</b><small>${byWeight ? `${fmt(g[m])} ג׳ · <bdi dir="ltr">${exactStars(m, g[m]).toFixed(2)}</bdi>` : `${Math.round(gramsOf(m, st[m]))} ג׳`}</small></div>`).join('')}<div><span>קלוריות</span><b class="num">${k.kg(kcalOf(st))}</b><small>קק״ל</small></div></div>`;
  };
  const inp = k.$('#n-qty', s.el);
  inp.oninput = () => { const v = Math.max(0, parseFloat(inp.value) || 0); if (byWeight) grams = v; else qty = v; prev(); };
  k.$$('[data-q]', s.el).forEach(b => b.onclick = () => {
    if (byWeight) { grams = Math.max(5, Math.round(grams + +b.dataset.q)); inp.value = grams; }
    else { qty = Math.max(0.25, r2(qty + +b.dataset.q)); inp.value = qty; }
    prev();
  });
  k.$$('[data-meal]', s.el).forEach(b => b.onclick = () => { meal = b.dataset.meal; k.$$('[data-meal]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  prev();
  k.$('[data-ok]', s.el).onclick = () => {
    if (byWeight ? !grams : !qty) return k.toast('צריך כמות');
    const n = N(), st = stars();
    const fields = byWeight ? { qty: 1, ...st, serving: `${grams} גרם`, grams, p100: per100.p, f100: per100.f, c100: per100.c } : { qty };
    if (edit) Object.assign(edit, fields, { meal });
    else n.log.push({ id: k.uid(), date: curDate, meal, name: f.name, serving: f.serving || '', p: f.p || 0, f: f.f || 0, c: f.c || 0, ...fields, at: Date.now() });
    save(); s.close(); renderDay(); if (!edit) k.toast(`נוסף: ${f.name}`);
  };
  const del = k.$('[data-del]', s.el);
  if (del) del.onclick = () => { const n = N(); n.log = n.log.filter(e => e.id !== edit.id); save(); s.close(); renderDay(); };
}
function entrySheet(e) {
  if (!e) return;
  amountSheet({ name: e.name, serving: e.serving, p: e.p, f: e.f, c: e.c, p100: e.p100, f100: e.f100, c100: e.c100, g: e.grams }, e.meal, e);
}
function manualSheet(meal) {
  const k = K(), n = N(); let mode = 'label';
  const s = k.sheet('הוספה ידנית', `<div class="stack">
      <label class="field"><span>מה אכלת</span><input class="input" id="m-name" placeholder="למשל: חטיף חלבון"></label>
      <div class="seg" id="m-mode"><button data-mode="label" aria-pressed="true">מהתווית</button><button data-mode="grams" aria-pressed="false">גרמים במנה</button><button data-mode="stars" aria-pressed="false">כוכבים</button></div>
      <p class="note" id="m-help"></p>
      <div class="grid3">${MAC.map(([m, name]) => `<label class="field"><span>${name}</span><input class="input num" id="m-${m}" type="number" inputmode="decimal" step="0.1" min="0" placeholder="0" style="text-align:center"></label>`).join('')}</div>
      <label class="field" id="m-g-wrap"><span>כמה גרם אכלת</span><input class="input num" id="m-g" type="number" inputmode="decimal" step="5" min="0" value="100" style="text-align:center"></label>
      <label class="field" id="m-serv-wrap" hidden><span>מנה (לא חובה)</span><input class="input" id="m-serv" placeholder="למשל: כוס, 200 גרם"></label>
      <div class="card" id="m-prev"></div>
      <p class="note">${RULE_NOTE}</p>
      <label class="row"><span class="grow">לשמור במאגר שלי</span><span class="toggle"><input type="checkbox" id="m-keep" checked><span></span></span></label>
    </div>`, '<button class="btn primary block" data-ok>הוספה</button>');
  const val = id => parseFloat(k.$(id, s.el).value) || 0;
  const read = () => {
    const v = Object.fromEntries(MAC.map(([m]) => [m, val('#m-' + m)]));
    if (mode === 'stars') return { st: v, g: null };
    const g = mode === 'label' ? labelGrams(v, val('#m-g')) : v;
    return { st: starsFromGrams(g), g };
  };
  const draw = () => {
    k.$('#m-help', s.el).textContent = { label: 'מהתווית התזונתית: כמה גרם חלבון, שומן ופחמימה יש ב־100 גרם. ואז כמה גרם אכלת.', grams: 'כמה גרם חלבון, שומן ופחמימה יש במנה שאכלת.', stars: 'כוכבים כמו שהמאמן/ת כותב/ת.' }[mode];
    k.$('#m-g-wrap', s.el).hidden = mode !== 'label';
    k.$('#m-serv-wrap', s.el).hidden = mode === 'label';
    MAC.forEach(([m, name]) => { k.$('#m-' + m, s.el).step = mode === 'stars' ? '0.25' : '0.1'; k.$('#m-' + m, s.el).closest('label').querySelector('span').textContent = mode === 'label' ? `${name} ל־100 ג׳` : mode === 'grams' ? `${name} (ג׳)` : `${name} ★`; });
    const { st, g } = read();
    k.$('#m-prev', s.el).innerHTML = `<div class="nprev">${MAC.map(([m, name]) => `<div class="${m}"><span>${name}</span><b class="num">${fmt(st[m])} ★</b><small>${g ? `${fmt(g[m])} ג׳ · <bdi dir="ltr">${exactStars(m, g[m]).toFixed(2)}</bdi>` : `${Math.round(gramsOf(m, st[m]))} ג׳`}</small></div>`).join('')}<div><span>קלוריות</span><b class="num">${k.kg(kcalOf(st))}</b><small>קק״ל</small></div></div>`;
  };
  k.$$('[data-mode]', s.el).forEach(b => b.onclick = () => { mode = b.dataset.mode; k.$$('[data-mode]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  k.$$('#m-p,#m-f,#m-c,#m-g', s.el).forEach(i => { i.oninput = draw; });
  draw();
  setTimeout(() => k.$('#m-name', s.el).focus(), 320);
  k.$('[data-ok]', s.el).onclick = () => {
    const name = k.$('#m-name', s.el).value.trim() || 'אוכל', { st } = read();
    const v = Object.fromEntries(MAC.map(([m]) => [m, val('#m-' + m)]));
    if (!v.p && !v.f && !v.c) return k.toast('צריך לפחות ערך אחד');
    const label = mode === 'label', grams = val('#m-g');
    if (label && !grams) return k.toast('כמה גרם אכלת?');
    const serving = label ? `${grams} גרם` : k.$('#m-serv', s.el).value.trim();
    const per = label ? { p100: v.p, f100: v.f, c100: v.c } : {};
    if (k.$('#m-keep', s.el).checked && !library().some(f => f.name === name))
      n.foods.unshift({ id: 'u' + k.uid(), name, serving: label ? '100 גרם' : serving, ...(label ? starsFromGrams(labelGrams(v, 100)) : st), ...per, ...(label ? { g: grams } : {}), note: '' });
    n.log.push({ id: k.uid(), date: curDate, meal, name, serving, qty: 1, ...st, ...per, ...(label ? { grams } : {}), at: Date.now() });
    save(); s.close(); renderDay(); k.toast(`נוסף: ${name}`);
  };
}

/* coach's targets: list + entering a new table */
const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const dowOf = iso => DOW[K().toDate(iso).getDay()];
function renderPlan() {
  const k = K(), n = N(), box = document.getElementById('nbody'), t = k.today();
  const dates = Object.keys(n.plan).sort();
  const upcoming = dates.filter(d => d >= addDays(t, -3)), past = dates.filter(d => d < addDays(t, -3)).reverse();
  const row = d => { const e = n.plan[d]; return `<button class="li plan-row ${d === t ? 'today' : ''}" data-pd="${d}"><span class="pr-d"><b>${dowOf(d)}</b>${k.fmtDate(d)}</span>
      ${hasNumbers(e) ? `<span class="pr-v"><i class="c">${e.c != null ? fmt(e.c) : '–'}</i><i class="f">${e.f != null ? fmt(e.f) : '–'}</i><i class="p"><bdi dir="ltr">${proteinText(e) || '–'}</bdi></i></span>` : ''}
      <span class="pr-n grow">${k.esc(e.note || '')}</span>${k.ICON.chev}</button>`; };
  box.innerHTML = `
    <button class="btn primary block" data-newplan>${k.ICON.plus} טבלת יעדים חדשה מלוליק</button>
    <p class="note" style="margin:8px 4px 0">ביום שיש לו יעד מהטבלה, היומן משתמש בו. בשאר הימים: היעד מההגדרות.</p>
    ${dates.length ? `<div class="pr-head"><span></span><span class="pr-v"><i>פחמימה</i><i>שומן</i><i>חלבון</i></span></div>` : ''}
    ${upcoming.length ? `<div class="section-title"><h2>עכשיו והלאה</h2></div><div class="list">${upcoming.map(row).join('')}</div>` : ''}
    ${past.length ? `<div class="section-title"><h2>קודם</h2><span class="muted small">${past.length} ימים</span></div><div class="list">${past.slice(0, 60).map(row).join('')}</div>` : ''}
    ${!dates.length ? '<div class="list" style="margin-top:12px"><div class="empty">עוד אין טבלת יעדים.<br>מזינים את הטבלה מלוליק, יום אחרי יום.</div></div>' : ''}`;
  k.$('[data-newplan]').onclick = () => tableSheet();
  k.$$('[data-pd]').forEach(b => b.onclick = () => dayPlanSheet(b.dataset.pd));
}
function planRowFields(d, e, i) {
  return `<div class="pt-row" data-row="${i}"><span class="pt-d"><b>${dowOf(d)}</b>${K().fmtDate(d).slice(0, -3)}</span>
    <input class="input num" data-c type="number" inputmode="decimal" step="0.5" placeholder="–" value="${e?.c ?? ''}">
    <input class="input num" data-f type="number" inputmode="decimal" step="0.5" placeholder="–" value="${e?.f ?? ''}">
    <input class="input num" data-p inputmode="text" placeholder="4+" value="${e ? proteinText(e) : ''}">
    <input class="input pt-note" data-note placeholder="הערה" value="${K().esc(e?.note || '')}"></div>`;
}
function tableSheet() {
  const k = K(), n = N();
  let start = k.today(); const td = k.toDate(start); if (td.getDay() !== 0) { td.setDate(td.getDate() + (7 - td.getDay())); start = td.toISOString().slice(0, 10); }
  // fat and protein are usually the same all period: start every row from the last table's values (or 3 / 4+)
  const lastPl = Object.keys(n.plan).sort().reverse().map(d => n.plan[d]).find(hasNumbers);
  const dflt = { f: lastPl?.f ?? 3, p: lastPl?.p ?? 4, plus: lastPl ? !!lastPl.plus : true, pMax: lastPl?.pMax ?? null };
  let rows = Array.from({ length: 7 }, () => ({ c: null, ...dflt, note: '' }));
  const s = k.sheet('טבלת יעדים מלוליק', `<div class="stack">
      <label class="field"><span>יום ראשון בטבלה</span><input class="input" type="date" id="pt-start" value="${start}"></label>
      <p class="note">שורה לכל יום, כמו בדף. חלבון: „4+” (לפחות 4) או „4-5”. יום בלי מספרים, רק הערה, גם בסדר („להשתדל להקפיד על החלבון”, „חופשה”). שורה חדשה מעתיקה את השומן והחלבון מהשורה הקודמת.</p>
      <div class="pt-head"><span></span><span>פחמימה</span><span>שומן</span><span>חלבון</span><span>הערה</span></div>
      <div id="pt-rows"></div>
      <button class="btn sm" data-addrow>${k.ICON.plus} יום</button>
    </div>`, '<button class="btn primary block" data-ok>שמירת הטבלה</button>');
  s.el.classList.add('full');
  const readRows = () => k.$$('.pt-row', s.el).map(r => {
    const num = sel => { const v = parseFloat(r.querySelector(sel).value); return isNaN(v) ? null : v; };
    const pr = parseProtein(r.querySelector('[data-p]').value);
    return { c: num('[data-c]'), f: num('[data-f]'), p: pr?.p ?? null, plus: !!pr?.plus, pMax: pr?.pMax ?? null, note: r.querySelector('[data-note]').value.trim() };
  });
  const draw = () => {
    const st = k.$('#pt-start', s.el).value || k.today();
    k.$('#pt-rows', s.el).innerHTML = rows.map((e, i) => planRowFields(addDays(st, i), e, i)).join('');
    // ditto: typing in a row fills empty fat / protein below it, like the coach's ″ marks
    k.$$('.pt-row', s.el).forEach((r, i) => ['[data-f]', '[data-p]'].forEach(sel => r.querySelector(sel).addEventListener('change', () => {
      rows = readRows(); const v = r.querySelector(sel).value;
      k.$$('.pt-row', s.el).slice(i + 1).forEach(x => { const inp = x.querySelector(sel); if (!inp.value && v) inp.value = v; });
      rows = readRows();
    })));
  };
  draw();
  k.$('#pt-start', s.el).onchange = () => { rows = readRows(); draw(); };
  k.$('[data-addrow]', s.el).onclick = () => { rows = readRows(); const last = rows[rows.length - 1] || {}; rows.push({ c: null, f: last.f ?? null, p: last.p ?? null, plus: last.plus, pMax: last.pMax ?? null, note: '' }); draw(); };
  k.$('[data-ok]', s.el).onclick = async () => {
    rows = readRows(); const st = k.$('#pt-start', s.el).value; if (!st) return k.toast('צריך תאריך התחלה');
    const entries = rows.map((e, i) => [addDays(st, i), e]).filter(([, e]) => hasNumbers(e) || e.note);
    if (!entries.length) return k.toast('הטבלה ריקה');
    const clash = entries.filter(([d]) => n.plan[d]).length;
    if (clash && !await k.confirmBox(`ל־${clash} מהימים כבר יש יעד. להחליף?`, 'החלפה', false)) return;
    entries.forEach(([d, e]) => { const o = { note: e.note || '' }; ['c', 'f', 'p', 'pMax'].forEach(x => { if (e[x] != null) o[x] = e[x]; }); if (e.plus) o.plus = true; n.plan[d] = o; });
    save(); s.close(); renderPlan(); k.toast(`נשמרו יעדים ל־${entries.length} ימים`);
  };
}
function dayPlanSheet(d) {
  const k = K(), n = N(), e = n.plan[d];
  const s = k.sheet(`יעד ל${dowOf(d)} ${k.fmtDate(d)}`, `<div class="stack"><div class="pt-head"><span></span><span>פחמימה</span><span>שומן</span><span>חלבון</span><span>הערה</span></div>${planRowFields(d, e, 0)}</div>`,
    `<div class="row"><button class="btn danger" data-del>${k.ICON.trash}</button><button class="btn primary block grow" data-ok>שמירה</button></div>`);
  k.$('[data-ok]', s.el).onclick = () => {
    const r = k.$('.pt-row', s.el), num = sel => { const v = parseFloat(r.querySelector(sel).value); return isNaN(v) ? null : v; }, pr = parseProtein(r.querySelector('[data-p]').value);
    const o = { note: r.querySelector('[data-note]').value.trim() };
    if (num('[data-c]') != null) o.c = num('[data-c]'); if (num('[data-f]') != null) o.f = num('[data-f]');
    if (pr) { o.p = pr.p; if (pr.plus) o.plus = true; if (pr.pMax != null) o.pMax = pr.pMax; }
    if (!hasNumbers(o) && !o.note) delete n.plan[d]; else n.plan[d] = o;
    save(); s.close(); renderPlan();
  };
  k.$('[data-del]', s.el).onclick = () => { delete n.plan[d]; save(); s.close(); renderPlan(); };
}

/* progress: calories per day vs target, macro adherence, training vs rest days */
function renderStats() {
  const k = K(), box = document.getElementById('nbody'), t = k.today();
  const days = []; for (let i = range - 1; i >= 0; i--) { const d = addDays(t, -i), es = entriesOn(d), tot = totals(es), tg = targetFor(d); days.push({ d, logged: es.length > 0, tot, tg, kcal: kcalOf(tot), tk: kcalOf(tg), train: isTrain(d) }); }
  const logged = days.filter(x => x.logged), avg = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0;
  let streak = 0; for (let i = days.length - 1; i >= 0; i--) { if (days[i].logged) streak++; else if (i === days.length - 1) continue; else break; }
  const within = logged.filter(x => x.tk && Math.abs(x.kcal - x.tk) <= x.tk * .1).length;
  const tr = logged.filter(x => x.train), rs = logged.filter(x => !x.train);
  // bar chart
  const W = 320, H = 130, B = 22, T = 10, gap = range > 7 ? 2 : 8, bw = (W - gap * (range - 1)) / range;
  const max = Math.max(...days.map(x => Math.max(x.kcal, x.tk)), 500) * 1.08, y = v => T + (H - B - T) * (1 - v / max);
  const bars = days.map((x, i) => {
    const X = i * (bw + gap), dd = k.toDate(x.d);
    const lbl = range === 7 ? ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][dd.getDay()] : (i % 5 === 4 || i === range - 1 ? `${dd.getDate()}/${dd.getMonth() + 1}` : '');
    return `<g><rect x="${X.toFixed(1)}" y="${y(x.kcal).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y(x.kcal)).toFixed(1)}" rx="${Math.min(3, bw / 3)}" class="${x.kcal > x.tk * 1.1 ? 'over' : ''}"><title>${k.fmtDate(x.d)}: ${k.kg(x.kcal)} / ${k.kg(x.tk)} קק״ל${x.train ? ' · יום אימון' : ''}</title></rect>
      <rect x="${(X - 1).toFixed(1)}" y="${(y(x.tk) - 1).toFixed(1)}" width="${(bw + 2).toFixed(1)}" height="2.5" class="tg"/>
      ${x.train ? `<circle cx="${(X + bw / 2).toFixed(1)}" cy="${H - B + 6}" r="2.6" class="trd"/>` : ''}
      ${lbl ? `<text x="${(X + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle">${lbl}</text>` : ''}</g>`;
  }).join('');
  box.innerHTML = `
    <div class="seg sm" style="margin-bottom:12px">${[[7, '7 ימים'], [30, '30 יום']].map(([v, t2]) => `<button data-range="${v}" aria-pressed="${range === v}">${t2}</button>`).join('')}</div>
    <div class="tiles" style="margin-bottom:10px">
      <div class="stat"><b class="num">${k.kg(Math.round(avg(logged, x => x.kcal)))}</b><span>ממוצע קק״ל</span></div>
      <div class="stat"><b class="num"><bdi dir="ltr">${logged.length}/${range}</bdi></b><span>ימים מתועדים</span></div>
      <div class="stat"><b class="num">${within}</b><span>ימים ביעד ±10%</span></div>
      <div class="stat"><b class="num">${streak}</b><span>ימים ברצף</span></div>
    </div>
    <div class="card wk-card">
      <div class="row between"><b>קלוריות ביום</b><span class="legend" style="margin:0"><span><i class="lg-tg"></i>יעד</span><span><i class="lg-tr"></i>יום אימון</span></span></div>
      ${logged.length ? `<svg class="wbars nbars" viewBox="0 0 ${W} ${H}" role="img" aria-label="קלוריות בכל יום מול היעד">${bars}</svg>` : '<div class="chart-empty">עוד אין ימים מתועדים בטווח הזה</div>'}
    </div>
    <div class="section-title"><h2>ממוצע מול היעד</h2><span class="muted small">בימים המתועדים</span></div>
    <div class="card nmacros">${MAC.map(([m, name]) => {
      const e = avg(logged, x => x.tot[m]), tg = avg(logged.length ? logged : days, x => x.tg[m]), pct = tg ? Math.min(100, e / tg * 100) : 0;
      return `<div class="nm ${m}"><div class="row between"><span class="nm-n">${name}</span><span class="nm-s"><bdi dir="ltr"><b class="num">${fmt(e)}</b>/${fmt(tg)}</bdi> ★</span></div><div class="nbar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="nm-g"><bdi dir="ltr">${Math.round(gramsOf(m, e))} / ${Math.round(gramsOf(m, tg))}</bdi> ג׳ ביום</div></div>`;
    }).join('')}</div>
    <div class="section-title"><h2>ימי אימון מול מנוחה</h2></div>
    <div class="card"><table class="pct-table ntbl"><tr><td></td><td class="muted small">ימי אימון (${tr.length})</td><td class="muted small">ימי מנוחה (${rs.length})</td></tr>
      <tr><td>קלוריות</td><td class="num">${tr.length ? k.kg(Math.round(avg(tr, x => x.kcal))) : '—'}</td><td class="num">${rs.length ? k.kg(Math.round(avg(rs, x => x.kcal))) : '—'}</td></tr>
      ${MAC.map(([m, name]) => `<tr><td>${name} ★</td><td class="num">${tr.length ? fmt(avg(tr, x => x.tot[m])) : '—'}</td><td class="num">${rs.length ? fmt(avg(rs, x => x.tot[m])) : '—'}</td></tr>`).join('')}
    </table><p class="note" style="padding:8px 4px 0">יום אימון = יום שרשמת בו אימון (או שסימנת ידנית ביומן).</p></div>`;
  k.$$('[data-range]', box).forEach(b => b.onclick = () => { range = +b.dataset.range; renderStats(); });
}

/* body weight */
function renderWeight() {
  const k = K(), n = N(), box = document.getElementById('nbody');
  const ws = [...n.weights].sort((a, b) => a.date.localeCompare(b.date)), last = ws[ws.length - 1], first = ws[0];
  const d = ws.length > 1 ? last.kg - first.kg : null;
  const wk = ws.length > 1 ? (last.kg - first.kg) / Math.max(1, (k.toDate(last.date) - k.toDate(first.date)) / (7 * 864e5)) : null;
  box.innerHTML = `
    <div class="card stack">
      <div class="row" style="gap:8px"><label class="field grow"><span>משקל (ק״ג)</span><input class="input num" id="w-kg" type="number" inputmode="decimal" step="0.1" placeholder="${last ? last.kg : '0'}"></label>
        <label class="field"><span>תאריך</span><input class="input" id="w-d" type="date" value="${k.today()}" max="${k.today()}"></label></div>
      <button class="btn primary block" data-wsave>שמירת שקילה</button>
    </div>
    ${ws.length ? `<div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      <div class="stat"><b class="num">${k.kg(last.kg)}</b><span>נוכחי</span></div>
      <div class="stat"><b class="num">${d == null ? '—' : (d > 0 ? '+' : '') + k.kg(r2(d))}</b><span>מההתחלה</span></div>
      <div class="stat"><b class="num">${wk == null ? '—' : (wk > 0 ? '+' : '') + k.kg(Math.round(wk * 100) / 100)}</b><span>ק״ג לשבוע</span></div></div>` : ''}
    <div class="card chart-card" style="--lc:var(--accent);margin-top:10px">${ws.length > 1 ? '<div class="chart" id="w-chart"></div>' : `<div class="chart-empty">${ws.length ? 'הגרף יופיע מהשקילה השנייה' : 'עוד אין שקילות'}</div>`}</div>
    ${ws.length ? `<div class="section-title"><h2>שקילות</h2></div><div class="list">${[...ws].reverse().slice(0, 20).map(x => `<button class="li" data-w="${x.id}"><div class="grow"><div class="t">${k.fmtLong(x.date)}</div></div><span class="v">${k.kg(x.kg)} ק״ג</span></button>`).join('')}</div>` : ''}`;
  if (ws.length > 1) k.plot(k.$('#w-chart'), 'var(--accent)', [{ pts: ws.map(x => ({ d: x.date, v: x.kg })), r: 3.5, ring: true }]);
  k.$('[data-wsave]').onclick = () => {
    const v = parseFloat(k.$('#w-kg').value), date = k.$('#w-d').value || k.today();
    if (!(v > 20 && v < 400)) return k.toast('צריך משקל תקין');
    n.weights = n.weights.filter(x => x.date !== date); n.weights.push({ id: k.uid(), date, kg: v }); save(); renderWeight(); k.toast('נשמר');
  };
  k.$$('[data-w]').forEach(b => b.onclick = async () => {
    const x = n.weights.find(w => w.id === b.dataset.w);
    if (await k.confirmBox(`למחוק את השקילה מ־${k.fmtDate(x.date)}?`)) { n.weights = n.weights.filter(w => w !== x); save(); renderWeight(); }
  });
}

/* ---------- settings ---------- */
function settingsHTML() {
  const k = K(), n = N(), t = n.target;
  return `<div class="section-title" style="margin:8px 4px 0"><h2>תזונה</h2></div>
    <div class="card stack">
      <label class="row"><span class="grow"><b style="font-weight:500">מעקב תזונה</b><span class="muted small" style="display:block">כוכבים, גרמים וקלוריות, מחובר לימי האימון</span></span><span class="toggle"><input type="checkbox" id="n-on" ${n.on ? 'checked' : ''}><span></span></span></label>
      ${n.on ? `
      <div class="field"><span>יעד יומי בכוכבים (מהמאמן/ת)</span>
        <div class="grid3">${MAC.map(([m, name]) => `<label class="field"><span>${name}</span><input class="input num" data-tg="${m}" type="number" inputmode="decimal" step="0.5" min="0" value="${t[m]}" style="text-align:center"></label>`).join('')}</div>
        <p class="note" id="n-tg-hint"></p></div>
      <div class="field"><span>פחמימה ביום אימון / ביום מנוחה (לא חובה)</span>
        <div class="row" style="gap:8px"><input class="input num" data-cday="cTrain" type="number" inputmode="decimal" step="0.5" min="0" value="${n.cTrain ?? ''}" placeholder="אימון" style="text-align:center"><input class="input num" data-cday="cRest" type="number" inputmode="decimal" step="0.5" min="0" value="${n.cRest ?? ''}" placeholder="מנוחה" style="text-align:center"></div></div>
      <button class="btn block" data-plan>חישוב יעד לפי גיל, גובה, משקל ומטרה</button>
      <details class="nadv"><summary>הגדרות מתקדמות</summary><div class="stack" style="margin-top:10px">
        <div class="field"><span>גרמים לכוכב</span><div class="grid3">${MAC.map(([m, name]) => `<label class="field"><span>${name}</span><input class="input num" data-gps="${m}" type="number" inputmode="decimal" step="1" min="1" value="${n.grams[m]}" style="text-align:center"></label>`).join('')}</div></div>
        <label class="field"><span>ארוחות (מופרדות בפסיק)</span><input class="input" id="n-meals-in" value="${k.esc(n.meals.join(', '))}"></label>
        <label class="field"><span>קישור לפרויקט שלך ב־Claude (לצילום אוכל)</span><input class="input" id="n-claude" dir="ltr" placeholder="https://claude.ai/project/…" value="${k.esc(n.claudeUrl || '')}"></label>
      </div></details>` : ''}
    </div>`;
}
function bindSettings() {
  const k = K(), n = N(), on = k.$('#n-on'); if (!on) return;
  on.onchange = () => { n.on = on.checked; save(); k.route(); if (n.on) k.toast('לשונית „תזונה” נוספה למטה'); };
  if (!n.on) return;
  const hint = () => { const h = k.$('#n-tg-hint'); if (h) h.textContent = `≈ ${MAC.map(([m, name]) => `${name} ${Math.round(gramsOf(m, n.target[m]))} ג׳`).join(' · ')} · ${k.kg(kcalOf(n.target))} קק״ל ביום`; };
  k.$$('[data-tg]').forEach(i => i.onchange = () => { n.target[i.dataset.tg] = Math.max(0, parseFloat(i.value) || 0); save(); hint(); });
  k.$$('[data-cday]').forEach(i => i.onchange = () => { const v = parseFloat(i.value); n[i.dataset.cday] = isNaN(v) ? null : v; save(); });
  k.$$('[data-gps]').forEach(i => i.onchange = () => { n.grams[i.dataset.gps] = Math.max(1, parseFloat(i.value) || n.grams[i.dataset.gps]); save(); hint(); });
  const mi = k.$('#n-meals-in'); if (mi) mi.onchange = () => { const m = mi.value.split(/[,،]/).map(x => x.trim()).filter(Boolean); n.meals = m.length ? m : DEFAULT_MEALS.slice(); save(); };
  const cl = k.$('#n-claude'); if (cl) cl.onchange = () => { const v = cl.value.trim(); n.claudeUrl = /^https:\/\//.test(v) ? v : ''; if (v && !n.claudeUrl) k.toast('קישור צריך להתחיל ב־https://'); save(); };
  k.$('[data-plan]').onclick = planSheet;
  hint();
}

/* personal plan: Mifflin-St Jeor, activity, weekly pace, protein by weight; carbs split for training/rest days */
const ACT = [[1.2, 'יושבני'], [1.375, 'קל (1-3 אימונים)'], [1.55, 'בינוני (3-5)'], [1.725, 'גבוה (6-7)'], [1.9, 'גבוה מאוד']];
function calcPlan(b) {
  const g = N().grams, male = b.sex === 'm';
  const bmr = 10 * b.weight + 6.25 * b.height - 5 * b.age + (male ? 5 : -161), tdee = bmr * b.activity;
  const delta = b.goal === 'keep' ? 0 : (b.goal === 'lose' ? -1 : 1) * b.pace * 7700 / 7;
  const kcal = Math.max(tdee + delta, male ? 1500 : 1200, b.goal === 'lose' ? bmr : 0);
  const pG = b.weight * (b.goal === 'keep' ? 1.4 : 1.6), fG = Math.max(kcal * .27 / 9, b.weight * .6), cG = Math.max((kcal - pG * 4 - fG * 9) / 4, 50);
  const half = v => Math.max(.5, Math.round(v * 2) / 2), st = { p: half(pG / g.p), f: half(fG / g.f), c: half(cG / g.c) };
  let hi = st.c, lo = st.c; const days = b.trainDays;
  if (days > 0 && days < 7) { const up = Math.max(.5, half(st.c * .2)); hi = st.c + up; lo = Math.max(1, half(st.c - up * days / (7 - days))); }
  return { kcal: Math.round(kcal), tdee: Math.round(tdee), st, hi, lo };
}
function planSheet() {
  const k = K(), n = N(), b = n.body || { sex: 'm', age: 30, height: 175, weight: 80, activity: 1.55, goal: 'keep', pace: .5, trainDays: 3 };
  const s = k.sheet('חישוב יעד אישי', `<div class="stack">
      <div class="seg" id="p-sex"><button data-v="m" aria-pressed="${b.sex === 'm'}">גבר</button><button data-v="f" aria-pressed="${b.sex === 'f'}">אישה</button></div>
      <div class="grid3"><label class="field"><span>גיל</span><input class="input num" id="p-age" type="number" value="${b.age}" style="text-align:center"></label><label class="field"><span>גובה (ס״מ)</span><input class="input num" id="p-h" type="number" value="${b.height}" style="text-align:center"></label><label class="field"><span>משקל</span><input class="input num" id="p-w" type="number" step="0.1" value="${b.weight}" style="text-align:center"></label></div>
      <label class="field"><span>רמת פעילות</span><select class="input" id="p-act">${ACT.map(([v, t]) => `<option value="${v}" ${v === b.activity ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="seg" id="p-goal"><button data-v="lose" aria-pressed="${b.goal === 'lose'}">ירידה</button><button data-v="keep" aria-pressed="${b.goal === 'keep'}">שמירה</button><button data-v="gain" aria-pressed="${b.goal === 'gain'}">עלייה</button></div>
      <div class="row" style="gap:8px"><label class="field grow"><span>קצב (ק״ג לשבוע)</span><select class="input" id="p-pace">${[.25, .5, .75].map(v => `<option ${v === b.pace ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field grow"><span>ימי אימון בשבוע</span><select class="input" id="p-td">${[0, 1, 2, 3, 4, 5, 6, 7].map(v => `<option ${v === b.trainDays ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="card" id="p-out"></div>
    </div>`, '<button class="btn primary block" data-apply>החלת היעד</button>');
  const segVal = id => k.$(`#${id} [aria-pressed="true"]`, s.el).dataset.v;
  ['p-sex', 'p-goal'].forEach(id => k.$$(`#${id} button`, s.el).forEach(x => x.onclick = () => { k.$$(`#${id} button`, s.el).forEach(y => y.setAttribute('aria-pressed', y === x)); calc(); }));
  let res;
  const read = () => ({ sex: segVal('p-sex'), age: +k.$('#p-age', s.el).value || 30, height: +k.$('#p-h', s.el).value || 170, weight: +k.$('#p-w', s.el).value || 70, activity: +k.$('#p-act', s.el).value, goal: segVal('p-goal'), pace: +k.$('#p-pace', s.el).value, trainDays: +k.$('#p-td', s.el).value });
  const calc = () => {
    res = calcPlan(read());
    k.$('#p-out', s.el).innerHTML = `<div class="nprev">${MAC.map(([m, name]) => `<div class="${m}"><span>${name}</span><b class="num">${fmt(res.st[m])} ★</b><small>${Math.round(gramsOf(m, res.st[m]))} ג׳</small></div>`).join('')}<div><span>קלוריות</span><b class="num">${k.kg(res.kcal)}</b><small>שריפה ${k.kg(res.tdee)}</small></div></div>
      ${res.hi !== res.lo ? `<p class="note" style="margin-top:8px">פחמימה: ${fmt(res.hi)} ★ ביום אימון · ${fmt(res.lo)} ★ ביום מנוחה</p>` : ''}
      <p class="note" style="margin-top:6px">הערכה כללית. אם יש לך יעד מהמאמן/ת, היעד שלו קובע.</p>`;
  };
  k.$$('input,select', s.el).forEach(x => x.oninput = calc); calc();
  k.$('[data-apply]', s.el).onclick = () => {
    n.body = read(); n.target = { ...res.st }; n.cTrain = res.hi !== res.lo ? res.hi : null; n.cRest = res.hi !== res.lo ? res.lo : null;
    save(); s.close(); k.route(); k.toast('היעד עודכן');
  };
}

/* ---------- links into the training app ---------- */
function homeCard() {
  const n = N(); if (!n.on) return '';
  const k = K(), d = k.today(), tot = totals(entriesOn(d)), tg = targetFor(d), e = kcalOf(tot), t = kcalOf(tg);
  return `<button class="card nhome" data-nhome>${ICO.fork}<div class="grow"><b>תזונה היום${isTrain(d) ? ' · יום אימון' : ''}</b>
      <div class="nhome-bars">${MAC.map(([m]) => `<div class="nbar ${m}"><i style="width:${(tg[m] ? Math.min(100, tot[m] / tg[m] * 100) : 0).toFixed(1)}%"></i></div>`).join('')}</div></div>
    <span class="nhome-k"><b class="num">${k.kg(e)}</b><small>/ ${k.kg(t)} קק״ל</small></span></button>`;
}
function bindHome() { const b = K().$('[data-nhome]'); if (b) b.onclick = () => { curDate = K().today(); sub = 'day'; K().go('#/food'); }; }
function dayLine(date) {
  const n = N(); if (!n.on) return '';
  const k = K(), es = entriesOn(date); if (!es.length) return '';
  const tot = totals(es), tg = targetFor(date);
  return `<div class="nday">${ICO.fork}<span>תזונה באותו יום: <bdi dir="ltr"><b class="num">${k.kg(kcalOf(tot))}</b>/${k.kg(kcalOf(tg))}</bdi> קק״ל</span>${chips(tot)}</div>`;
}

window.KOACH_ROUTES = { food: render };
/* ---------- for the combined home page ---------- */
function dayStats(date) {
  const es = entriesOn(date), tot = totals(es), tg = targetFor(date);
  return { logged: es.length > 0, kcal: kcalOf(tot), tk: kcalOf(tg), tot, tg, train: isTrain(date) };
}
function avgKcal(days) {
  const t = K().today(), v = [];
  for (let i = 0; i < days; i++) { const d = addDays(t, -i), es = entriesOn(d); if (es.length) v.push(kcalOf(totals(es))); }
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
function weightNow() {
  const ws = [...N().weights].sort((a, b) => a.date.localeCompare(b.date)); if (!ws.length) return null;
  const last = ws[ws.length - 1], since = addDays(K().today(), -30), base = ws.find(w => w.date >= since) || ws[0];
  return { kg: last.kg, d: base !== last ? r2(last.kg - base.kg) : null };
}
function todayHTML() {
  const k = K(), d = k.today(), st = dayStats(d), rem = st.tk - st.kcal;
  return `<div class="tt-h">${ICO.fork}<b>תזונה</b></div>
    <div class="tf-row"><div class="nring-wrap sm">${ring(st.kcal, st.tk, 84)}<div class="nring-val"><b class="num">${k.kg(Math.abs(rem))}</b><span>${rem >= 0 ? 'נשארו' : 'מעל'}</span></div></div>
      <div class="tf-macros">${MAC.map(([m, name]) => `<div class="nm ${m}"><div class="row between"><span class="nm-n">${name}</span><span class="nm-s"><bdi dir="ltr"><b class="num">${fmt(st.tot[m])}</b>/${targetText(m, st.tg)}</bdi></span></div><div class="nbar"><i style="width:${(st.tg[m] ? Math.min(100, st.tot[m] / st.tg[m] * 100) : 0).toFixed(1)}%"></i></div></div>`).join('')}</div></div>`;
}
function goDay(date) { curDate = date; sub = 'day'; K().go('#/food'); if (location.hash === '#/food') render(); }

// from the home screen's "+ אוכל": today's log with the add sheet open for the current meal
function quickAddFood() { curDate = K().today(); sub = 'day'; K().go('#/food'); setTimeout(() => addSheet(mealNow()), 60); }

window.KOACH_HOOKS = { homeCard, bindHome, dayLine, settingsHTML, bindSettings, quickAddFood, dayStats, avgKcal, weightNow, todayHTML, goDay, isTrain };
})();
