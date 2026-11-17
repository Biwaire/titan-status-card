/* titan-status-card — carte d'état d'une batterie (SOC, état, puissance, PV, températures, courbe, compteurs) */
// ignore les valeurs vides ou false d'un réglage (l'éditeur Home Assistant en laisse parfois)
const clean = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v));
/* Fond et couleur du texte de la carte ; l'option background impose la couleur de fond */
const tscCol = v => (typeof v === "string" ? v.replace(/[;{}<>]/g, "").trim() : "");
function tscBg(c, dark, light) {
  const txt = tscCol(c.text_color) || (dark ? "#f1f5f2" : light ? "#111" : "var(--primary-text-color)");
  const def = dark ? "#0f1210" : light ? "#fbfaf7" : "var(--card-background-color)";
  const bg = typeof c.background === "string" && c.background.trim() ? c.background.replace(/[;{}<>]/g, "").trim() : def;
  return "background:" + bg + ";color:" + txt + ";" + (tscCol(c.border_color) ? "--bd:" + tscCol(c.border_color) + ";" : "");
}

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
      controls: Array.isArray(config.controls) ? config.controls.filter(o => o && o.entity).slice(0, 6) : [],
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
    const linksCfg = (Array.isArray(c.link) ? c.link : c.link ? [c.link] : []).filter(o => o && typeof o === "object");
    const tc = tscCol(c.text_color) || (dark ? "#f1f5f2" : light ? "#111" : "var(--primary-text-color)");
    const pv = c.pv.map((p, i) => `<div class="pv"><ha-icon icon="mdi:solar-panel-large"></ha-icon><span class="pvv" data-i="${i}">—</span></div>`).join("");
    const temps = c.temps.map((t, i) => {
      const ic = t.icon || (/🌡/.test(t.label || "") ? "mdi:thermometer" : "");
      return `<div class="chip">${ic ? `<ha-icon icon="${this._esc(ic)}"></ha-icon>` : `<b>${this._esc(t.label || "")}</b>`}<span class="tv" data-i="${i}">—</span></div>`;
    }).join("");
    const foot = c.footer.map((f, i) => `<div class="fo"><i>${this._esc(f.label || "")}</i><b class="fv" data-i="${i}">—</b></div>`).join("");
    const ctlIcon = o => o.icon || (/off_grid|offgrid/i.test(o.entity) ? "mdi:transmission-tower-off" : /led/i.test(o.entity) ? "mdi:led-on" : "mdi:toggle-switch");
    const ctlBottom = c.controls_position === "bottom";
    const ctl = c.controls.length ? `<div class="ctl${ctlBottom ? "" : " inhead"}">${c.controls.map((o, i) =>
      `<button class="cb" data-i="${i}" title="${this._esc(o.label || o.entity)}"><ha-icon icon="${this._esc(ctlIcon(o))}"></ha-icon><span>${this._esc(o.label || "")}</span></button>`).join("")}</div>` : "";
    const pl = c.planning && typeof c.planning === "object" ? c.planning : null;
    const plSlots = pl && Array.isArray(pl.slots) ? pl.slots.filter(o => o && o.start && o.end).slice(0, 4) : [];
    const warnW = pl && Number.isFinite(Number(pl.power_warn)) ? Number(pl.power_warn) : 800;
    const plTop = !!(pl && String(pl.position || "").toLowerCase() === "top");
    const plHtml = pl ? `<div class="pl${plTop ? " top" : ""}">
        <div class="ph"><button class="pt"><ha-icon icon="mdi:calendar-clock"></ha-icon><span>${this._esc(pl.name || "Planning de recharge")}</span><ha-icon class="pc" icon="mdi:chevron-down"></ha-icon></button>
          ${pl.enable_entity ? `<button class="pe">—</button>` : ""}</div>
        <div class="pb" hidden>
          ${plSlots.map(o => `<div class="ps"><b>${this._esc(o.label || "")}</b>
            <input class="pi" type="time" data-e="${this._esc(o.start)}"><span>→</span><input class="pi" type="time" data-e="${this._esc(o.end)}"></div>`).join("")}
          ${pl.end_entity ? `<div class="pr"><i>${this._esc(pl.end_label || "Fin")}</i><select class="pse" data-e="${this._esc(pl.end_entity)}"></select></div>` : ""}
          ${pl.power_entity ? `<div class="pr"><i>${this._esc(pl.power_label || "Puissance")}</i><div><button class="pm" data-e="${this._esc(pl.power_entity)}" data-d="-1">−</button><em data-e="${this._esc(pl.power_entity)}" data-u="W">—</em><button class="pm" data-e="${this._esc(pl.power_entity)}" data-d="1">+</button></div></div>
          <div class="pwn" hidden>${pl.power_warn_text ? this._esc(pl.power_warn_text) : `Suivant votre configuration, les limites de sécurité par défaut sont :<br><b>Charge max : ${warnW} W</b> · <b>Décharge max : ${warnW} W</b><br>⚠️ <b>AVERTISSEMENT</b> : modifier ces valeurs peut endommager votre matériel.`}</div>` : ""}
          ${pl.soc_entity ? `<div class="pr"><i>${this._esc(pl.soc_label || "SOC cible")}</i><div><button class="pm" data-e="${this._esc(pl.soc_entity)}" data-d="-1">−</button><em data-e="${this._esc(pl.soc_entity)}" data-u="%">—</em><button class="pm" data-e="${this._esc(pl.soc_entity)}" data-d="1">+</button></div></div>` : ""}
        </div></div>` : "";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block }
        ha-card { display:block;overflow:hidden;border-radius:16px;container-type:inline-size;
          ${tscBg(c, dark, light)} }
        .wrap { display:flex;min-height:190px }
        .ringed .wrap { min-height:204px }
        .ctl { display:flex;gap:8px;padding:8px 14px;border-top:1px solid color-mix(in srgb,var(--gold) 25%,transparent) }
        .pl { border-top:1px solid color-mix(in srgb,var(--gold) 25%,transparent) }
        .pl.top { border-top:0;border-bottom:1px solid color-mix(in srgb,var(--gold) 25%,transparent) }
        .ph { display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 14px }
        .pt { all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;min-width:0;font-size:.66rem;font-weight:800;
          letter-spacing:.1em;text-transform:uppercase;color:${tc} }
        .pt ha-icon { --mdc-icon-size:18px;color:var(--gold);flex:none }
        .pt span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
        .pt .pc { transition:transform .25s }
        .pt.open .pc { transform:rotate(180deg) }
        .pl.top .pt .pc { transform:rotate(180deg) }
        .pl.top .pt.open .pc { transform:none }
        .pe { all:unset;cursor:pointer;border:1.5px solid var(--bd,var(--gold));border-radius:8px;padding:2px 9px;font-size:.62rem;
          font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${tc};white-space:nowrap }
        .pe.on { background:var(--gold);color:#111 }
        .pe.run { animation:askp 1.2s ease-in-out infinite }
        .pb { padding:2px 14px 10px;display:flex;flex-direction:column;gap:7px }
        .pb[hidden] { display:none }
        .ps { display:flex;align-items:center;gap:8px }
        .ps b { width:40px;flex:none;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase }
        .ps span { color:var(--gold);font-weight:700 }
        .pi { box-sizing:border-box;flex:1;min-width:0;font:inherit;font-size:.82rem;font-weight:600;color:${tc};background:transparent;
          border:1.5px solid var(--bd,var(--gold));border-radius:8px;padding:3px 6px;color-scheme:${dark ? "dark" : "light"} }
        .pr { display:flex;align-items:center;justify-content:space-between;gap:8px }
        .pr i { font-style:normal;font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase }
        .pse { box-sizing:border-box;min-width:0;max-width:62%;font:inherit;font-size:.78rem;font-weight:600;color:${tc};background:transparent;
          border:1.5px solid var(--bd,var(--gold));border-radius:8px;padding:3px 6px;color-scheme:${dark ? "dark" : "light"} }
        .pse option { color:#111;background:#fff }
        .pr div { display:flex;align-items:center;gap:6px }
        .pm { all:unset;cursor:pointer;box-sizing:border-box;width:28px;height:24px;display:flex;align-items:center;justify-content:center;
          border:1.5px solid var(--bd,var(--gold));border-radius:7px;color:var(--gold);font-weight:800;font-size:1rem;line-height:1 }
        .pwn { font-size:.62rem;line-height:1.45;border:1.5px solid #e5484d;border-radius:8px;padding:5px 8px;
          background:color-mix(in srgb,#e5484d 12%,transparent);color:${tc} }
        .pwn[hidden] { display:none }
        .pr em { font-style:normal;font-weight:700;font-size:.86rem;min-width:64px;text-align:center }
        .ctl.inhead { padding:0;border:0;flex:1;justify-content:center;gap:5px;min-width:0 }
        .inhead .cb { flex:none;padding:1px 7px;font-size:.56rem;gap:3px;border-radius:6px }
        .inhead .cb ha-icon { --mdc-icon-size:13px }
        .cb { all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:5px;
          border:1.5px solid var(--bd,var(--gold));border-radius:8px;padding:4px 8px;font-size:.68rem;font-weight:700;letter-spacing:.06em;
          text-transform:uppercase;white-space:nowrap;color:${tc};transition:background .2s,color .2s }
        .cb ha-icon { --mdc-icon-size:18px;color:var(--gold) }
        .cb.on { background:var(--gold);color:#111 }
        .cb.on ha-icon { color:#111 }
        .cb.ask { border-style:dashed;animation:askp 1s ease-in-out infinite }
        .cb.off { opacity:.4;pointer-events:none }
        @keyframes askp { 50% { opacity:.55 } }
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
        .head { display:flex;justify-content:space-between;align-items:center;gap:6px }
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
        .ring { --rs:clamp(42px,11cqw,60px);width:var(--rs);height:var(--rs);flex:none;border-radius:50%;border:3px solid var(--bd,var(--gold));
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
          box-shadow:0 0 10px color-mix(in srgb,var(--gold) 30%,transparent);color:var(--gold) }
        .ring span { color:${tc} }
        .ring ha-icon { --mdc-icon-size:calc(var(--rs)*.4) }
        .ring span { font-size:calc(var(--rs)*.2);font-weight:700;letter-spacing:.06em }
        .chips { display:flex;flex-direction:column;gap:6px;align-items:stretch }
        .chip { border:1.5px solid var(--bd,var(--gold));color:${tc};border-radius:8px;display:flex;align-items:center;justify-content:center;gap:3px;
          padding:3px 8px;font-size:.72rem;font-weight:600;white-space:nowrap }
        .chip ha-icon { --mdc-icon-size:16px;color:var(--gold) }
        .chip.mode { font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700;padding:2px 8px }
        svg.spark { position:absolute;left:0;right:0;bottom:34px;width:100%;height:46px;z-index:0;pointer-events:none }
        .foot { display:flex;justify-content:space-between;gap:6px;margin-top:auto;position:relative;z-index:1;padding-top:52px }
        .fo { display:flex;align-items:center;gap:5px;font-size:.9rem;white-space:nowrap }
        .fo i { font-style:normal;font-size:.6rem;font-weight:700;border:1.5px solid var(--bd,var(--gold));
          border-radius:5px;padding:1px 4px }
        .fo b { font-weight:700 }
        @container (max-width: 420px) {
          .inhead .cb span { display:none }
          .inhead .cb.ask span { display:inline }
          .inhead .cb { padding:2px 8px }
          .inhead .cb ha-icon { --mdc-icon-size:16px }
        }
        @container (max-width: 380px) {
          .ringed .wrap { min-height:190px }
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
      <ha-card class="${c.show_ring ? "ringed" : ""}">
        ${plTop ? plHtml : ""}
        <div class="wrap">
          <div class="side">
            <div class="eta"${c.show_eta === false ? ' style="visibility:hidden"' : ""}><ha-icon icon="mdi:clock-outline"></ha-icon><span class="etav">--:--</span></div>
            <div class="mid"><div class="vt"${c.show_label === false ? ' style="display:none"' : ""}>—</div><div class="bar"><i></i></div></div>
            <div class="pw"><ha-icon icon="mdi:flash"></ha-icon><span class="pwv">0W</span></div>
          </div>
          <div class="main">
            <div class="head"><div class="name">${this._esc(c.name)}</div>${ctlBottom ? "" : ctl}<div class="brand">${this._esc(c.brand)}</div></div>
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
        ${ctlBottom ? ctl : ""}
        ${plTop ? "" : plHtml}
        ${linksCfg.length ? `${c.link_collapsible === false ? "" : `<div class="tg"><button class="tb" aria-label="Afficher ou masquer le Link"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>`}
        <div class="lp" hidden></div>` : ""}
      </ha-card>`;
    const r = this.shadowRoot;
    this._e = {
      card: r.querySelector("ha-card"), side: r.querySelector(".side"), barBox: r.querySelector(".bar"),
      etav: r.querySelector(".etav"), eta: r.querySelector(".eta"), vt: r.querySelector(".vt"), bar: r.querySelector(".bar i"),
      pwv: r.querySelector(".pwv"), socv: r.querySelector(".socv"), kwh: r.querySelector(".kwh"),
      ring: r.querySelector(".ring"), ringIcon: r.querySelector(".ring ha-icon"), rl: r.querySelector(".rl"),
      mv: r.querySelector(".mv"), dv: r.querySelector(".dv"),
      pv: [...r.querySelectorAll(".pvv")], tv: [...r.querySelectorAll(".tv")], fv: [...r.querySelectorAll(".fv")],
      sa: r.querySelector(".sa"), sl: r.querySelector(".sl"), cb: [...r.querySelectorAll(".cb")],
    };
    this._armed = -1;
    this._e.cb.forEach((b, i) => b.addEventListener("click", () => {
      const o = c.controls[i];
      if (!this._hass || !o) return;
      if (o.confirm && this._armed !== i) {          // 1er appui : demande de confirmation (4 s)
        this._armed = i; this._paintControls();
        clearTimeout(this._armT);
        this._armT = setTimeout(() => { this._armed = -1; this._paintControls(); }, 4000);
        return;
      }
      clearTimeout(this._armT); this._armed = -1;
      this._hass.callService("homeassistant", "toggle", { entity_id: o.entity });
      this._paintControls();
    }));
    if (pl) {
      const pb = r.querySelector(".pb"), pt = r.querySelector(".pt");
      const key = "titan-plan-open:" + (c.name || "");
      let popen = false;
      try { popen = localStorage.getItem(key) === "1"; } catch (err) { /* ignore */ }
      const ap = () => { pb.hidden = !popen; pt.classList.toggle("open", popen); };
      pt.addEventListener("click", () => {
        popen = !popen; ap();
        try { localStorage.setItem(key, popen ? "1" : "0"); } catch (err) { /* ignore */ }
      });
      ap();
      const pe = r.querySelector(".pe");
      if (pe) pe.addEventListener("click", () => {
        if (this._hass) this._hass.callService("homeassistant", "toggle", { entity_id: pl.enable_entity });
      });
      r.querySelectorAll(".pi").forEach(inp => inp.addEventListener("change", () => {
        const id = inp.dataset.e, v = inp.value;
        if (!v || !this._hass) return;
        const dom = id.split(".")[0];
        if (dom === "input_datetime") this._hass.callService("input_datetime", "set_datetime", { entity_id: id, time: v + ":00" });
        else if (dom === "time") this._hass.callService("time", "set_value", { entity_id: id, time: v + ":00" });
      }));
      r.querySelectorAll(".pm").forEach(b => b.addEventListener("click", () => this._step(b.dataset.e, Number(b.dataset.d))));
      r.querySelectorAll(".pse").forEach(sel => sel.addEventListener("change", () => {
        if (!this._hass || !sel.value) return;
        const dom = sel.dataset.e.split(".")[0] === "input_select" ? "input_select" : "select";
        this._hass.callService(dom, "select_option", { entity_id: sel.dataset.e, option: sel.value });
      }));
    }
    this._lk = [];
    if (linksCfg.length) {
      const key = "titan-link-open:" + (c.name || "");
      const fixed = c.link_collapsible === false;   // pas de flèche : blocs toujours affichés
      let open = c.link_open === true;
      try { const v = localStorage.getItem(key); if (v !== null) open = v === "1"; } catch (err) { /* ignore */ }
      if (fixed) open = true;
      const lp = r.querySelector(".lp"), tb = r.querySelector(".tb");
      linksCfg.forEach(lc => {
        const lk = document.createElement("titan-link-card");
        lk.setConfig({ theme: c.theme, gold: c.gold, state_entity: c.state_entity, power_entity: c.power_entity,
          power_charge_positive: c.power_charge_positive, threshold: c.threshold, bar_colors: c.bar_colors, background: c.background, text_color: c.text_color, border_color: c.border_color, compact: c.link_compact, show_bar: c.link_show_bar,
          ...lc, brand: "", embedded: true });
        lp.append(lk); this._lk.push(lk);
      });
      const apply = () => { lp.hidden = !open; if (tb) tb.classList.toggle("open", open); };
      this._applyLink = o => { if (!fixed) { open = o; apply(); } };
      if (tb) tb.addEventListener("click", () => {
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

  _step(id, dir) {
    const st = this._hass && this._hass.states[id];
    if (!st) return;
    const a = st.attributes || {}, cur = parseFloat(st.state);
    if (!Number.isFinite(cur)) return;
    const step = Number(a.step) || 1, min = Number.isFinite(Number(a.min)) ? Number(a.min) : 0, max = Number.isFinite(Number(a.max)) ? Number(a.max) : 100;
    const v = Math.max(min, Math.min(max, Math.round((cur + dir * step) / step) * step));
    if (v === cur) return;
    const dom = id.split(".")[0];
    this._hass.callService(dom === "input_number" ? "input_number" : "number", "set_value", { entity_id: id, value: v });
  }

  _paintPlan() {
    const c = this._c, pl = c.planning, r = this.shadowRoot;
    if (!pl || typeof pl !== "object") return;
    const pe = r.querySelector(".pe");
    if (pe) {
      const on = this._txt(pl.enable_entity) === "on", run = pl.active_entity && this._txt(pl.active_entity) === "on";
      pe.classList.toggle("on", on);
      pe.classList.toggle("run", !!(on && run));
      pe.textContent = on ? (run ? "En cours" : "Actif") : "Désactivé";
    }
    r.querySelectorAll(".pi").forEach(inp => {
      const m = /^(\d\d:\d\d)/.exec(this._txt(inp.dataset.e));
      if (m && r.activeElement !== inp && inp.value !== m[1]) inp.value = m[1];
    });
    r.querySelectorAll(".pse").forEach(sel => {
      const st = this._hass && this._hass.states[sel.dataset.e];
      const opts = st && st.attributes && Array.isArray(st.attributes.options) ? st.attributes.options : [];
      if (opts.join("|") !== [...sel.options].map(o => o.value).join("|")) {
        sel.innerHTML = opts.map(o => `<option value="${this._esc(o)}">${this._esc(o)}</option>`).join("");
      }
      if (st && r.activeElement !== sel && sel.value !== st.state) sel.value = st.state;
    });
    const wn = r.querySelector(".pwn");
    if (wn) {
      const lim = Number.isFinite(Number(pl.power_warn)) ? Number(pl.power_warn) : 800;
      const pv = this._num(pl.power_entity);
      wn.hidden = !(Number.isFinite(pv) && pv > lim);
    }
    r.querySelectorAll(".pr em").forEach(em => {
      const v = this._num(em.dataset.e);
      em.textContent = Number.isFinite(v) ? this._fmt(v, 0) + " " + em.dataset.u : "—";
    });
  }

  _paintControls() {
    const c = this._c, e = this._e;
    if (!e || !e.cb) return;
    c.controls.forEach((o, i) => {
      const b = e.cb[i]; if (!b) return;
      const st = this._txt(o.entity), ok = st && st !== "unavailable" && st !== "unknown";
      const name = o.label || ((this._hass && this._hass.states[o.entity] || { attributes: {} }).attributes.friendly_name) || o.entity;
      b.classList.toggle("on", st === "on");
      b.classList.toggle("off", !ok);
      b.classList.toggle("ask", this._armed === i);
      b.setAttribute("aria-pressed", st === "on" ? "true" : "false");
      b.querySelector("span").textContent = this._armed === i ? (c.controls_position === "bottom" ? "Confirmer ?" : "Sûr ?") : name;
    });
  }

  _update() {
    const c = this._c, e = this._e;
    this._paintControls();
    this._paintPlan();
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
    // batterie pleine (100 %) et pas en décharge : barre verte fixe, sans balayage lumineux
    const full = Number.isFinite(soc) && soc >= 99.5 && kind !== "discharge";
    e.card.style.setProperty("--bc", low ? bcs.low : full ? (bcs.full || bcs.charge) : bcs[kind]);
    e.barBox.className = "bar " + (full ? "static full" : kind);
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
    // masquée si show_eta est false, ou en veille (sauf eta_hide_idle: false) ; la place reste réservée
    if (e.eta) e.eta.style.visibility = (c.show_eta === false || (c.eta_hide_idle !== false && kind === "static")) ? "hidden" : "";

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

    (this._lk || []).forEach(l => { l.hass = this._hass; });
    if (this._lk && this._lk.length && c.link_toggle_entity && this._hass.states[c.link_toggle_entity]) {
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
    const tc = tscCol(c.text_color) || (dark ? "#f1f5f2" : light ? "#111" : "var(--primary-text-color)");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block }
        ha-card { display:flex;flex-direction:row;min-height:190px;box-sizing:border-box;
          overflow:hidden;border-radius:${c.embedded ? "0" : "16px"};padding:0;container-type:inline-size;
          ${c.embedded ? "box-shadow:none;border:none;" : ""}
          ${tscBg(c, dark, light)} }
        .sd { width:56px;flex:none;background:linear-gradient(180deg,color-mix(in srgb,var(--gold) 82%,#fff),var(--gold)) }
        .bd { flex:1;min-width:0;padding:12px 14px 10px;display:flex;flex-direction:column }
        .head { display:flex;justify-content:space-between;align-items:baseline }
        .name { font-weight:800;letter-spacing:.12em;font-size:.95rem;text-transform:uppercase }
        .brand { font-weight:800;letter-spacing:.16em;font-size:.8rem;color:var(--gold) }
        .row { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:6px }
        .soc { font-size:3rem;font-weight:800;line-height:1;color:var(--pc,var(--gold));display:flex;align-items:baseline }
        .soc small { font-size:1.1rem;font-weight:600;margin-left:3px }
        .chips { display:flex;flex-direction:column;gap:6px;align-items:stretch;margin-top:16px;min-width:104px }
        .chip { display:flex;align-items:center;justify-content:center;gap:3px;border:1.5px solid var(--bd,var(--gold));color:${tc};
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
        /* option compact : bloc Link réduit (une ligne : % + pastilles, barre fine) */
        .compact { min-height:0 }
        .compact .sd { width:12px }
        .compact .bd { padding:7px 12px 8px }
        .compact .row { align-items:center;margin-top:2px;gap:8px }
        .compact .soc { font-size:1.7rem }
        .compact .soc small { font-size:.8rem }
        .compact .chips { flex-direction:row;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px;margin-top:0;min-width:0 }
        .compact .chip { padding:1px 6px;font-size:.68rem }
        .compact .chip ha-icon { --mdc-icon-size:14px }
        .compact .track { margin-top:8px;height:6px }
        .nobar .track { display:none }
        .nobar.compact .bd { padding-bottom:6px }
      </style>
      <ha-card class="${c.compact ? "compact" : ""}${c.show_bar === false ? " nobar" : ""}">
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
    const full = Number.isFinite(soc) && soc >= 99.5 && kind !== "discharge";
    const bcs = c.theme === "black"
      ? { charge: "#a6ffc4", ...clean(c.bar_colors_dark) }
      : c.bar_colors;
    e.card.style.setProperty("--bc", low ? c.bar_colors.low : full ? (bcs.full || bcs.charge || c.bar_colors.charge) : c.bar_colors[kind]);
    e.card.style.setProperty("--pc", low ? c.bar_colors.low : c.gold);
    e.track.className = "track " + (full ? "static full" : kind);
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

/* ===== Éditeur visuel (interface de configuration de la carte) ===== */
const TSC_N = { link: 5, controls: 6, slots: 4 };
const TSC_LABELS = {
  name: "Nom", brand: "Texte en haut à droite (marque)", palette: "Style", gold: "Couleur d'accent (optionnel)", background: "Couleur de fond (optionnel)", text_color: "Couleur des textes (optionnel)", border_color: "Couleur des cadres (optionnel)",
  show_ring: "Cercle d'état à droite", show_eta: "Heure estimée (horloge en haut à gauche)", eta_hide_idle: "Masquer l'heure automatiquement en veille", show_label: "Texte vertical à gauche (VEILLE, CHARGE…)", link_compact: "Blocs Link compacts (plus petits)", link_collapsible: "Blocs Link repliables (flèche)", link_show_bar: "Barre de charge/décharge dans les blocs Link", show_bar: "Barre de charge/décharge", link_open: "Blocs Link ouverts au départ", show_temps: "Pastilles de température", power_charge_positive: "Puissance positive = charge",
  capacity_kwh: "Capacité (kWh)", history_hours: "Historique de la courbe (heures)", threshold: "Seuil de veille (W)",
  soc_entity: "SOC de la batterie (obligatoire)", power_entity: "Puissance", state_entity: "État (Charging, Static…)",
  floor_entity: "SOC minimum (plancher)", mode_entity: "Mode de travail", days_entity: "Jours depuis la dernière charge complète",
  stored_entity: "Énergie stockée (kWh)", history_entity: "Entité de l'historique (optionnel)",
  controls_position: "Position des boutons de commande",
  pl_name: "Titre de la section", pl_enable: "Interrupteur du planning", pl_active: "Indicateur « En cours » (optionnel)",
  pl_power: "Puissance de recharge", pl_soc: "SOC cible", pl_warn: "Seuil d'avertissement (W)",
  pl_position: "Position de la section", pl_end: "Action de fin (optionnel)",
  lk_soc: "SOC", lk_temp: "Température", lk_cycles: "Cycles", lk_name: "Nom",
};
const TSC_HELP = {
  background: "Exemple : #EDE8D0 (beige). Vide = fond d'origine",
  text_color: "Exemple : #333333. Vide = couleur d'origine",
  border_color: "Cadres des pastilles, du cercle et des boutons. Exemple : #39ff14. Vide = couleur d'accent",
  soc_entity: "Exemple : …_pile_average", power_entity: "Exemple : …_ac_input_and_output (positif = charge)",
  state_entity: "Exemple : …_battery_state", mode_entity: "Exemple : …_working_mode",
  floor_entity: "Exemple : cluster_soc_security_esp", days_entity: "Exemple : …_jours_depuis_charge_complete",
  ct0_entity: "Exemple : …_leds_control", ct1_entity: "Exemple : …_off_grid", ct_entity: "Exemple : …_leds_control, …_off_grid",
  lk_soc: "Exemple : …_link_soc", lk_temp: "Exemple : …_link_temperature", lk_cycles: "Exemple : …_link_cycles",
  pl_enable: "Exemple : planning_recharge_actif", pl_active: "Exemple : planning_recharge_en_cours",
  pl_power: "Exemple : planning_recharge_puissance", pl_soc: "Exemple : planning_recharge_soc_cible",
  sl_start: "Exemple : planning_recharge_debut_nuit", sl_end: "Exemple : planning_recharge_fin_nuit",
};
// entités déduites du SOC : préfixe + suffixe (intégration izypower_titan)
const TSC_AUTO = { power_entity: "ac_input_and_output", state_entity: "battery_state", mode_entity: "working_mode" };
const TSC_FLOOR = "number.cluster_soc_security_esp";
const TSC_POS = [{ value: "bottom", label: "En dessous de la Titan" }, { value: "top", label: "Au-dessus de la Titan" }];
const tscEnt = (name, domain) => ({ name, selector: { entity: domain ? { domain } : {} } });
const tscTxt = name => ({ name, selector: { text: {} } });
const tscBool = name => ({ name, selector: { boolean: {} } });
const tscNum = (name, step) => ({ name, selector: { number: { mode: "box", step: step || 1 } } });

class TitanStatusCardEditor extends HTMLElement {
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }

  // --- passage config <-> champs à plat du formulaire
  _flatten(c) {
    const d = { ...c };
    const links = Array.isArray(c.link) ? c.link : (c.link && typeof c.link === "object" ? [c.link] : []);
    for (let i = 0; i < TSC_N.link; i++) {
      const o = links[i] || {};
      d["lk" + i + "_name"] = o.name; d["lk" + i + "_soc"] = o.soc_entity; d["lk" + i + "_temp"] = o.temp_entity; d["lk" + i + "_cycles"] = o.cycles_entity;
    }
    const ct = Array.isArray(c.controls) ? c.controls : [];
    for (let i = 0; i < TSC_N.controls; i++) {
      const o = ct[i] || {};
      d["ct" + i + "_entity"] = o.entity; d["ct" + i + "_label"] = o.label; d["ct" + i + "_icon"] = o.icon; d["ct" + i + "_confirm"] = !!o.confirm;
    }
    const p = c.planning && typeof c.planning === "object" ? c.planning : {};
    d.pl_name = p.name; d.pl_enable = p.enable_entity; d.pl_active = p.active_entity; d.pl_power = p.power_entity; d.pl_soc = p.soc_entity;
    d.pl_warn = p.power_warn; d.pl_position = p.position === "top" ? "top" : "bottom"; d.pl_end = p.end_entity;
    const sl = Array.isArray(p.slots) ? p.slots : [];
    for (let i = 0; i < TSC_N.slots; i++) {
      const o = sl[i] || {};
      d["sl" + i + "_label"] = o.label; d["sl" + i + "_start"] = o.start; d["sl" + i + "_end"] = o.end;
    }
    d.controls_position = c.controls_position === "bottom" ? "bottom" : "top";
    d.palette = c.palette === "green" ? "green" : "gold";
    if (c.power_charge_positive === undefined) d.power_charge_positive = true;
    d.show_eta = c.show_eta !== false;
    d.eta_hide_idle = c.eta_hide_idle !== false;
    d.show_label = c.show_label !== false;
    d.link_compact = c.link_compact === true;
    d.link_collapsible = c.link_collapsible !== false;
    d.link_show_bar = c.link_show_bar !== false;
    d.link_open = c.link_open === true;
    return d;
  }
  _unflatten(d, base) {
    const out = { ...base };
    const has = v => v !== undefined && v !== null && v !== "";
    const put = (k, v) => { if (has(v)) out[k] = v; else delete out[k]; };
    ["name", "brand", "gold", "background", "text_color", "border_color", "soc_entity", "power_entity", "state_entity", "floor_entity", "mode_entity", "days_entity", "stored_entity", "history_entity"]
      .forEach(k => put(k, d[k]));
    ["capacity_kwh", "history_hours", "threshold"].forEach(k => put(k, has(d[k]) ? Number(d[k]) : undefined));
    if (d.palette === "green") out.palette = "green"; else delete out.palette;
    if (d.show_ring) out.show_ring = true; else delete out.show_ring;
    if (d.show_temps) out.show_temps = true; else delete out.show_temps;
    if (d.show_eta === false) out.show_eta = false; else delete out.show_eta;
    if (d.eta_hide_idle === false) out.eta_hide_idle = false; else delete out.eta_hide_idle;
    if (d.show_label === false) out.show_label = false; else delete out.show_label;
    if (d.link_compact === true) out.link_compact = true; else delete out.link_compact;
    if (d.link_collapsible === false) out.link_collapsible = false; else delete out.link_collapsible;
    if (d.link_show_bar === false) out.link_show_bar = false; else delete out.link_show_bar;
    if (d.link_open === true) out.link_open = true; else delete out.link_open;
    if (d.power_charge_positive === false) out.power_charge_positive = false; else delete out.power_charge_positive;
    // Link : un objet s'il n'y en a qu'un, une liste sinon
    const links = [];
    for (let i = 0; i < TSC_N.link; i++) {
      const o = {};
      if (has(d["lk" + i + "_name"])) o.name = d["lk" + i + "_name"];
      if (has(d["lk" + i + "_soc"])) o.soc_entity = d["lk" + i + "_soc"];
      if (has(d["lk" + i + "_temp"])) o.temp_entity = d["lk" + i + "_temp"];
      if (has(d["lk" + i + "_cycles"])) o.cycles_entity = d["lk" + i + "_cycles"];
      const prev = (Array.isArray(base.link) ? base.link[i] : (i === 0 && base.link && typeof base.link === "object" ? base.link : null)) || {};
      if (Object.keys(o).length) links.push({ ...prev, ...o, ...(has(d["lk" + i + "_name"]) ? {} : { name: undefined }) });
    }
    links.forEach(o => { if (o.name === undefined) delete o.name; });
    if (!links.length) delete out.link; else out.link = links.length === 1 && !Array.isArray(base.link) ? links[0] : links;
    // Boutons de commande
    const ctl = [];
    for (let i = 0; i < TSC_N.controls; i++) {
      if (!has(d["ct" + i + "_entity"])) continue;
      const prev = (Array.isArray(base.controls) ? base.controls[i] : null) || {};
      const o = { ...prev, entity: d["ct" + i + "_entity"] };
      if (has(d["ct" + i + "_label"])) o.label = d["ct" + i + "_label"]; else delete o.label;
      if (has(d["ct" + i + "_icon"])) o.icon = d["ct" + i + "_icon"]; else delete o.icon;
      if (d["ct" + i + "_confirm"]) o.confirm = true; else delete o.confirm;
      ctl.push(o);
    }
    if (ctl.length) out.controls = ctl; else delete out.controls;
    if (d.controls_position === "bottom") out.controls_position = "bottom"; else delete out.controls_position;
    // Planning (présent seulement si l'interrupteur est renseigné)
    if (has(d.pl_enable)) {
      const p = { ...(base.planning && typeof base.planning === "object" ? base.planning : {}) };
      const q = (k, v) => { if (has(v)) p[k] = v; else delete p[k]; };
      q("name", d.pl_name); p.enable_entity = d.pl_enable; q("active_entity", d.pl_active);
      q("power_entity", d.pl_power); q("soc_entity", d.pl_soc); q("end_entity", d.pl_end);
      q("power_warn", has(d.pl_warn) ? Number(d.pl_warn) : undefined);
      if (d.pl_position === "top") p.position = "top"; else delete p.position;
      const slots = [];
      for (let i = 0; i < TSC_N.slots; i++) {
        if (!has(d["sl" + i + "_start"]) || !has(d["sl" + i + "_end"])) continue;
        const prev = (Array.isArray(p.slots) ? p.slots[i] : null) || {};
        const o = { ...prev, start: d["sl" + i + "_start"], end: d["sl" + i + "_end"] };
        if (has(d["sl" + i + "_label"])) o.label = d["sl" + i + "_label"]; else delete o.label;
        slots.push(o);
      }
      if (slots.length) p.slots = slots; else delete p.slots;
      out.planning = p;
    } else delete out.planning;
    return out;
  }

  _schema() {
    const T = "input_datetime", S = ["switch", "input_boolean", "light"];
    const links = [], ctls = [], slots = [];
    for (let i = 0; i < TSC_N.link; i++) links.push({ type: "expandable", name: "", title: "Link " + (i + 1), schema: [
      tscTxt("lk" + i + "_name"), tscEnt("lk" + i + "_soc"), tscEnt("lk" + i + "_temp"), tscEnt("lk" + i + "_cycles")] });
    for (let i = 0; i < TSC_N.controls; i++) ctls.push({ type: "expandable", name: "", title: "Bouton " + (i + 1), schema: [
      tscEnt("ct" + i + "_entity", S), tscTxt("ct" + i + "_label"), { name: "ct" + i + "_icon", selector: { icon: {} } }, tscBool("ct" + i + "_confirm")] });
    for (let i = 0; i < TSC_N.slots; i++) slots.push({ type: "expandable", name: "", title: "Plage " + (i + 1), expanded: i < 2, schema: [
      tscTxt("sl" + i + "_label"), tscEnt("sl" + i + "_start"), tscEnt("sl" + i + "_end")] });
    return [
      { type: "expandable", name: "", title: "Général", icon: "mdi:cog", expanded: true, schema: [
        tscTxt("name"), tscTxt("brand"), tscTxt("background"), tscTxt("text_color"), tscTxt("border_color"),
        { name: "palette", selector: { select: { mode: "dropdown", options: [{ value: "gold", label: "Blanc et doré" }, { value: "green", label: "Noir et vert" }] } } },
        tscBool("show_ring"), tscBool("show_eta"), tscBool("eta_hide_idle"), tscBool("show_label"), tscBool("link_compact"), tscBool("link_collapsible"), tscBool("link_show_bar"), tscBool("link_open"), tscBool("show_temps"), tscBool("power_charge_positive"),
        { type: "grid", name: "", schema: [tscNum("capacity_kwh", 0.01), tscNum("history_hours"), tscNum("threshold")] }] },
      { type: "expandable", name: "", title: "Entités", icon: "mdi:flash", expanded: true, schema: [
        tscEnt("soc_entity"), tscEnt("power_entity"), tscEnt("state_entity"), tscEnt("floor_entity"),
        tscEnt("mode_entity"), tscEnt("days_entity"), tscEnt("stored_entity"), tscEnt("history_entity")] },
      { type: "expandable", name: "", title: "Boutons de commande (LED, Off-grid…)", icon: "mdi:toggle-switch", schema: [
        { name: "controls_position", selector: { select: { mode: "dropdown", options: [{ value: "top", label: "Dans l'en-tête" }, { value: "bottom", label: "Sous la carte" }] } } },
        ...ctls] },
      { type: "expandable", name: "", title: "Planning de recharge", icon: "mdi:calendar-clock", schema: [
        tscEnt("pl_enable", "input_boolean"), tscTxt("pl_name"), tscEnt("pl_active", "input_boolean"),
        ...slots, tscEnt("pl_power"), tscEnt("pl_soc"), tscNum("pl_warn"), tscEnt("pl_end", "input_select"),
        { name: "pl_position", selector: { select: { mode: "dropdown", options: TSC_POS } } }] },
      { type: "expandable", name: "", title: "Modules Link", icon: "mdi:battery-plus", schema: links },
    ];
  }

  async _render() {
    if (!this._wrap) {
      this._wrap = document.createElement("div");
      this.appendChild(this._wrap);
      try { // charge les sélecteurs d'entités de Home Assistant si besoin
        if (!customElements.get("ha-selector") && window.loadCardHelpers) {
          const h = await window.loadCardHelpers();
          const c = await h.createCardElement({ type: "entities", entities: [] });
          if (c && c.constructor && c.constructor.getConfigElement) await c.constructor.getConfigElement();
        }
      } catch (e) { /* ignore */ }
      this._form = document.createElement("ha-form");
      this._form.computeLabel = s => TSC_LABELS[s.name] || TSC_LABELS[(s.name || "").replace(/^(lk|ct|sl)\d_/, "")] || ({
        confirm: "Confirmer avant d'agir", label: "Libellé", entity: "Entité", icon: "Icône", start: "Début", end: "Fin", soc: "SOC", temp: "Température", cycles: "Cycles" }[(s.name || "").replace(/^(lk|ct|sl)\d_/, "")]) || s.name;
      this._form.computeHelper = s => TSC_HELP[s.name] || TSC_HELP[(s.name || "").replace(/^(lk|sl)\d_/, "$1_").replace(/^ct\d_/, "ct_")] || "";
      this._form.addEventListener("value-changed", ev => {
        ev.stopPropagation();
        const val = { ...ev.detail.value };
        const old = this._flatten(this._config || {}); let filled = false;
        const st = this._hass ? this._hass.states : null;
        const fill = (k, id) => { if (!val[k] && st && st[id]) { val[k] = id; filled = true; } };
        const m = st && val.soc_entity && val.soc_entity !== old.soc_entity ? /^sensor\.(.*_)pile_average$/.exec(val.soc_entity) : null;
        if (m) {
          Object.keys(TSC_AUTO).forEach(k => fill(k, "sensor." + m[1] + TSC_AUTO[k]));
          fill("floor_entity", TSC_FLOOR);
        }
        for (let i = 0; i < TSC_N.link; i++) {
          const v = val["lk" + i + "_soc"], l = v && v !== old["lk" + i + "_soc"] ? /^sensor\.(.*_link_)soc$/.exec(v) : null;
          if (l) { fill("lk" + i + "_temp", "sensor." + l[1] + "temperature"); fill("lk" + i + "_cycles", "sensor." + l[1] + "cycles"); }
        }
        const cfg = this._unflatten(val, this._config);
        this._config = cfg;
        if (filled) this._form.data = this._flatten(cfg);
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this._wrap.appendChild(this._form);
      if (this._hass) this._form.hass = this._hass;
    }
    if (!this._form) return; // premier rendu encore en cours : il utilisera la config à jour
    this._form.schema = this._schema();
    this._form.data = this._flatten(this._config);
  }
}

class TitanLinkCardEditor extends TitanStatusCardEditor {
  _flatten(c) { return { ...c, compact: c.compact === true, show_bar: c.show_bar !== false }; }
  _unflatten(d, base) {
    const out = { ...base };
    ["name", "soc_entity", "temp_entity", "cycles_entity"].forEach(k => { if (d[k] !== undefined && d[k] !== null && d[k] !== "") out[k] = d[k]; else delete out[k]; });
    if (d.compact === true) out.compact = true; else delete out.compact;
    if (d.show_bar === false) out.show_bar = false; else delete out.show_bar;
    return out;
  }
  _schema() { return [tscTxt("name"), tscEnt("soc_entity"), tscEnt("temp_entity"), tscEnt("cycles_entity"), tscBool("compact"), tscBool("show_bar")]; }
}
TSC_LABELS.compact = "Affichage compact (bloc plus petit)"; TSC_LABELS.temp_entity = "Température"; TSC_LABELS.cycles_entity = "Cycles";

TitanStatusCard.getConfigElement = () => document.createElement("titan-status-card-editor");
TitanStatusCard.getStubConfig = (hass) => {
  const ids = hass && hass.states ? Object.keys(hass.states) : [];
  const pile = ids.find(i => /^sensor\..*_pile_average$/.test(i));
  if (pile) {
    const pre = pile.slice(0, -"pile_average".length), c = { soc_entity: pile, name: "Titan" };
    Object.keys(TSC_AUTO).forEach(k => { if (hass.states[pre + TSC_AUTO[k]]) c[k] = pre + TSC_AUTO[k]; });
    if (hass.states[TSC_FLOOR]) c.floor_entity = TSC_FLOOR;
    return c;
  }
  const soc = ids.find(i => /^sensor\..*(soc|battery)/i.test(i)) || ids.find(i => i.startsWith("sensor.")) || "";
  return { soc_entity: soc, name: "Titan" };
};
TitanLinkCard.getConfigElement = () => document.createElement("titan-link-card-editor");
TitanLinkCard.getStubConfig = TitanStatusCard.getStubConfig;
customElements.define("titan-status-card-editor", TitanStatusCardEditor);
customElements.define("titan-link-card-editor", TitanLinkCardEditor);

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
