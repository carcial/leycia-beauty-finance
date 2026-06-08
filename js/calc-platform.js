/**
 * CalcPlatform — moteur centralisé de calculs MonSalon
 *
 * Tous les gains, dépenses, loyers et agrégations RDV passent par ici.
 * Modifier le loyer ou les données appelle sync() : toute l'interface se recalcule.
 */
const CalcPlatform = (() => {
  const LOYER_DEFAUT = 250;

  const RDV_STATUS = {
    PENDING: "pending",
    COMPLETED: "completed",
    DELETED: "deleted",
  };

  const REPORT_TYPES = {
    CURRENT_MONTH: "currentMonth",
    CUMULATIVE: "cumulativeToCurrent",
  };

  let data = {
    clients: [],
    depenses: [],
    rdvs: [],
    loyer: LOYER_DEFAUT,
  };

  let version = 0;
  let snapshot = null;

  /* ── Utilitaires ── */
  function parseMoney(v) {
    return parseFloat(String(v || "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
  }

  function monthKey(d) {
    return (d || "").slice(0, 7);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function sumMontant(items, field = "montant") {
    return (items || []).reduce((s, x) => s + Number(x[field] || 0), 0);
  }

  function uniqueMonthKeys(...lists) {
    const keys = new Set();
    lists.flat().forEach((item) => {
      const k = monthKey(item.date);
      if (k) keys.add(k);
    });
    return [...keys].sort();
  }

  /** Tous les mois entre deux clés YYYY-MM (inclus). */
  function monthsBetween(fromKey, toKey) {
    if (!fromKey || !toKey) return [];
    const [fy, fm] = fromKey.split("-").map(Number);
    const [ty, tm] = toKey.split("-").map(Number);
    const out = [];
    let y = fy;
    let m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }

  function isActive(item) {
    return item && !item.deleted_at;
  }

  /** Entrées visibles dans la caisse, le tableau de bord et les listes actives. */
  function filterActive(items) {
    return (items || []).filter(isActive);
  }

  /** Toutes les entrées — y compris retirées — pour rapports et exports cumulés. */
  function filterArchived(items) {
    return [...(items || [])];
  }

  function filterByMonth(items, key) {
    return (items || []).filter((x) => monthKey(x.date) === key);
  }

  function filterByDate(items, date) {
    return (items || []).filter((x) => x.date === date);
  }

  function filterUpToMonth(items, key) {
    return (items || []).filter((x) => monthKey(x.date) <= key);
  }

  function getLoyer() {
    const v = Number(data.loyer);
    return v > 0 ? v : LOYER_DEFAUT;
  }

  function profit(revenus, depenses, rentMonthCount = 1) {
    return revenus - depenses - getLoyer() * rentMonthCount;
  }

  /* ── RDV : cycle de vie & regroupement ── */
  function rdvRank(status) {
    if (status === RDV_STATUS.PENDING) return 0;
    if (status === RDV_STATUS.COMPLETED) return 1;
    return 2;
  }

  function sortRdvs(rdvs) {
    return [...(rdvs || [])].sort((a, b) => {
      const dr = rdvRank(a.status) - rdvRank(b.status);
      if (dr !== 0) return dr;
      return `${a.date}T${a.heure || ""}`.localeCompare(`${b.date}T${b.heure || ""}`);
    });
  }

  function rdvsPending(rdvs = data.rdvs) {
    return (rdvs || []).filter((r) => r.status === RDV_STATUS.PENDING);
  }

  function rdvsForDate(date, rdvs = data.rdvs) {
    return sortRdvs(filterByDate(rdvs, date));
  }

  /** Téléphone du RDV, ou retrouvé via encaissement / historique client / autre RDV. */
  function findClientPhone(rdv, clients = data.clients, rdvs = data.rdvs) {
    if (!rdv) return "";
    const fromRdv = (rdv.telephone || "").trim();
    if (fromRdv) return fromRdv;

    const linked = matchRdvToClient(rdv, clients);
    const fromLinked = (linked?.telephone || "").trim();
    if (fromLinked) return fromLinked;

    const name = (rdv.client || "").trim().toLowerCase();
    if (!name) return "";

    const clientHit = [...clients]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .find((c) => (c.client || "").trim().toLowerCase() === name && (c.telephone || "").trim());
    if (clientHit) return clientHit.telephone.trim();

    const rdvHit = [...rdvs]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .find(
        (r) =>
          Number(r.id) !== Number(rdv.id) &&
          (r.client || "").trim().toLowerCase() === name &&
          (r.telephone || "").trim()
      );
    return rdvHit ? rdvHit.telephone.trim() : "";
  }

  /** Lie un RDV encaissé à son entrée client (via rdv_id ou correspondance date/client/montant). */
  function matchRdvToClient(rdv, clients = data.clients) {
    if (!rdv) return null;
    const byId = clients.find((c) => Number(c.rdv_id) === Number(rdv.id));
    if (byId) return byId;
    const linked = clients.filter(
      (c) =>
        c.date === rdv.date &&
        c.client === rdv.client &&
        Number(c.montant) === Number(rdv.montant)
    );
    if (linked.length === 1) return linked[0];
    if (Number(rdv.encaisse)) {
      return (
        linked.find((c) => (c.note || "").includes("Rendez-vous")) ||
        linked[0] ||
        null
      );
    }
    return null;
  }

  function rdvStatusLabel(r) {
    if (r.status === RDV_STATUS.DELETED) return { label: "Supprimé", pill: "pill-red" };
    if (r.status === RDV_STATUS.COMPLETED) {
      return Number(r.encaisse)
        ? { label: "Honoré & encaissé", pill: "pill-grey" }
        : { label: "Tâche accomplie", pill: "pill-grey" };
    }
    return { label: "Prévu", pill: "pill-blue" };
  }

  function canTerminer(r) {
    return r && r.status === RDV_STATUS.PENDING;
  }

  function canEncaisser(r) {
    return r && r.status === RDV_STATUS.COMPLETED && !Number(r.encaisse);
  }

  function canAnnuler(r) {
    return r && r.status === RDV_STATUS.PENDING;
  }

  function canDismissCompleted(r) {
    return r && r.status === RDV_STATUS.COMPLETED;
  }

  /** @deprecated — utiliser canAnnuler / canDismissCompleted */
  function canSupprimer(r) {
    return canAnnuler(r);
  }

  function daysUntilPurge(completedAt, purgeDays = 2) {
    if (!completedAt) return purgeDays;
    const end = new Date(completedAt);
    end.setDate(end.getDate() + purgeDays);
    const diff = Math.ceil((end - new Date()) / 86400000);
    return Math.max(0, diff);
  }

  /** Actions autorisées selon l'état du RDV — source unique pour les boutons UI. */
  function rdvActions(r) {
    return {
      terminer: canTerminer(r),
      encaisser: canEncaisser(r),
      annuler: canAnnuler(r),
      dismiss: canDismissCompleted(r),
      supprimer: canAnnuler(r),
      encaisse: Boolean(Number(r?.encaisse)),
    };
  }

  /** Groupe les RDV par date (agenda / calendrier). */
  function groupRdvsByDate(rdvs = data.rdvs) {
    const groups = {};
    sortRdvs(rdvs).forEach((r) => {
      if (!groups[r.date]) {
        groups[r.date] = {
          date: r.date,
          rdvs: [],
          pending: 0,
          completed: 0,
          deleted: 0,
          estimatedRevenue: 0,
          encaissedRevenue: 0,
        };
      }
      const g = groups[r.date];
      g.rdvs.push(r);
      if (r.status === RDV_STATUS.PENDING) {
        g.pending++;
        g.estimatedRevenue += Number(r.montant || 0);
      } else if (r.status === RDV_STATUS.COMPLETED) {
        g.completed++;
        if (Number(r.encaisse)) g.encaissedRevenue += Number(r.montant || 0);
        else g.estimatedRevenue += Number(r.montant || 0);
      } else {
        g.deleted++;
      }
    });
    return groups;
  }

  /** Sous-groupes par client sur une même journée. */
  function groupRdvsByClientOnDate(date, rdvs = data.rdvs) {
    const dayRdvs = rdvsForDate(date, rdvs);
    const byClient = {};
    dayRdvs.forEach((r) => {
      const key = (r.client || "").trim().toLowerCase() || "__sans_nom__";
      if (!byClient[key]) {
        byClient[key] = { client: r.client, rdvs: [], totalMontant: 0 };
      }
      byClient[key].rdvs.push(r);
      byClient[key].totalMontant += Number(r.montant || 0);
    });
    return Object.values(byClient);
  }

  /** Vue journée : revenus encaissés + RDV + correspondances automatiques. */
  function dayActivity(date) {
    const clients = filterByDate(filterActive(data.clients), date);
    const rdvs = rdvsForDate(date);
    const encaissed = sumMontant(clients);
    const groups = groupRdvsByClientOnDate(date);
    const rdvGroups = groupRdvsByDate(rdvs)[date] || {
      date,
      rdvs: [],
      pending: 0,
      completed: 0,
      deleted: 0,
      estimatedRevenue: 0,
      encaissedRevenue: 0,
    };

    const enrichedRdvs = rdvs.map((r) => ({
      rdv: r,
      actions: rdvActions(r),
      status: rdvStatusLabel(r),
      linkedClient: matchRdvToClient(r),
    }));

    return {
      date,
      clients,
      rdvs: enrichedRdvs,
      clientGroups: groups,
      rdvGroup: rdvGroups,
      encaissedRevenue: encaissed,
      pendingRevenue: rdvGroups.estimatedRevenue,
      totalRdvs: rdvs.length,
      totalClients: clients.length,
    };
  }

  /** Indicateurs calendrier pour une cellule. */
  function calendarDaySummary(date) {
    const dayClients = filterByDate(filterActive(data.clients), date);
    const dayRdvs = filterByDate(data.rdvs, date);
    const encaissed = sumMontant(dayClients);
    const pending = dayRdvs.filter((r) => r.status === RDV_STATUS.PENDING);
    const completed = dayRdvs.some((r) => r.status === RDV_STATUS.COMPLETED);
    const deleted = dayRdvs.some((r) => r.status === RDV_STATUS.DELETED);
    return {
      date,
      encaissedRevenue: encaissed,
      hasPending: pending.length > 0,
      pendingCount: pending.length,
      hasCompleted: completed,
      hasDeleted: deleted,
    };
  }

  /* ── Calculs financiers par période ── */
  function statsForMonth(key) {
    const clients = filterByMonth(filterActive(data.clients), key);
    const depenses = filterByMonth(filterActive(data.depenses), key);
    const revenus = sumMontant(clients);
    const depensesTotal = sumMontant(depenses);
    const loyer = getLoyer();
    const benefice = profit(revenus, depensesTotal, 1);
    const rdvsMonth = filterByMonth(data.rdvs, key);
    const pendingRdvs = rdvsMonth.filter((r) => r.status === RDV_STATUS.PENDING);
    const pipelineRevenue = sumMontant(pendingRdvs);

    return {
      monthKey: key,
      revenus,
      depenses: depensesTotal,
      loyer,
      benefice,
      volumeClients: clients.length,
      rdvPending: pendingRdvs.length,
      pipelineRevenue,
    };
  }

  function statsForDay(date) {
    const activity = dayActivity(date);
    return {
      date,
      revenus: activity.encaissedRevenue,
      rdvCount: activity.totalRdvs,
      clientCount: activity.totalClients,
      pendingRevenue: activity.pendingRevenue,
    };
  }

  function allActivityMonthKeys({ archived = false } = {}) {
    const clients = archived ? filterArchived(data.clients) : filterActive(data.clients);
    const depenses = archived ? filterArchived(data.depenses) : filterActive(data.depenses);
    return uniqueMonthKeys(clients, depenses);
  }

  function cumulativeMonthKeys(upToKey = monthKey(today()), { archived = false } = {}) {
    const activityKeys = allActivityMonthKeys({ archived }).filter((k) => k <= upToKey);
    if (!activityKeys.length) return [];
    const first = activityKeys[0];
    return monthsBetween(first, upToKey);
  }

  /**
   * Rapport : historique complet (entrées actives + retirées de la caisse).
   * Le tableau de bord n'affiche que les entrées actives du mois en cours.
   */
  function statsForReport(type = REPORT_TYPES.CURRENT_MONTH) {
    const nowKey = monthKey(today());
    let title = "Mois actuel";
    let clients = filterArchived(data.clients);
    let depenses = filterArchived(data.depenses);
    let monthKeys = [];
    let rentMonths = 1;

    if (type === REPORT_TYPES.CURRENT_MONTH) {
      title = `Mois actuel — ${nowKey}`;
      clients = filterByMonth(clients, nowKey);
      depenses = filterByMonth(depenses, nowKey);
      monthKeys = [nowKey];
      rentMonths = 1;
    } else {
      title = `Cumul jusqu'au mois présent — ${nowKey}`;
      clients = filterUpToMonth(clients, nowKey);
      depenses = filterUpToMonth(depenses, nowKey);
      monthKeys = cumulativeMonthKeys(nowKey, { archived: true });
      rentMonths = monthKeys.length || 1;
    }

    const totalRev = sumMontant(clients);
    const totalDep = sumMontant(depenses);
    const totalRent = getLoyer() * rentMonths;
    const totalProfit = totalRev - totalDep - totalRent;

    const archivedClients = filterArchived(data.clients);
    const archivedDepenses = filterArchived(data.depenses);
    const monthlyBreakdown = monthKeys.map((key) => {
      const cs = filterByMonth(archivedClients, key);
      const ds = filterByMonth(archivedDepenses, key);
      const rev = sumMontant(cs);
      const dep = sumMontant(ds);
      return {
        monthKey: key,
        clients: cs,
        depenses: ds,
        revenus: rev,
        depensesTotal: dep,
        loyer: getLoyer(),
        benefice: profit(rev, dep, 1),
      };
    });

    return {
      type,
      title,
      clients,
      depenses,
      monthKeys,
      rentMonths,
      loyerUnit: getLoyer(),
      totalRev,
      totalDep,
      totalRent,
      totalProfit,
      monthlyBreakdown,
    };
  }

  /** Recalcule l'instantané global — appelé après chaque sync(). */
  function rebuildSnapshot() {
    const nowKey = monthKey(today());
    snapshot = {
      version,
      loyer: getLoyer(),
      currentMonth: statsForMonth(nowKey),
      reportCurrent: statsForReport(REPORT_TYPES.CURRENT_MONTH),
      reportCumulative: statsForReport(REPORT_TYPES.CUMULATIVE),
      pendingRdvs: sortRdvs(rdvsPending()),
      rdvGroupsByDate: groupRdvsByDate(),
      activityMonthKeys: allActivityMonthKeys(),
    };
    return snapshot;
  }

  function getSnapshot() {
    if (!snapshot) rebuildSnapshot();
    return snapshot;
  }

  /**
   * Synchronise les données depuis la base.
   * Toute modification (loyer, client, dépense, RDV) doit passer par sync().
   */
  function sync({ clients, depenses, rdvs, loyer } = {}) {
    if (clients !== undefined) data.clients = clients;
    if (depenses !== undefined) data.depenses = depenses;
    if (rdvs !== undefined) data.rdvs = rdvs;
    if (loyer !== undefined) data.loyer = parseMoney(loyer) || LOYER_DEFAUT;
    version++;
    return rebuildSnapshot();
  }

  function setLoyer(amount) {
    const val = parseMoney(amount);
    if (val <= 0) return { ok: false, error: "Montant de loyer invalide." };
    data.loyer = val;
    version++;
    rebuildSnapshot();
    return { ok: true, loyer: val };
  }

  return {
    LOYER_DEFAUT,
    RDV_STATUS,
    REPORT_TYPES,
    sync,
    setLoyer,
    getLoyer,
    getSnapshot,
    rebuildSnapshot,
    parseMoney,
    monthKey,
    today,
    sumMontant,
    profit,
    statsForMonth,
    statsForDay,
    statsForReport,
    allActivityMonthKeys,
    cumulativeMonthKeys,
    isActive,
    filterActive,
    filterArchived,
    filterByMonth,
    filterByDate,
    sortRdvs,
    rdvsPending,
    rdvsForDate,
    rdvStatusLabel,
    rdvActions,
    canTerminer,
    canEncaisser,
    canAnnuler,
    canDismissCompleted,
    canSupprimer,
    daysUntilPurge,
    matchRdvToClient,
    findClientPhone,
    groupRdvsByDate,
    groupRdvsByClientOnDate,
    dayActivity,
    calendarDaySummary,
  };
})();

window.CalcPlatform = CalcPlatform;
