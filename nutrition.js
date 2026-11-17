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
    meals: DEFAULT_MEALS.slice(), foods: [], fav: [], log: [], weights: [], claudeUrl: '', dayType: {}, body: null };
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
function targetFor(date) {
  const n = N(), t = n.target, tr = isTrain(date);
  return { p: +t.p || 0, f: +t.f || 0, c: tr ? (n.cTrain ?? +t.c ?? 0) : (n.cRest ?? +t.c ?? 0) };
}
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
    out.push({ id: 'r:' + e.name, name: e.name, serving: e.serving, p: e.p, f: e.f, c: e.c });
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
    <div class="seg" style="margin-bottom:14px">${[['day', 'יומן'], ['stats', 'התקדמות'], ['weight', 'משקל גוף']].map(([v, t]) => `<button data-sub="${v}" aria-pressed="${sub === v}">${t}</button>`).join('')}</div>
    <div id="nbody"></div>`;
  k.$$('[data-sub]').forEach(b => b.onclick = () => { sub = b.dataset.sub; render(); });
  ({ day: renderDay, stats: renderStats, weight: renderWeight })[sub]();
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
    <div class="card nsum">
      <div class="nring-wrap">${ring(eatK, tgK)}<div class="nring-val"><b class="num">${k.kg(Math.abs(rem))}</b><span>${rem >= 0 ? 'נשארו' : 'מעל היעד'}</span><small><bdi dir="ltr">${k.kg(eatK)} / ${k.kg(tgK)}</bdi> קק״ל</small></div></div>
      <div class="nmacros">${MAC.map(([m, name]) => {
        const e = tot[m], t = tg[m], pct = t ? Math.min(100, e / t * 100) : 0, over = t && e > t + .01;
        return `<div class="nm ${m}"><div class="row between"><span class="nm-n">${name}</span><span class="nm-s ${over ? 'over' : ''}"><bdi dir="ltr"><b class="num">${fmt(e)}</b>/${fmt(t)}</bdi> ★</span></div>
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
    entriesOn(addDays(curDate, -1)).filter(e => e.meal === meal).forEach(e => n.log.push({ ...e, id: k.uid(), date: curDate, at: Date.now() }));
    save(); renderDay(); k.toast(`הועתק מאתמול: ${meal}`);
  });
}

/* add food: search, recent, favourites, library, manual */
function addSheet(meal) {
  const k = K();
  const s = k.sheet('הוספת אוכל', `<div class="stack" style="gap:10px">
      <div class="chips" id="n-meals">${N().meals.map(m => `<button class="chip" data-meal="${k.esc(m)}" aria-pressed="${m === meal}">${k.esc(m)}</button>`).join('')}</div>
      <input class="input" id="n-q" placeholder="חיפוש מאכל…" autocomplete="off">
      <div id="n-res"></div>
    </div>`, `<button class="btn block" data-manual>${k.ICON.plus} הוספה ידנית (כוכבים או גרמים)</button>`);
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
function amountSheet(f, meal, edit) {
  const k = K(); let qty = edit ? edit.qty : 1;
  const s = k.sheet(f.name, `<div class="stack">
      <p class="muted small">מנה: ${k.esc(f.serving || '—')}${f.note ? ` · ${k.esc(f.note)}` : ''}</p>
      <div class="row between"><b style="font-weight:500">כמות מנות</b>
        <div class="row"><button class="btn sm" data-q="-0.5">−</button><input class="input num" id="n-qty" type="number" inputmode="decimal" step="0.25" min="0" value="${qty}" style="width:80px;text-align:center"><button class="btn sm" data-q="0.5">+</button></div></div>
      <div class="card" id="n-prev"></div>
      <div class="chips">${N().meals.map(m => `<button class="chip" data-meal="${k.esc(m)}" aria-pressed="${m === meal}">${k.esc(m)}</button>`).join('')}</div>
    </div>`, `<div class="row">${edit ? `<button class="btn danger" data-del>${k.ICON.trash}</button>` : ''}<button class="btn primary block grow" data-ok>${edit ? 'שמירה' : 'הוספה'}</button></div>`);
  const prev = () => {
    const st = { p: f.p * qty, f: f.f * qty, c: f.c * qty };
    k.$('#n-prev', s.el).innerHTML = `<div class="nprev">${MAC.map(([m, name]) => `<div class="${m}"><span>${name}</span><b class="num">${fmt(st[m])} ★</b><small>${Math.round(gramsOf(m, st[m]))} ג׳</small></div>`).join('')}<div><span>קלוריות</span><b class="num">${k.kg(kcalOf(st))}</b><small>קק״ל</small></div></div>`;
  };
  const inp = k.$('#n-qty', s.el);
  inp.oninput = () => { qty = Math.max(0, parseFloat(inp.value) || 0); prev(); };
  k.$$('[data-q]', s.el).forEach(b => b.onclick = () => { qty = Math.max(0.25, r2(qty + +b.dataset.q)); inp.value = qty; prev(); });
  k.$$('[data-meal]', s.el).forEach(b => b.onclick = () => { meal = b.dataset.meal; k.$$('[data-meal]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  prev();
  k.$('[data-ok]', s.el).onclick = () => {
    if (!qty) return k.toast('צריך כמות');
    const n = N();
    if (edit) Object.assign(edit, { qty, meal });
    else n.log.push({ id: k.uid(), date: curDate, meal, name: f.name, serving: f.serving || '', qty, p: f.p || 0, f: f.f || 0, c: f.c || 0, at: Date.now() });
    save(); s.close(); renderDay(); if (!edit) k.toast(`נוסף: ${f.name}`);
  };
  const del = k.$('[data-del]', s.el);
  if (del) del.onclick = () => { const n = N(); n.log = n.log.filter(e => e.id !== edit.id); save(); s.close(); renderDay(); };
}
function entrySheet(e) { if (e) amountSheet({ name: e.name, serving: e.serving, p: e.p, f: e.f, c: e.c }, e.meal, e); }
function manualSheet(meal) {
  const k = K(), n = N(); let mode = 'stars';
  const s = k.sheet('הוספה ידנית', `<div class="stack">
      <label class="field"><span>מה אכלת</span><input class="input" id="m-name" placeholder="למשל: שייק חלבון"></label>
      <label class="field"><span>מנה (לא חובה)</span><input class="input" id="m-serv" placeholder="למשל: כוס, 200 גרם"></label>
      <div class="seg" id="m-mode"><button data-mode="stars" aria-pressed="true">כוכבים</button><button data-mode="grams" aria-pressed="false">גרמים</button></div>
      <div class="grid3">${MAC.map(([m, name]) => `<label class="field"><span>${name}</span><input class="input num" id="m-${m}" type="number" inputmode="decimal" step="0.25" min="0" placeholder="0" style="text-align:center"></label>`).join('')}</div>
      <p class="note" id="m-hint"></p>
      <label class="row"><span class="grow">לשמור במאגר שלי</span><span class="toggle"><input type="checkbox" id="m-keep" checked><span></span></span></label>
    </div>`, '<button class="btn primary block" data-ok>הוספה</button>');
  const stars = () => Object.fromEntries(MAC.map(([m]) => { const v = parseFloat(k.$('#m-' + m, s.el).value) || 0; return [m, mode === 'stars' ? v : r2(v / n.grams[m])]; }));
  const hint = () => { const st = stars(); k.$('#m-hint', s.el).textContent = mode === 'stars'
    ? `≈ ${MAC.map(([m, name]) => `${name} ${Math.round(gramsOf(m, st[m]))} ג׳`).join(' · ')} · ${k.kg(kcalOf(st))} קק״ל`
    : `≈ ${MAC.map(([m, name]) => `${name} ${fmt(st[m])} ★`).join(' · ')} · ${k.kg(kcalOf(st))} קק״ל`; };
  k.$$('[data-mode]', s.el).forEach(b => b.onclick = () => { mode = b.dataset.mode; k.$$('[data-mode]', s.el).forEach(x => x.setAttribute('aria-pressed', x === b)); MAC.forEach(([m]) => { k.$('#m-' + m, s.el).step = mode === 'stars' ? '0.25' : '1'; }); hint(); });
  MAC.forEach(([m]) => { k.$('#m-' + m, s.el).oninput = hint; }); hint();
  setTimeout(() => k.$('#m-name', s.el).focus(), 320);
  k.$('[data-ok]', s.el).onclick = () => {
    const name = k.$('#m-name', s.el).value.trim() || 'אוכל', serving = k.$('#m-serv', s.el).value.trim(), st = stars();
    if (!st.p && !st.f && !st.c) return k.toast('צריך לפחות ערך אחד');
    if (k.$('#m-keep', s.el).checked && !library().some(f => f.name === name)) n.foods.unshift({ id: 'u' + k.uid(), name, serving, ...st, note: '' });
    n.log.push({ id: k.uid(), date: curDate, meal, name, serving, qty: 1, ...st, at: Date.now() });
    save(); s.close(); renderDay(); k.toast(`נוסף: ${name}`);
  };
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
window.KOACH_HOOKS = { homeCard, bindHome, dayLine, settingsHTML, bindSettings };
})();
