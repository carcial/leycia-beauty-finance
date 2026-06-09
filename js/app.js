const LOYER_DEFAUT = Data.DEFAULT_RENT;
const FORMAT_CAD = (n) => `${Number(n || 0).toFixed(2).replace(".", ",")} $`;
const FORMAT_CAD_EXPENSE = (n) => `−${Number(n || 0).toFixed(2).replace(".", ",")} $`;
const TODAY = () => new Date().toISOString().slice(0, 10);
const MONTH_KEY = (d) => (d || "").slice(0, 7);
const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTH_LABEL = (key) => {
  if (!key) return "";
  const [y, m] = key.split("-");
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
};
const JOURS_COMPLETS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function formatDateFR(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return `${JOURS_COMPLETS[dt.getDay()]} ${parseInt(d, 10)} ${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
}
function formatHeureFR(heure) {
  if (!heure) return "—";
  const [h, min] = heure.split(":");
  return `${h}h${min || "00"}`;
}

let appReady = false;
let savedFocus = null;

const state = {
  tab: "tableau-bord",
  menu: false,
  toast: null,
  error: "",
  revenus: [],
  depenses: [],
  rdvs: [],
  selectedDate: null,
  loyer: LOYER_DEFAUT,
  loyerDraft: String(LOYER_DEFAUT),
  saving: false,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  showRdvModal: false,
  showClientForm: false,
  showDepForm: false,
  reportType: "currentMonth",
  clientForm: { date: TODAY(), client: "", telephone: "", genre: "Femme", montant: "", note: "" },
  depForm: { date: TODAY(), description: "", montant: "" },
  rdvForm: { date: TODAY(), heure: "10:00", client: "", telephone: "", genre: "Femme", style: "", montant: "", duree: "1h00", dureeCustom: "", note: "" }
};

function escapeHTML(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function parseMoney(v) {
  return parseFloat(String(v || "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
}
function fieldAttr(form, key) {
  return `data-field="${form}:${key}"`;
}

function captureFocus() {
  const el = document.activeElement;
  if (el && el.dataset && el.dataset.field) {
    savedFocus = { field: el.dataset.field, start: el.selectionStart, end: el.selectionEnd };
  }
}
function restoreFocus() {
  if (!savedFocus) return;
  const el = document.querySelector(`[data-field="${savedFocus.field}"]`);
  if (el) {
    el.focus();
    try {
      if (savedFocus.start != null) el.setSelectionRange(savedFocus.start, savedFocus.end);
    } catch (_) {}
  }
  savedFocus = null;
}

function notify(msg, ok = true) {
  state.toast = { msg, ok };
  render();
  setTimeout(() => {
    state.toast = null;
    render();
  }, 3000);
}

function applyData(data) {
  state.revenus = data.revenus;
  state.depenses = data.depenses;
  state.rdvs = data.rdvs;
  state.loyer = data.loyer;
  state.loyerDraft = String(data.loyer);
  state.calc = CalcPlatform.sync({
    revenus: state.revenus,
    depenses: state.depenses,
    rdvs: state.rdvs,
    loyer: state.loyer
  });
}

async function refreshData() {
  const data = await Data.loadAll();
  applyData(data);
}

function renderLoading(msg) {
  document.getElementById("root").innerHTML = `
    <div class="loading-screen">
      <img src="assets/logo.png?v=6" alt="Leycia beauty" style="max-width:200px;width:80%;height:auto;object-fit:contain">
      <div class="loading-msg">${escapeHTML(msg)}</div>
    </div>`;
}

function renderConfigError(msg) {
  const pagesHint =
    location.hostname.endsWith("github.io")
      ? `<br><br><b>GitHub Pages :</b> ouvrez l'URL avec le nom du dépôt, ex. <code>https://votre-user.github.io/leycia-beauty-finance/</code> (slash final). Vérifiez que <code>config.js</code> est bien poussé sur <code>master</code>.`
      : `<br><br><b>En local :</b> <code>cp .env.example .env</code> puis <code>node setup.mjs</code>.`;
  document.getElementById("root").innerHTML = `
    <div class="loading-screen">
      <div style="color:var(--danger);font-weight:800;margin-bottom:10px">Configuration Supabase manquante</div>
      <div style="font-size:13px;font-weight:500;max-width:520px;text-align:center;line-height:1.55">
        ${escapeHTML(msg)}
        ${pagesHint}
      </div>
    </div>`;
}

async function initApp() {
  renderLoading("Chargement…");
  try {
    Data.init();
    await refreshData();
    appReady = true;
    render();
  } catch (e) {
    console.error(e);
    renderConfigError(e.message || String(e));
  }
}

function calcSnap() {
  return state.calc || CalcPlatform.getSnapshot();
}
function pendingRdvs() {
  return calcSnap().pendingRdvs;
}
function activeRevenus() {
  return CalcPlatform.filterActive(state.revenus);
}
function activeDepenses() {
  return CalcPlatform.filterActive(state.depenses);
}

function setTab(id) {
  state.tab = id;
  state.menu = false;
  state.error = "";
  render();
}
function updateForm(form, key, val) {
  state[form][key] = val;
}
function updateFormAndRender(form, key, val) {
  state[form][key] = val;
  render();
}
function onRdvDureeChange(val) {
  state.rdvForm.duree = val;
  const wrap = document.getElementById("rdv-duree-custom-wrap");
  if (wrap) wrap.style.display = val === "custom" ? "" : "none";
}
function onRdvDateChange(val) {
  state.rdvForm.date = val;
  const banner = document.getElementById("rdv-date-banner-value");
  if (banner) banner.textContent = formatDateFR(val);
}

function openRdvModal(date) {
  state.selectedDate = date;
  state.rdvForm = { ...state.rdvForm, date };
  state.showRdvModal = true;
  state.error = "";
  render();
}
function closeModal() {
  state.showRdvModal = false;
  state.error = "";
  render();
}

async function addClient() {
  const f = state.clientForm;
  const name = (f.client || "").trim();
  const amount = parseMoney(f.montant);
  if (!name) {
    state.error = "Le nom ou l'identifiant du client est requis.";
    return render();
  }
  if (!f.date) {
    state.error = "La date est obligatoire.";
    return render();
  }
  if (amount <= 0) {
    state.error = "Veuillez saisir un montant valide.";
    return render();
  }
  state.saving = true;
  render();
  try {
    await Data.addRevenue({
      date: f.date,
      nom: name,
      telephone: f.telephone,
      genre: f.genre || "",
      montant: amount,
      note: f.note || ""
    });
    state.clientForm = { date: TODAY(), client: "", telephone: "", genre: "Femme", montant: "", note: "" };
    state.showClientForm = false;
    state.error = "";
    await refreshData();
    notify("Entrée client enregistrée.");
  } catch (e) {
    notify(e.message || "Erreur d'enregistrement.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function addDepense() {
  const f = state.depForm;
  const desc = (f.description || "").trim();
  const amount = parseMoney(f.montant);
  if (!desc) {
    state.error = "La description est requise.";
    return render();
  }
  if (!f.date) {
    state.error = "La date est obligatoire.";
    return render();
  }
  if (amount <= 0) {
    state.error = "Veuillez saisir un montant positif.";
    return render();
  }
  state.saving = true;
  render();
  try {
    await Data.addDepense({ date: f.date, description: desc, montant: amount });
    state.depForm = { date: TODAY(), description: "", montant: "" };
    state.showDepForm = false;
    state.error = "";
    await refreshData();
    notify("Dépense ajoutée.");
  } catch (e) {
    notify(e.message || "Erreur d'enregistrement.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function addRdv() {
  const f = state.rdvForm;
  const name = (f.client || "").trim();
  const amount = parseMoney(f.montant);
  if (!name) {
    state.error = "Le nom du client est obligatoire pour réserver.";
    return render();
  }
  if (!f.date) {
    state.error = "La date du rendez-vous doit être définie.";
    return render();
  }
  if (amount <= 0) {
    state.error = "Veuillez indiquer un prix estimé.";
    return render();
  }
  const dureeFinale = f.duree === "custom" ? f.dureeCustom || "Durée personnalisée" : f.duree;
  state.saving = true;
  render();
  try {
    await Data.addRdv({
      date: f.date,
      heure: f.heure || "10:00",
      nom: name,
      telephone: f.telephone,
      genre: f.genre || "",
      style: f.style || "",
      montant: amount,
      duree: dureeFinale,
      note: f.note || ""
    });
    state.rdvForm = {
      date: state.selectedDate || TODAY(),
      heure: "10:00",
      client: "",
      telephone: "",
      genre: "Femme",
      style: "",
      montant: "",
      duree: "1h00",
      dureeCustom: "",
      note: ""
    };
    state.showRdvModal = false;
    state.error = "";
    await refreshData();
    notify("Rendez-vous ajouté à l'agenda.");
  } catch (e) {
    notify(e.message || "Erreur d'enregistrement.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function completeRdvAndCash(id) {
  const r = state.rdvs.find((x) => String(x.id) === String(id));
  if (!CalcPlatform.canCompleteAndCash(r)) return;
  if (!confirm(`Terminer et encaisser ${FORMAT_CAD(r.montant)} pour ${CalcPlatform.rdvNom(r)} ?`)) return;
  state.saving = true;
  render();
  try {
    await Data.completeRdvAndCreateRevenue(r);
    await refreshData();
    notify("Rendez-vous terminé et revenu enregistré.");
  } catch (e) {
    notify(e.message || "Erreur.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function cancelRdv(id) {
  const r = state.rdvs.find((x) => String(x.id) === String(id));
  if (!CalcPlatform.canCancelRdv(r)) return;
  if (!confirm(`Annuler le rendez-vous de ${CalcPlatform.rdvNom(r)} ?`)) return;
  state.saving = true;
  render();
  try {
    await Data.softDeleteRdv(id);
    await refreshData();
    notify("Rendez-vous annulé.", false);
  } catch (e) {
    notify(e.message || "Erreur.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function deleteRevenu(id) {
  if (!confirm("Retirer cette entrée de la caisse ?\n\nElle disparaîtra des totaux du mois en cours, mais restera dans l'historique et les rapports cumulés.")) return;
  state.saving = true;
  render();
  try {
    await Data.softDeleteRevenue(id);
    await refreshData();
    notify("Entrée retirée de la caisse.");
  } catch (e) {
    notify(e.message || "Erreur.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function deleteDepense(id) {
  if (!confirm("Retirer cette dépense de la caisse ?\n\nElle disparaîtra des totaux du mois en cours, mais restera dans l'historique et les rapports cumulés.")) return;
  state.saving = true;
  render();
  try {
    await Data.softDeleteDepense(id);
    await refreshData();
    notify("Dépense retirée de la caisse.");
  } catch (e) {
    notify(e.message || "Erreur.", false);
  } finally {
    state.saving = false;
    render();
  }
}

async function updateRent() {
  const result = CalcPlatform.setLoyer(state.loyerDraft);
  if (!result.ok) {
    state.error = "Veuillez entrer un montant de loyer valide.";
    return render();
  }
  state.saving = true;
  render();
  try {
    await Data.updateRent(result.loyer);
    state.loyer = result.loyer;
    state.loyerDraft = String(result.loyer);
    state.error = "";
    await refreshData();
    notify("Loyer mis à jour.");
  } catch (e) {
    notify(e.message || "Erreur.", false);
  } finally {
    state.saving = false;
    render();
  }
}

function changeMonth(delta) {
  state.selectedDate = null;
  let m = state.calMonth + delta;
  if (m < 0) {
    m = 11;
    state.calYear--;
  }
  if (m > 11) {
    m = 0;
    state.calYear++;
  }
  state.calMonth = m;
  render();
}
function selectDateFromCalendar(date) {
  state.selectedDate = state.selectedDate === date ? null : date;
  render();
}

function reportData() {
  const r = Data.generateReportData(state.reportType, {
    revenus: state.revenus,
    depenses: state.depenses,
    rdvs: state.rdvs,
    loyer: state.loyer
  });
  return {
    title: r.title.replace(MONTH_KEY(TODAY()), MONTH_LABEL(MONTH_KEY(TODAY()))),
    revenus: r.revenus,
    depenses: r.depenses,
    totalRev: r.totalRev,
    totalDep: r.totalDep,
    totalRent: r.totalRent,
    rentMonths: r.rentMonths,
    totalProfit: r.totalProfit,
    monthlyBreakdown: r.monthlyBreakdown
  };
}

function exportWord() {
  const data = reportData();
  let body = "";
  data.monthlyBreakdown
    .slice()
    .reverse()
    .forEach((m) => {
      const rs = m.revenus;
      const ds = m.depenses;
      body += `<h2>${MONTH_LABEL(m.monthKey)}</h2><div class="summary"><span>Revenus: <b>${FORMAT_CAD(m.revenusTotal)}</b></span><span>Dépenses: <b>${FORMAT_CAD(m.depensesTotal)}</b></span><span>Loyer: <b>${FORMAT_CAD_EXPENSE(m.loyer)}</b></span><span>Bénéfice: <b>${FORMAT_CAD(m.benefice)}</b></span></div>`;
      if (rs.length) {
        body += `<h3>Revenus clients</h3><table><tr><th>Date</th><th>Client</th><th>Téléphone</th><th>Genre</th><th>Note</th><th>Montant</th><th>Statut</th></tr>${rs.map((rv) => `<tr><td>${rv.date}</td><td>${escapeHTML(CalcPlatform.revNom(rv))}</td><td>${escapeHTML(CalcPlatform.revTel(rv) || "—")}</td><td>${escapeHTML(CalcPlatform.revGenre(rv) || "")}</td><td>${escapeHTML(rv.note || "")}</td><td>${FORMAT_CAD(rv.montant)}</td><td>${rv.deleted_at ? "Retiré" : "Actif"}</td></tr>`).join("")}</table>`;
      }
      if (ds.length) {
        body += `<h3>Dépenses</h3><table><tr><th>Date</th><th>Description</th><th>Montant</th><th>Statut</th></tr>${ds.map((d) => `<tr><td>${d.date}</td><td>${escapeHTML(d.description)}</td><td>${FORMAT_CAD(d.montant)}</td><td>${d.deleted_at ? "Retiré" : "Actif"}</td></tr>`).join("")}</table>`;
      }
    });
  const doc = `<html><head><meta charset="utf-8"><style>body{font-family:Segoe UI,Arial,sans-serif;margin:40px;color:#334155;background:#fff}h1{text-align:center;color:#5B21B6}h2{color:#5B21B6;border-left:4px solid #6D28D9;padding-left:10px;margin-top:30px}h3{font-size:13px;text-transform:uppercase;color:#64748b}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th{background:#F5F3FF;color:#5B21B6;padding:8px;text-align:left;border-bottom:2px solid #E5E7EB}td{padding:8px;border-bottom:1px solid #F3F4F6}.summary{display:flex;gap:16px;flex-wrap:wrap;background:#F5F3FF;border:1px solid #E5E7EB;padding:10px;border-radius:6px}.total{background:#5B21B6;color:#fff;padding:20px;border-radius:8px;margin-top:35px}</style></head><body><h1>Leycia beauty — ${data.title}</h1><p style="text-align:center;color:#64748b">Généré le ${new Date().toLocaleDateString("fr-CA")} · Loyer : ${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())}/mois</p>${body || "<p>Aucune donnée.</p>"}<div class="total"><h2 style="color:white;border:0;padding:0">Récapitulatif</h2><p>Total revenus : <b>${FORMAT_CAD(data.totalRev)}</b></p><p>Total dépenses : <b>${FORMAT_CAD(data.totalDep)}</b></p><p>Total loyer (${data.rentMonths} mois) : <b>${FORMAT_CAD_EXPENSE(data.totalRent)}</b></p><p><b>Bénéfice net : ${FORMAT_CAD(data.totalProfit)}</b></p></div></body></html>`;
  const blob = new Blob([doc], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rapport_salon_${state.reportType}_${TODAY()}.doc`;
  a.click();
}

function render() {
  if (!appReady) return;
  captureFocus();
  document.getElementById("root").innerHTML = `
    ${state.toast ? `<div class="toast ${state.toast.ok ? "" : "error"}">${escapeHTML(state.toast.msg)}</div>` : ""}
    <div class="mobile-bar"><div class="mobile-brand"><img src="assets/logo.png?v=6" alt="Leycia beauty"><span class="mobile-brand-name">Mon activité</span></div><button class="menu-btn" onclick="state.menu=!state.menu;render()">${state.menu ? "×" : "☰"}</button></div>
    <div class="overlay ${state.menu ? "show" : ""}" onclick="state.menu=false;render()"></div>
    ${state.showRdvModal ? rdvModal() : ""}
    <div class="app">
      <aside class="sidebar ${state.menu ? "open" : ""}">
        <div class="brand"><div class="brand-logo-wrap"><img class="brand-logo" src="assets/logo.png?v=6" alt="Leycia beauty"></div><span class="brand-tagline">Mon activité</span></div>
        <nav class="nav">${navHTML()}</nav>
        <div class="sidebar-footer">🏠 Frais de chaise fixes :<br><b>${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())} / mois</b></div>
      </aside>
      <main>${page()}</main>
    </div>`;
  restoreFocus();
}

function navHTML() {
  const badge = pendingRdvs().length;
  const items = [
    ["tableau-bord", "▦", "Tableau de bord"],
    ["rdv-agenda", "♙", "Agenda & RDV", badge],
    ["clients-liste", "$", "Entrées Clients"],
    ["depenses-liste", "▣", "Dépenses Salon"],
    ["rapport-word", "▤", "Export Word"]
  ];
  return items
    .map(([id, ic, lbl, b]) => `<button class="${state.tab === id ? "active" : ""}" onclick="setTab('${id}')"><span class="nav-icon">${ic}</span><span>${lbl}</span>${b ? `<span class="badge">${b}</span>` : ""}</button>`)
    .join("");
}

function page() {
  if (state.tab === "tableau-bord") return dashboard();
  if (state.tab === "rdv-agenda") return agenda();
  if (state.tab === "clients-liste") return clientsPage();
  if (state.tab === "depenses-liste") return depensesPage();
  if (state.tab === "rapport-word") return rapportPage();
}

function pageHead(title, sub, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
}
function kpi(label, val, color, hint = "", extraClass = "") {
  return `<div class="kpi ${extraClass}">${extraClass === "kpi-benefice" ? `<div class="kpi-benefice-info"><div class="kpi-label">${label}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ""}</div><div class="kpi-value" style="color:${color}">${val}</div>` : `<div class="kpi-label">${label}</div><div class="kpi-value" style="color:${color}">${val}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ""}`}</div>`;
}

function dashboard() {
  const cle = MONTH_KEY(TODAY());
  const st = calcSnap().currentMonth;
  const prochains = pendingRdvs().slice(0, 4);
  return `
  ${pageHead("Résumé de votre activité", `Période en cours : ${MONTH_LABEL(cle)}`, `<button class="btn" onclick="setTab('rdv-agenda')">Voir l'agenda</button>`)}
  <div class="grid-kpi">
    ${kpi("Revenus Clients", FORMAT_CAD(st.revenus), "var(--success)", `${st.volumeRevenus} entrée(s)`)}
    ${kpi("Dépenses Matériel", FORMAT_CAD(st.depenses), "var(--warning)", "Hors loyer fixe")}
    ${st.rdvPending ? kpi("Pipeline RDV", FORMAT_CAD(st.pipelineRevenue), "var(--purple)", `${st.rdvPending} RDV à venir`) : ""}
    ${kpi("Bénéfice Réel Net", FORMAT_CAD(st.benefice), st.benefice >= 0 ? "var(--success)" : "var(--danger)", "Revenus - dépenses - loyer", "kpi-benefice")}
  </div>
  <div class="panel rent-panel">
    <div class="rent-panel-inner">
      <div class="rent-panel-main">
        <div class="kpi-label">Loyer / dépense fixe retenue</div>
        <div class="kpi-value kpi-rent">${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())}</div>
        <div class="kpi-hint">Déduit automatiquement chaque mois.</div>
      </div>
      <div class="rent-panel-controls">
        <input type="number" min="0" step="0.01" class="rent-input" ${fieldAttr("rent", "amount")} value="${escapeHTML(state.loyerDraft)}" oninput="state.loyerDraft=this.value">
        <button class="btn secondary btn-compact" onclick="updateRent()">Modifier</button>
      </div>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><div><h2>Prochains rendez-vous</h2><p class="subtitle">Les dates les plus proches apparaissent ici.</p></div></div>${prochains.length ? `<div class="cards-list">${prochains.map((r) => rdvCard(r)).join("")}</div>` : `<p class="empty">Aucun rendez-vous à venir.</p>`}</div>
  <div class="panel"><h2>Dernières entrées de caisse</h2>${revenusTable(activeRevenus().slice(0, 6), false)}</div>`;
}

function agenda() {
  return `
    ${pageHead("Agenda & rendez-vous", "Cliquez sur une date du calendrier pour voir l'activité du jour et prendre un rendez-vous.")}
    <div class="agenda-layout">
      <div class="panel">
        <div class="calendar-toolbar">
          <button class="icon-btn" onclick="changeMonth(-1)">‹</button>
          <h2>${MOIS_FR[state.calMonth]} ${state.calYear}</h2>
          <button class="icon-btn" onclick="changeMonth(1)">›</button>
        </div>
        ${calendarGrid()}
        <p class="subtitle" style="margin-top:12px">Point orange : RDV prévu · point vert : terminé & encaissé · montant vert : revenu du jour.</p>
      </div>
      <div class="selected-day-panel">${selectedDayPanel()}</div>
    </div>`;
}

function calendarGrid() {
  const first = new Date(state.calYear, state.calMonth, 1).getDay();
  const total = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  let html = JOURS_FR.map((j) => `<div class="cal-head">${j}</div>`).join("");
  for (let i = 0; i < first; i++) html += "<div></div>";
  for (let d = 1; d <= total; d++) {
    const date = `${state.calYear}-${String(state.calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const day = CalcPlatform.calendarDaySummary(date);
    const selected = state.selectedDate === date;
    const today = date === TODAY();
    html += `<div class="cal-cell ${selected ? "selected" : ""} ${today ? "today" : ""} ${day.hasPending ? "has-rdv" : ""}" onclick="selectDateFromCalendar('${date}')">
      <span class="cal-day">${d}</span>
      ${day.encaissedRevenue ? `<span class="day-rev">+${day.encaissedRevenue.toFixed(0)}$</span>` : ""}
      <span class="dot-row">${day.hasPending ? `<span class="dot" title="RDV prévu"></span><span class="day-count">${day.pendingCount} RDV</span>` : ""}${day.hasCompleted ? `<span class="dot green-dot" title="RDV terminé"></span>` : ""}</span>
    </div>`;
  }
  return `<div class="cal-grid">${html}</div>`;
}

function selectedDayPanel() {
  const date = state.selectedDate;
  if (!date) return `<h2>Aucune date sélectionnée</h2><p class="subtitle">Cliquez sur une date du calendrier pour voir les revenus et rendez-vous de cette journée.</p>`;
  const activity = CalcPlatform.dayActivity(date);
  const { revenus: rev, rdvs: r, encaissedRevenue: total, pendingRevenue, rdvGroup } = activity;
  const groupHint = rdvGroup.pending ? ` · ${FORMAT_CAD(pendingRevenue)} en attente` : "";
  return `<div class="panel-head"><div><h2>${formatDateFR(date)}</h2><p class="subtitle">${rev.length} revenu(s) · ${r.length} rendez-vous · ${FORMAT_CAD(total)} encaissé${groupHint}</p></div><button class="btn" onclick="openRdvModal('${date}')">Prendre rendez-vous</button></div>
    ${!rev.length && !r.length ? `<p class="empty">Rien n'est enregistré pour ce jour.</p>` : ""}
    ${r.length ? `<h3 style="margin-bottom:10px">Rendez-vous (${rdvGroup.pending} prévu(s) · ${rdvGroup.completed} terminé(s))</h3><div class="cards-list" style="margin-bottom:18px">${r.map((x) => rdvCard(x.rdv, x)).join("")}</div>` : ""}
    ${rev.length ? `<h3 style="margin-bottom:10px">Revenus encaissés</h3>${revenusTable(rev, false)}` : ""}`;
}

function rdvModal() {
  const f = state.rdvForm;
  const durees = ["30 min", "45 min", "1h00", "1h30", "2h00", "2h30", "3h00", "4h00", "5h00", "6h00", "7h00", "10h et +", "custom"];
  return `<div class="modal-backdrop" onclick="if(event.target.className==='modal-backdrop')closeModal()">
    <div class="modal rdv-modal">
      <div class="modal-head"><div><h2>Prendre un rendez-vous</h2><p class="subtitle">Remplissez les informations ci-dessous.</p></div><button class="close-btn" onclick="closeModal()">×</button></div>
      <div class="rdv-date-banner">
        <div class="rdv-date-banner-item">
          <span class="rdv-meta-label">Date</span>
          <span class="rdv-meta-value" id="rdv-date-banner-value">${formatDateFR(f.date)}</span>
        </div>
        <div class="rdv-date-banner-item">
          <span class="rdv-meta-label">Heure</span>
          <input type="time" class="rdv-time-inline" ${fieldAttr("rdvForm", "heure")} value="${f.heure}" onchange="updateForm('rdvForm','heure',this.value)">
        </div>
      </div>
      <div class="form-section">
        <h3 class="form-section-title">Client</h3>
        <div class="form-grid">
          <div><label>Client / Identifiant *</label><input ${fieldAttr("rdvForm", "client")} value="${escapeHTML(f.client)}" placeholder="Nom du client..." oninput="updateForm('rdvForm','client',this.value)"></div>
          <div><label>Téléphone</label><input type="tel" ${fieldAttr("rdvForm", "telephone")} value="${escapeHTML(f.telephone)}" placeholder="(514) 555-1234" oninput="updateForm('rdvForm','telephone',this.value)"></div>
          <div><label>Genre / catégorie</label><select onchange="updateForm('rdvForm','genre',this.value)"><option ${f.genre === "Femme" ? "selected" : ""}>Femme</option><option ${f.genre === "Homme" ? "selected" : ""}>Homme</option><option ${f.genre === "Enfant" ? "selected" : ""}>Enfant</option><option ${f.genre === "Autre" ? "selected" : ""}>Autre</option></select></div>
        </div>
      </div>
      <div class="form-section">
        <h3 class="form-section-title">Prestation</h3>
        <div class="form-grid">
          <div class="field full"><label>Style / Coiffure</label><input ${fieldAttr("rdvForm", "style")} value="${escapeHTML(f.style)}" placeholder="Tresses, coupe, coloration..." oninput="updateForm('rdvForm','style',this.value)"></div>
          <div><label>Durée estimée</label><select onchange="onRdvDureeChange(this.value)">${durees.map((d) => `<option value="${d}" ${f.duree === d ? "selected" : ""}>${d === "custom" ? "Durée personnalisée" : d}</option>`).join("")}</select></div>
          <div id="rdv-duree-custom-wrap" style="display:${f.duree === "custom" ? "" : "none"}"><label>Durée personnalisée</label><input ${fieldAttr("rdvForm", "dureeCustom")} value="${escapeHTML(f.dureeCustom)}" placeholder="Ex: 8h, 1h15..." oninput="updateForm('rdvForm','dureeCustom',this.value)"></div>
          <div><label>Prix estimé (CAD) *</label><input type="number" ${fieldAttr("rdvForm", "montant")} value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('rdvForm','montant',this.value)"></div>
        </div>
      </div>
      <div class="form-section">
        <h3 class="form-section-title">Planification</h3>
        <div class="form-grid">
          <div><label>Date du rendez-vous *</label><input type="date" value="${f.date}" onchange="onRdvDateChange(this.value)"></div>
          <div class="field full"><label>Notes</label><textarea ${fieldAttr("rdvForm", "note")} placeholder="Précisions..." oninput="updateForm('rdvForm','note',this.value)">${escapeHTML(f.note)}</textarea></div>
        </div>
      </div>
      ${state.error ? `<div class="error">⚠️ ${escapeHTML(state.error)}</div>` : ""}
      <button class="btn dark" onclick="addRdv()">Enregistrer le rendez-vous</button>
    </div>
  </div>`;
}

function rdvCard(r, enriched) {
  const meta = enriched || { status: CalcPlatform.rdvStatusLabel(r), actions: CalcPlatform.rdvActions(r), linkedRevenu: CalcPlatform.matchRdvToRevenu(r) };
  const { label: statusLbl, pill: pillCls } = meta.status;
  const { completeAndCash, cancel, encaisse } = meta.actions;
  const isCompleted = r.status === "completed";
  const cardCls = isCompleted ? "done" : "";
  const styleLabel = (r.style || "").trim() || "Standard";
  const phone = CalcPlatform.findClientPhone(r);
  const id = escapeHTML(r.id);
  return `<div class="rdv-card ${cardCls}">
    <div class="rdv-card-body">
      <div class="rdv-card-top">
        <div class="rdv-client-row">
          <b class="rdv-client-name">${escapeHTML(CalcPlatform.rdvNom(r))}</b>
          <span class="pill">${escapeHTML(CalcPlatform.rdvGenre(r) || "—")}</span>
          <span class="pill ${pillCls}">${statusLbl}</span>
        </div>
        <div class="rdv-price">${FORMAT_CAD(r.montant)}</div>
      </div>
      <div class="rdv-meta-grid">
        <div class="rdv-meta-item"><span class="rdv-meta-label">Date</span><span class="rdv-meta-value">${formatDateFR(r.date)}</span></div>
        <div class="rdv-meta-item"><span class="rdv-meta-label">Heure</span><span class="rdv-meta-value">${formatHeureFR(r.heure)}</span></div>
        <div class="rdv-meta-item"><span class="rdv-meta-label">Style</span><span class="rdv-meta-value">${escapeHTML(styleLabel)}</span></div>
        <div class="rdv-meta-item"><span class="rdv-meta-label">Durée</span><span class="rdv-meta-value">${escapeHTML(r.duree || "—")}</span></div>
        ${phone ? `<div class="rdv-meta-item"><span class="rdv-meta-label">Téléphone</span><span class="rdv-meta-value"><a class="rdv-phone" href="tel:${phone.replace(/[^\d+]/g, "")}">${escapeHTML(phone)}</a></span></div>` : ""}
      </div>
      ${r.note ? `<div class="rdv-note">Note : ${escapeHTML(r.note)}</div>` : ""}
      ${meta.linkedClient ? `<div class="rdv-linked">✓ Encaissé le ${formatDateFR(meta.linkedClient.date)}</div>` : ""}
    </div>
    <div class="rdv-actions">
      ${completeAndCash ? `<button class="btn success" onclick="completeRdvAndCash('${id}')">Terminé & Encaisser</button>` : ""}
      ${encaisse ? `<span class="rdv-encaisse-badge">✓ Encaissé</span>` : ""}
      ${cancel ? `<button class="btn danger" onclick="cancelRdv('${id}')">Annuler</button>` : ""}
    </div>
  </div>`;
}

function clientsPage() {
  return `${pageHead("Registre des encaissements", "Directs ou validés via l'agenda", `<button class="btn" onclick="state.showClientForm=!state.showClientForm;state.error='';render()">${state.showClientForm ? "Fermer" : "+ Encaisser un client direct"}</button>`)}
  ${state.showClientForm ? clientForm() : ""}<div class="panel">${revenusTable(activeRevenus(), true)}</div>`;
}

function clientForm() {
  const f = state.clientForm;
  return `<div class="panel"><h2 style="margin-bottom:16px">Encaisser un client direct</h2><div class="form-grid">
    <div><label>Date</label><input type="date" value="${f.date}" onchange="updateForm('clientForm','date',this.value)"></div>
    <div><label>Identifiant / Client *</label><input ${fieldAttr("clientForm", "client")} value="${escapeHTML(f.client)}" placeholder="Nom..." oninput="updateForm('clientForm','client',this.value)"></div>
    <div><label>Téléphone</label><input type="tel" ${fieldAttr("clientForm", "telephone")} value="${escapeHTML(f.telephone)}" placeholder="(514) 555-1234" oninput="updateForm('clientForm','telephone',this.value)"></div>
    <div><label>Genre</label><select onchange="updateForm('clientForm','genre',this.value)"><option ${f.genre === "Femme" ? "selected" : ""}>Femme</option><option ${f.genre === "Homme" ? "selected" : ""}>Homme</option><option ${f.genre === "Enfant" ? "selected" : ""}>Enfant</option><option ${f.genre === "Autre" ? "selected" : ""}>Autre</option></select></div>
    <div><label>Montant ($ CAD) *</label><input type="number" ${fieldAttr("clientForm", "montant")} value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('clientForm','montant',this.value)"></div>
    <div class="field full"><label>Note</label><input ${fieldAttr("clientForm", "note")} value="${escapeHTML(f.note)}" placeholder="Détails du soin..." oninput="updateForm('clientForm','note',this.value)"></div>
  </div>${state.error ? `<div class="error">⚠️ ${escapeHTML(state.error)}</div>` : ""}<button class="btn dark" onclick="addClient()">Valider l'encaissement</button></div>`;
}

function revenusTable(list, canDelete) {
  if (!list.length) return `<p class="empty">Aucun encaissement pour le moment.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Téléphone</th><th>Genre</th><th>Détails</th><th class="right">Prix</th>${canDelete ? "<th></th>" : ""}</tr></thead><tbody>${list
    .map(
      (rv) =>
        `<tr><td>${rv.date}</td><td><b>${escapeHTML(CalcPlatform.revNom(rv))}</b></td><td class="muted">${escapeHTML(CalcPlatform.revTel(rv) || "—")}</td><td><span class="muted">${escapeHTML(CalcPlatform.revGenre(rv) || "—")}</span></td><td class="muted">${escapeHTML(rv.note || "—")}</td><td class="right green">${FORMAT_CAD(rv.montant)}</td>${canDelete ? `<td><button class="btn danger" onclick="deleteRevenu('${escapeHTML(rv.id)}')">Retirer</button></td>` : ""}</tr>`
    )
    .join("")}</tbody></table></div>`;
}

function depensesPage() {
  return `${pageHead("Frais d'exploitation", "Achats de matériel et frais du salon", `<button class="btn" onclick="state.showDepForm=!state.showDepForm;state.error='';render()">${state.showDepForm ? "Fermer" : "+ Ajouter un achat / frais"}</button>`)}
  ${state.showDepForm ? depForm() : ""}<div class="panel">${depensesTable(activeDepenses(), true)}</div>`;
}

function depForm() {
  const f = state.depForm;
  return `<div class="panel"><h2 style="margin-bottom:16px">Ajouter un achat / frais</h2><div class="form-grid">
    <div><label>Date</label><input type="date" value="${f.date}" onchange="updateForm('depForm','date',this.value)"></div>
    <div><label>Description *</label><input ${fieldAttr("depForm", "description")} value="${escapeHTML(f.description)}" placeholder="Shampoing, savon..." oninput="updateForm('depForm','description',this.value)"></div>
    <div><label>Prix ($ CAD) *</label><input type="number" ${fieldAttr("depForm", "montant")} value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('depForm','montant',this.value)"></div>
  </div><div class="note-box">📌 Le loyer de ${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())} est calculé automatiquement. Ne l'entrez pas ici.</div>${state.error ? `<div class="error">⚠️ ${escapeHTML(state.error)}</div>` : ""}<button class="btn dark" onclick="addDepense()">Sauvegarder</button></div>`;
}

function depensesTable(list, canDelete) {
  if (!list.length) return `<p class="empty">Aucun frais référencé.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th class="right">Montant</th>${canDelete ? "<th></th>" : ""}</tr></thead><tbody>${list
    .map(
      (d) =>
        `<tr><td>${d.date}</td><td><b>${escapeHTML(d.description)}</b></td><td class="right orange">${FORMAT_CAD(d.montant)}</td>${canDelete ? `<td><button class="btn danger" onclick="deleteDepense('${escapeHTML(d.id)}')">Retirer</button></td>` : ""}</tr>`
    )
    .join("")}</tbody></table></div>`;
}

function rapportPage() {
  const data = reportData();
  return `<div class="panel">
    ${pageHead("Export Word", "Mois actuel ou cumul jusqu'au mois présent.")}
    <div class="export-grid" style="grid-template-columns:minmax(220px,360px)">
      <div>
        <label>Type de rapport</label>
        <select onchange="state.reportType=this.value;render()">
          <option value="currentMonth" ${state.reportType === "currentMonth" ? "selected" : ""}>Mois actuel</option>
          <option value="cumulativeToCurrent" ${state.reportType === "cumulativeToCurrent" ? "selected" : ""}>Cumul jusqu'au mois présent</option>
        </select>
      </div>
    </div>
    <div class="report-preview">
      <h2>${data.title}</h2>
      <p class="subtitle">
        Revenus : <b class="green">${FORMAT_CAD(data.totalRev)}</b> ·
        Dépenses : <b class="orange">${FORMAT_CAD(data.totalDep)}</b> ·
        Loyer : <b class="red">${FORMAT_CAD_EXPENSE(data.totalRent)}</b> ·
        Bénéfice : <b class="${data.totalProfit < 0 ? "red" : "green"}">${FORMAT_CAD(data.totalProfit)}</b>
      </p>
      <div class="grid-kpi" style="margin-top:18px;margin-bottom:0">
        ${kpi("Revenus", FORMAT_CAD(data.totalRev), "var(--success)")}
        ${kpi("Dépenses", FORMAT_CAD(data.totalDep), "var(--warning)")}
        ${kpi("Loyer retenu", FORMAT_CAD_EXPENSE(data.totalRent), "var(--danger)", `${data.rentMonths} mois`)}
        ${kpi("Bénéfice net", FORMAT_CAD(data.totalProfit), data.totalProfit >= 0 ? "var(--success)" : "var(--danger)")}
      </div>
    </div>
    <div style="margin-top:18px"><button class="btn dark" onclick="exportWord()">⬇ Rapport Word (.doc)</button></div>
  </div>`;
}

window.state = state;
window.render = render;
window.setTab = setTab;
window.updateForm = updateForm;
window.updateFormAndRender = updateFormAndRender;
window.onRdvDureeChange = onRdvDureeChange;
window.onRdvDateChange = onRdvDateChange;
window.openRdvModal = openRdvModal;
window.closeModal = closeModal;
window.addClient = addClient;
window.addDepense = addDepense;
window.addRdv = addRdv;
window.completeRdvAndCash = completeRdvAndCash;
window.cancelRdv = cancelRdv;
window.deleteRevenu = deleteRevenu;
window.deleteDepense = deleteDepense;
window.changeMonth = changeMonth;
window.selectDateFromCalendar = selectDateFromCalendar;
window.exportWord = exportWord;
window.updateRent = updateRent;

initApp();
