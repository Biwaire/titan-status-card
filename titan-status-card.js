/* titan-status-card — carte d'état d'une batterie (SOC, état, puissance, PV, températures, courbe, compteurs) */
// ignore les valeurs vides ou false d'un réglage (l'éditeur Home Assistant en laisse parfois)
const clean = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v));
class TitanStatusCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.soc_entity) throw new Error("soc_entity est obligatoire");
    this._c = {
      name: "Titan",
      brand: "",
      gold: "#c8921b",             // couleur du bandeau gauche et de la marque
      curve_color: "#3fbf6a",      // couleur de la courbe
      show_ring: false,            // cercle d'état à droite
      show_temps: false,           // pastilles de température à droite
      theme: "light",              // "light" (carte blanche) ou "auto" (couleurs du thème HA)
      power_charge_positive: true,
      capacity_kwh: 4.02,
      history_hours: 24,
      threshold: 10,
      ...config,
      // palette : "gold" (blanc et doré) ou "green" (noir et vert)
      palette: config.palette === "green" ? "green" : "gold",
      gold: config.palette === "green" ? (config.green || "#2fd067") : (config.gold || "#c8921b"),
      theme: config.palette === "green" ? "black" : (config.theme || "light"),
      colors: { charge: "#2e9e5b", discharge: "#f08a1c", static: "#7d8794", ...clean(config.colors) },
      bar_colors: { charge: "#3fbf6a", discharge: "#2f8fe0", static: "#2f8fe0", low: "#e5484d", ...clean(config.bar_colors) },
      labels: { charge: "CHARGE", discharge: "DÉCHARGE", static: "VEILLE", ...clean(config.labels) },
      pv: Array.isArray(config.pv) ? config.pv.slice(0, 4) : [],
      temps: Array.isArray(config.temps) ? config.temps.slice(0, 4) : [],
      footer: Array.isArray(config.footer) ? config.footer.slice(0, 4) : [],
    };
    this._hist = null; this._histAt = 0; this._histBusy = false;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._build();
  }

  getCardSize() { return 3; }

  set hass(hass) {
    this._hass = hass;
    if (this._e) this._update();
  }

  _esc(s) { return String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m])); }
  _num(id) {
    if (!id || !this._hass) return NaN;
    const s = this._hass.states[id];
    if (!s) return NaN;
    const v = parseFloat(String(s.state).replace(",", "."));
    return Number.isFinite(v) ? v : NaN;
  }
  _txt(id) { const s = id && this._hass && this._hass.states[id]; return s ? String(s.state) : ""; }
  _fmt(v, d = 0) { return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  _hm(h) {
    if (!Number.isFinite(h) || h < 0 || h >= 100) return "--:--";
    const m = Math.round(h * 60);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  _build() {
    const c = this._c, dark = c.theme === "black", light = c.theme !== "auto" && !dark;
    const tc = dark ? "#f1f5f2" : light ? "#111" : "var(--primary-text-color)";
    const pv = c.pv.map((p, i) => `<div class="pv"><ha-icon icon="mdi:solar-panel-large"></ha-icon><span class="pvv" data-i="${i}">—</span></div>`).join("");
    const temps = c.temps.map((t, i) => {
      const ic = t.icon || (/🌡/.test(t.label || "") ? "mdi:thermometer" : "");
      return `<div class="chip">${ic ? `<ha-icon icon="${this._esc(ic)}"></ha-icon>` : `<b>${this._esc(t.label || "")}</b>`}<span class="tv" data-i="${i}">—</span></div>`;
    }).join("");
    const foot = c.footer.map((f, i) => `<div class="fo"><i>${this._esc(f.label || "")}</i><b class="fv" data-i="${i}">—</b></div>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block }
        ha-card { display:block;overflow:hidden;border-radius:16px;container-type:inline-size;
          ${dark ? "background:#0f1210;color:#f1f5f2;" : light ? "background:#fbfaf7;color:#111;" : "background:var(--card-background-color);color:var(--primary-text-color);"} }
        .wrap { display:flex;min-height:190px }
        .tg { display:flex;justify-content:center;height:24px;border-top:1px solid color-mix(in srgb,var(--gold) 25%,transparent) }
        .tb { all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;width:64px;height:24px;color:var(--gold) }
        .tb ha-icon { --mdc-icon-size:22px;transition:transform .25s }
        .tb.open ha-icon { transform:rotate(180deg) }
        .lp { border-top:1px solid color-mix(in srgb,var(--gold) 25%,transparent) }
        .side { width:56px;flex:none;display:flex;flex-direction:column;align-items:center;
          justify-content:space-between;padding:10px 0;color:#111;
          background:linear-gradient(180deg,color-mix(in srgb,var(--gold) 82%,#fff),var(--gold));position:relative }
        .eta { display:flex;flex-direction:column;align-items:center;font-size:.72rem;font-weight:600;gap:2px }
        .eta ha-icon { --mdc-icon-size:18px }
        .mid { display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-height:0;width:100% }
        .bar { width:6px;height:100%;min-height:60px;background:${dark ? "#060807" : "rgba(255,255,255,.28)"};border-radius:3px;position:relative;overflow:hidden }
        .bar i { position:absolute;left:0;right:0;bottom:0;background:var(--bc,#2f8fe0);border-radius:3px;
          transition:height .6s,background .4s;overflow:hidden }
        .bar i::after { content:"";position:absolute;left:0;right:0;height:40%;opacity:0;
          background:linear-gradient(180deg,transparent,rgba(255,255,255,.85),transparent) }
        .bar.charge i::after { opacity:1;animation:sweepup 1.8s ease-in-out infinite }
        .bar.discharge i::after { opacity:1;animation:sweepdown 1.8s ease-in-out infinite }
        @keyframes sweepdown { from { top:-40% } to { top:100% } }
        @keyframes sweepup { from { top:100% } to { top:-40% } }
        .vt { writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;letter-spacing:.14em;font-size:.78rem }
        .pw { display:flex;flex-direction:column;align-items:center;font-size:.72rem;font-weight:700 }
        .pw ha-icon { --mdc-icon-size:18px }
        .main { flex:1;min-width:0;padding:12px 14px 10px;display:flex;flex-direction:column;position:relative }
        .head { display:flex;justify-content:space-between;align-items:baseline }
        .name { font-weight:800;letter-spacing:.12em;font-size:.95rem;text-transform:uppercase }
        .brand { font-weight:800;letter-spacing:.16em;font-size:.8rem;color:var(--gold) }
        .row { display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;position:relative;z-index:1 }
        .left { min-width:0 }
        .soc { font-size:3rem;font-weight:800;line-height:1;color:var(--pc,var(--gold));display:flex;align-items:baseline }
        .soc small { font-size:1.1rem;font-weight:600;margin-left:3px }
        .kwh { margin-top:4px;font-size:.95rem;font-weight:600 }
        .pvs { display:flex;gap:10px;margin-top:10px }
        .pv { display:flex;flex-direction:column;align-items:center;font-size:.62rem }
        .pv ha-icon { --mdc-icon-size:26px }
        .ring { width:104px;height:104px;flex:none;border-radius:50%;border:3px solid var(--gold);
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
          box-shadow:0 0 18px color-mix(in srgb,var(--gold) 35%,transparent);color:var(--gold) }
        .ring span { color:${tc} }
        .ring ha-icon { --mdc-icon-size:38px }
        .ring span { font-size:.72rem;font-weight:700;letter-spacing:.06em }
        .chips { display:flex;flex-direction:column;gap:6px;align-items:stretch }
        .chip { border:1.5px solid var(--gold);color:${tc};border-radius:8px;display:flex;align-items:center;justify-content:center;gap:3px;
          padding:3px 8px;font-size:.72rem;font-weight:600;white-space:nowrap }
        .chip ha-icon { --mdc-icon-size:16px;color:var(--gold) }
        .chip.mode { font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700;padding:2px 8px }
        svg.spark { position:absolute;left:0;right:0;bottom:34px;width:100%;height:46px;z-index:0;pointer-events:none }
        .foot { display:flex;justify-content:space-between;gap:6px;margin-top:auto;position:relative;z-index:1;padding-top:52px }
        .fo { display:flex;align-items:center;gap:5px;font-size:.9rem;white-space:nowrap }
        .fo i { font-style:normal;font-size:.6rem;font-weight:700;border:1.5px solid var(--gold);
          border-radius:5px;padding:1px 4px }
        .fo b { font-weight:700 }
        @container (max-width: 380px) {
          .ring { width:78px;height:78px }
          .ring ha-icon { --mdc-icon-size:28px }
          .ring span { font-size:.6rem }
          .soc { font-size:2.4rem }
          .chip { padding:2px 5px;font-size:.64rem }
          .main { padding:10px 10px 8px }
          .fo { font-size:.66rem;gap:2px }
          .fo i { font-size:.5rem;padding:1px 3px }
          .foot { gap:2px }
        }
        @container (max-width: 350px) {
          .fo { font-size:.58rem;gap:2px }
          .fo i { font-size:.46rem;padding:1px 2px }
        }
      </style>
      <ha-card>
        <div class="wrap">
          <div class="side">
            <div class="eta"><ha-icon icon="mdi:clock-outline"></ha-icon><span class="etav">--:--</span></div>
            <div class="mid"><div class="vt">—</div><div class="bar"><i></i></div></div>
            <div class="pw"><ha-icon icon="mdi:flash"></ha-icon><span class="pwv">0W</span></div>
          </div>
          <div class="main">
            <div class="head"><div class="name">${this._esc(c.name)}</div><div class="brand">${this._esc(c.brand)}</div></div>
            <div class="row">
              <div class="left">
                <div class="soc"><span class="socv">—</span><small>%</small></div>
                <div class="kwh">—</div>
                ${pv ? `<div class="pvs">${pv}</div>` : ""}
              </div>
              ${c.show_ring ? `<div class="ring"><ha-icon icon="mdi:battery"></ha-icon><span class="rl">—</span></div>` : ""}
              ${(temps && c.show_temps) || c.mode_entity || c.days_entity
                ? `<div class="chips">${c.mode_entity ? `<div class="chip mode"><span class="mv">—</span></div>` : ""}${c.days_entity ? `<div class="chip mode"><span class="dv">—</span></div>` : ""}${c.show_temps ? temps : ""}</div>` : ""}
            </div>
            <svg class="spark" viewBox="0 0 300 46" preserveAspectRatio="none">
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--cc)" stop-opacity=".3"/><stop offset="1" stop-color="var(--cc)" stop-opacity="0"/>
              </linearGradient></defs>
              <path class="sa" fill="url(#g)" d=""/><path class="sl" fill="none" stroke="var(--cc)" stroke-width="1.6"
                stroke-opacity=".7" vector-effect="non-scaling-stroke" d=""/>
            </svg>
            ${foot ? `<div class="foot">${foot}</div>` : `<div class="foot"></div>`}
          </div>
        </div>
        ${c.link ? `<div class="tg"><button class="tb" aria-label="Afficher ou masquer le Link"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
        <div class="lp" hidden></div>` : ""}
      </ha-card>`;
    const r = this.shadowRoot;
    this._e = {
      card: r.querySelector("ha-card"), side: r.querySelector(".side"), barBox: r.querySelector(".bar"),
      etav: r.querySelector(".etav"), vt: r.querySelector(".vt"), bar: r.querySelector(".bar i"),
      pwv: r.querySelector(".pwv"), socv: r.querySelector(".socv"), kwh: r.querySelector(".kwh"),
      ring: r.querySelector(".ring"), ringIcon: r.querySelector(".ring ha-icon"), rl: r.querySelector(".rl"),
      mv: r.querySelector(".mv"), dv: r.querySelector(".dv"),
      pv: [...r.querySelectorAll(".pvv")], tv: [...r.querySelectorAll(".tv")], fv: [...r.querySelectorAll(".fv")],
      sa: r.querySelector(".sa"), sl: r.querySelector(".sl"),
    };
    this._lk = null;
    if (c.link) {
      const key = "titan-link-open:" + (c.name || "");
      let open = false;
      try { open = localStorage.getItem(key) === "1"; } catch (err) { /* ignore */ }
      const lp = r.querySelector(".lp"), tb = r.querySelector(".tb");
      const lk = document.createElement("titan-link-card");
      lk.setConfig({ theme: c.theme, gold: c.gold, state_entity: c.state_entity, power_entity: c.power_entity,
        power_charge_positive: c.power_charge_positive, threshold: c.threshold, bar_colors: c.bar_colors,
        ...c.link, brand: "", embedded: true });
      lp.append(lk); this._lk = lk;
      const apply = () => { lp.hidden = !open; tb.classList.toggle("open", open); };
      this._applyLink = o => { open = o; apply(); };
      tb.addEventListener("click", () => {
        if (c.link_toggle_entity && this._hass) {
          this._hass.callService("input_boolean", "toggle", { entity_id: c.link_toggle_entity });
          return;
        }
        open = !open; apply();
        try { localStorage.setItem(key, open ? "1" : "0"); } catch (err) { /* ignore */ }
      });
      apply();
    }
    if (this._hass) this._update();
  }

  _kind(p) {
    const c = this._c, st = this._txt(c.state_entity);
    if (st) {
      if (/discharg|décharg|decharg/i.test(st)) return "discharge";
      if (/charg/i.test(st)) return "charge";
      if (/static|idle|standby|veille|repos|statique/i.test(st)) return "static";
    }
    if (Number.isFinite(p)) {
      if (p > c.threshold) return "charge";
      if (p < -c.threshold) return "discharge";
    }
    return "static";
  }

  _update() {
    const c = this._c, e = this._e;
    const soc = this._num(c.soc_entity);
    let p = this._num(c.power_entity);
    if (Number.isFinite(p) && !c.power_charge_positive) p = -p;
    const kind = this._kind(p);
    const col = c.colors[kind];
    e.card.style.setProperty("--sc", col);
    e.card.style.setProperty("--gold", c.gold);
    e.card.style.setProperty("--cc", c.curve_color);
    const floorV = this._num(c.floor_entity);
    const low = Number.isFinite(soc) && Number.isFinite(floorV) && soc < floorV;
    const bcs = c.theme === "black"
      ? { charge: "#a6ffc4", discharge: "#58b0ff", static: "#58b0ff", low: "#ff5a5f", ...clean(c.bar_colors_dark) }
      : c.bar_colors;
    e.card.style.setProperty("--bc", low ? bcs.low : bcs[kind]);
    e.barBox.className = "bar " + kind;
    e.card.style.setProperty("--pc", low ? "#e5484d" : c.gold);

    e.vt.textContent = c.labels[kind];
    e.bar.style.height = (Number.isFinite(soc) ? Math.max(0, Math.min(100, soc)) : 0) + "%";
    e.pwv.textContent = Number.isFinite(p) ? this._fmt(Math.abs(p), 0) + "W" : "—";
    e.socv.textContent = Number.isFinite(soc) ? this._fmt(soc, 0) : "—";

    let stored = this._num(c.stored_entity);
    if (!Number.isFinite(stored) && Number.isFinite(soc)) stored = soc / 100 * c.capacity_kwh;
    e.kwh.textContent = Number.isFinite(stored) ? this._fmt(stored, 2) + " kWh" : "—";

    if (e.ringIcon) e.ringIcon.setAttribute("icon", kind === "charge" ? "mdi:battery-charging"
      : kind === "discharge" ? "mdi:battery-arrow-down" : "mdi:battery");
    if (e.rl) e.rl.textContent = c.labels[kind];

    // durée estimée : jusqu'au plancher (décharge) ou à 100 % (charge)
    let eta = "--:--";
    if (Number.isFinite(soc) && Number.isFinite(p) && Math.abs(p) > 20) {
      const cap = c.capacity_kwh, floor = Number.isFinite(this._num(c.floor_entity)) ? this._num(c.floor_entity) : 0;
      if (kind === "discharge") eta = this._hm(Math.max(0, soc - floor) / 100 * cap * 1000 / Math.abs(p));
      else if (kind === "charge") eta = this._hm(Math.max(0, 100 - soc) / 100 * cap * 1000 / Math.abs(p));
    }
    e.etav.textContent = eta;

    if (e.mv) {
      const m = this._txt(c.mode_entity);
      e.mv.textContent = (c.mode_labels && c.mode_labels[m]) || (m && m !== "unknown" && m !== "unavailable" ? m : "—");
    }

    if (e.dv) {
      const d = this._num(c.days_entity);
      const lbl = c.days_label !== undefined ? c.days_label : "Charge complète";
      e.dv.textContent = Number.isFinite(d)
        ? (d < 1 ? "Charge complète aujourd'hui" : `${lbl ? lbl + " " : ""}${this._fmt(d, 0)} j`) : "—";
    }

    c.pv.forEach((x, i) => {
      const v = this._num(x.entity);
      if (e.pv[i]) e.pv[i].textContent = Number.isFinite(v) ? this._fmt(v, 0) + "W" : "—";
    });
    c.temps.forEach((x, i) => {
      const v = this._num(x.entity);
      if (e.tv[i]) e.tv[i].textContent = Number.isFinite(v) ? this._fmt(v, 1) + "°" : "—";
    });
    c.footer.forEach((x, i) => {
      const v = this._num(x.entity);
      const u = x.unit !== undefined ? x.unit : ((this._hass.states[x.entity] || { attributes: {} }).attributes.unit_of_measurement || "");
      if (e.fv[i]) e.fv[i].textContent = Number.isFinite(v)
        ? this._fmt(v, x.decimals !== undefined ? x.decimals : 2) + (u ? " " + u : "") : "—";
    });

    if (this._lk) this._lk.hass = this._hass;
    if (this._lk && c.link_toggle_entity && this._hass.states[c.link_toggle_entity]) {
      this._applyLink(this._hass.states[c.link_toggle_entity].state === "on");
    }
    this._loadHistory();
  }

  async _loadHistory() {
    const c = this._c, id = c.history_entity || c.power_entity;
    if (!id || !this._hass || this._histBusy || typeof this._hass.callApi !== "function") return;
    if (this._hist && Date.now() - this._histAt < 300000) return;
    this._histBusy = true;
    try {
      const end = new Date(), start = new Date(end.getTime() - c.history_hours * 3600 * 1000);
      const url = `history/period/${start.toISOString()}?filter_entity_id=${id}&end_time=${end.toISOString()}&minimal_response&no_attributes`;
      const res = await this._hass.callApi("GET", url);
      const rows = (res && res[0] ? res[0] : []).map(r => ({ t: new Date(r.last_changed || r.last_updated || r.lu * 1000).getTime(), v: parseFloat(r.state) }))
        .filter(r => Number.isFinite(r.t) && Number.isFinite(r.v));
      this._hist = rows; this._histAt = Date.now();
      this._drawSpark(rows, start.getTime(), end.getTime());
    } catch (err) {
      this._histAt = Date.now() - 240000; // réessaie dans ~1 min
    } finally { this._histBusy = false; }
  }

  _drawSpark(rows, t0, t1) {
    const e = this._e;
    if (!e || rows.length < 2) { e && (e.sa.setAttribute("d", ""), e.sl.setAttribute("d", "")); return; }
    const N = 60, buckets = Array.from({ length: N }, () => []);
    rows.forEach(r => { const i = Math.min(N - 1, Math.max(0, Math.floor((r.t - t0) / (t1 - t0) * N))); buckets[i].push(r.v); });
    const pts = []; let last = rows[0].v;
    buckets.forEach(b => { if (b.length) last = b.reduce((a, x) => a + x, 0) / b.length; pts.push(last); });
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => [i / (N - 1) * 300, 40 - (v - lo) / span * 34]);
    const d = xy.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
    e.sl.setAttribute("d", d);
    e.sa.setAttribute("d", d + " L300 46 L0 46 Z");
  }
}


/* titan-link-card — module Link : SOC, température, cycles (même style que titan-status-card) */
class TitanLinkCard extends TitanStatusCard {
  setConfig(config) {
    if (!config || !config.soc_entity) throw new Error("soc_entity est obligatoire");
    this._c = {
      name: "Link",
      brand: "",
      theme: "light",
      gold: "#c8921b",
      power_charge_positive: true,
      threshold: 10,
      ...config,
      // palette : "gold" (blanc et doré) ou "green" (noir et vert)
      palette: config.palette === "green" ? "green" : "gold",
      gold: config.palette === "green" ? (config.green || "#2fd067") : (config.gold || "#c8921b"),
      theme: config.palette === "green" ? "black" : (config.theme || "light"),
      bar_colors: { charge: "#3fbf6a", discharge: "#2f8fe0", static: "#2f8fe0", low: "#e5484d", ...clean(config.bar_colors) },
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._build();
  }

  getCardSize() { return 2; }

  _build() {
    const c = this._c, dark = c.theme === "black", light = c.theme !== "auto" && !dark;
    const tc = dark ? "#f1f5f2" : light ? "#111" : "var(--primary-text-color)";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block }
        ha-card { display:flex;flex-direction:row;min-height:190px;box-sizing:border-box;
          overflow:hidden;border-radius:${c.embedded ? "0" : "16px"};padding:0;container-type:inline-size;
          ${c.embedded ? "box-shadow:none;border:none;" : ""}
          ${dark ? "background:#0f1210;color:#f1f5f2;" : light ? "background:#fbfaf7;color:#111;" : "background:var(--card-background-color);color:var(--primary-text-color);"} }
        .sd { width:56px;flex:none;background:linear-gradient(180deg,color-mix(in srgb,var(--gold) 82%,#fff),var(--gold)) }
        .bd { flex:1;min-width:0;padding:12px 14px 10px;display:flex;flex-direction:column }
        .head { display:flex;justify-content:space-between;align-items:baseline }
        .name { font-weight:800;letter-spacing:.12em;font-size:.95rem;text-transform:uppercase }
        .brand { font-weight:800;letter-spacing:.16em;font-size:.8rem;color:var(--gold) }
        .row { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:6px }
        .soc { font-size:3rem;font-weight:800;line-height:1;color:var(--pc,var(--gold));display:flex;align-items:baseline }
        .soc small { font-size:1.1rem;font-weight:600;margin-left:3px }
        .chips { display:flex;flex-direction:column;gap:6px;align-items:stretch;margin-top:16px;min-width:104px }
        .chip { display:flex;align-items:center;justify-content:center;gap:3px;border:1.5px solid var(--gold);color:${tc};
          border-radius:8px;padding:3px 8px;font-size:.72rem;font-weight:600;white-space:nowrap }
        .chip ha-icon { --mdc-icon-size:16px;color:var(--gold) }
        .chip small { font-weight:500 }
        .track { margin-top:auto;height:8px;border-radius:4px;background:color-mix(in srgb,var(--bc) 18%,transparent);overflow:hidden }
        .track i { display:block;height:100%;width:0;background:var(--bc);border-radius:4px;transition:width .6s,background .4s;position:relative;overflow:hidden }
        .track i::after { content:"";position:absolute;top:0;bottom:0;width:40%;opacity:0;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent) }
        .track.charge i::after { opacity:1;animation:sweepright 1.8s ease-in-out infinite }
        .track.discharge i::after { opacity:1;animation:sweepleft 1.8s ease-in-out infinite }
        @keyframes sweepright { from { left:-40% } to { left:100% } }
        @keyframes sweepleft { from { left:100% } to { left:-40% } }
        @container (max-width: 380px) { .soc { font-size:2.4rem } .chip { padding:2px 5px;font-size:.64rem } .bd { padding:10px 10px 8px } }
      </style>
      <ha-card>
        <div class="sd"></div>
        <div class="bd">
          <div class="head"><div class="name">${this._esc(c.name)}</div><div class="brand">${this._esc(c.brand)}</div></div>
          <div class="row">
            <div class="soc"><span class="socv">—</span><small>%</small></div>
            <div class="chips">
              ${c.temp_entity ? `<div class="chip"><ha-icon icon="mdi:thermometer"></ha-icon><span class="tv">—</span></div>` : ""}
              ${c.cycles_entity ? `<div class="chip"><ha-icon icon="mdi:battery-sync"></ha-icon><span class="cv">—</span><small>cycles</small></div>` : ""}
              ${(Array.isArray(c.infos) ? c.infos.slice(0, 3) : []).map((x, i) => `<div class="chip"><ha-icon icon="${this._esc(x.icon || "mdi:information-outline")}"></ha-icon><span class="iv" data-i="${i}">—</span></div>`).join("")}
            </div>
          </div>
          <div class="track"><i></i></div>
        </div>
      </ha-card>`;
    const r = this.shadowRoot;
    this._e = { card: r.querySelector("ha-card"), socv: r.querySelector(".socv"), tv: r.querySelector(".tv"),
      cv: r.querySelector(".cv"), iv: [...r.querySelectorAll(".iv")], fill: r.querySelector(".track i"), track: r.querySelector(".track") };
    if (this._hass) this._update();
  }

  _update() {
    const c = this._c, e = this._e;
    const soc = this._num(c.soc_entity), floor = this._num(c.floor_entity);
    const low = Number.isFinite(soc) && Number.isFinite(floor) && soc < floor;
    e.card.style.setProperty("--gold", c.gold);
    let p = this._num(c.power_entity);
    if (Number.isFinite(p) && !c.power_charge_positive) p = -p;
    const kind = this._kind(p);
    e.card.style.setProperty("--bc", low ? c.bar_colors.low : c.bar_colors[kind]);
    e.card.style.setProperty("--pc", low ? c.bar_colors.low : c.gold);
    e.track.className = "track " + kind;
    e.socv.textContent = Number.isFinite(soc) ? this._fmt(soc, 0) : "—";
    e.fill.style.width = (Number.isFinite(soc) ? Math.max(0, Math.min(100, soc)) : 0) + "%";
    if (e.tv) { const t = this._num(c.temp_entity); e.tv.textContent = Number.isFinite(t) ? this._fmt(t, 1) + " °C" : "—"; }
    if (e.cv) { const n = this._num(c.cycles_entity); e.cv.textContent = Number.isFinite(n) ? this._fmt(n, 0) : "—"; }
    (Array.isArray(c.infos) ? c.infos.slice(0, 3) : []).forEach((x, i) => {
      const v = this._num(x.entity), st = (this._hass.states[x.entity] || { attributes: {} });
      const u = x.unit !== undefined ? x.unit : (st.attributes.unit_of_measurement || "");
      if (e.iv[i]) e.iv[i].textContent = Number.isFinite(v)
        ? this._fmt(v, x.decimals !== undefined ? x.decimals : 1) + (u ? " " + u : "") : (this._txt(x.entity) || "—");
    });
  }
}

customElements.define("titan-status-card", TitanStatusCard);
customElements.define("titan-link-card", TitanLinkCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "titan-link-card",
  name: "Titan Link Card",
  description: "Module Link : SOC, température et cycles",
});
window.customCards.push({
  type: "titan-status-card",
  name: "Titan Status Card",
  description: "Carte d'état d'une batterie : SOC, état, puissance, PV, températures, courbe et compteurs",
});
