/**
 * CalcPlatform — calculs MonSalon (côté frontend uniquement)
 */
const CalcPlatform = (() => {
  const LOYER_DEFAUT = 250;

  const RDV_STATUS = {
    PENDING: "pending",
    COMPLETED: "completed",
    DELETED: "deleted"
  };

  const REPORT_TYPES = {
    CURRENT_MONTH: "currentMonth",
    CUMULATIVE: "cumulativeToCurrent"
  };

  let data = {
    revenus: [],
    depenses: [],
    rdvs: [],
    loyer: LOYER_DEFAUT
  };

  let version = 0;
  let snapshot = null;

  function revNom(r) {
    return (r && r.client_nom_snapshot) || "";
  }
  function revTel(r) {
    return (r && r.telephone_snapshot) || "";
  }
  function revGenre(r) {
    return (r && r.genre_snapshot) || "";
  }
  function rdvNom(r) {
    return (r && r.client_nom_snapshot) || "";
  }
  function rdvTel(r) {
    return (r && r.telephone_snapshot) || "";
  }
  function rdvGenre(r) {
    return (r && r.genre_snapshot) || "";
  }

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
  function filterActive(items) {
    return (items || []).filter(isActive);
  }
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
  function isRdvActive(r) {
    return r && !r.deleted_at;
  }
  function activeRdvs(rdvs = data.rdvs) {
    return (rdvs || []).filter(isRdvActive);
  }
  function rdvsPending(rdvs = data.rdvs) {
    return activeRdvs(rdvs).filter((r) => r.status === RDV_STATUS.PENDING);
  }
  function rdvsForDate(date, rdvs = data.rdvs) {
    return sortRdvs(filterByDate(activeRdvs(rdvs), date));
  }

  function findClientPhone(rdv, revenus = data.revenus) {
    if (!rdv) return "";
    const fromRdv = rdvTel(rdv).trim();
    if (fromRdv) return fromRdv;
    const linked = matchRdvToRevenu(rdv, revenus);
    const fromLinked = revTel(linked).trim();
    if (fromLinked) return fromLinked;
    return "";
  }

  function matchRdvToRevenu(rdv, revenus = data.revenus) {
    if (!rdv) return null;
    const byId = revenus.find((r) => r.rdv_id && String(r.rdv_id) === String(rdv.id) && isActive(r));
    if (byId) return byId;
    const linked = revenus.filter(
      (r) =>
        r.date === rdv.date &&
        revNom(r) === rdvNom(rdv) &&
        Number(r.montant) === Number(rdv.montant)
    );
    if (linked.length === 1) return linked[0];
    if (Number(rdv.encaisse)) {
      return linked.find((r) => (r.note || "").includes("Rendez-vous")) || linked[0] || null;
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
  function canCompleteAndCash(r) {
    return isRdvActive(r) && r.status === RDV_STATUS.PENDING && !Number(r.encaisse);
  }
  function canCancelRdv(r) {
    return isRdvActive(r) && r.status === RDV_STATUS.PENDING;
  }
  function rdvActions(r) {
    return {
      completeAndCash: canCompleteAndCash(r),
      cancel: canCancelRdv(r),
      encaisse: Boolean(Number(r?.encaisse))
    };
  }

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
          encaissedRevenue: 0
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

  function groupRdvsByClientOnDate(date, rdvs = data.rdvs) {
    const dayRdvs = rdvsForDate(date, rdvs);
    const byClient = {};
    dayRdvs.forEach((r) => {
      const key = rdvNom(r).trim().toLowerCase() || "__sans_nom__";
      if (!byClient[key]) {
        byClient[key] = { client: rdvNom(r), rdvs: [], totalMontant: 0 };
      }
      byClient[key].rdvs.push(r);
      byClient[key].totalMontant += Number(r.montant || 0);
    });
    return Object.values(byClient);
  }

  function dayActivity(date) {
    const revenus = filterByDate(filterActive(data.revenus), date);
    const rdvs = rdvsForDate(date);
    const encaissed = sumMontant(revenus);
    const rdvGroups = groupRdvsByDate(rdvs)[date] || {
      date,
      rdvs: [],
      pending: 0,
      completed: 0,
      deleted: 0,
      estimatedRevenue: 0,
      encaissedRevenue: 0
    };
    const enrichedRdvs = rdvs.map((r) => ({
      rdv: r,
      actions: rdvActions(r),
      status: rdvStatusLabel(r),
      linkedRevenu: matchRdvToRevenu(r)
    }));
    return {
      date,
      revenus,
      rdvs: enrichedRdvs,
      rdvGroup: rdvGroups,
      encaissedRevenue: encaissed,
      pendingRevenue: rdvGroups.estimatedRevenue,
      totalRdvs: rdvs.length,
      totalRevenus: revenus.length
    };
  }

  function calendarDaySummary(date) {
    const dayRevenus = filterByDate(filterActive(data.revenus), date);
    const dayRdvs = filterByDate(activeRdvs(data.rdvs), date);
    const encaissed = sumMontant(dayRevenus);
    const pending = dayRdvs.filter((r) => r.status === RDV_STATUS.PENDING);
    const completed = dayRdvs.some((r) => r.status === RDV_STATUS.COMPLETED);
    return {
      date,
      encaissedRevenue: encaissed,
      hasPending: pending.length > 0,
      pendingCount: pending.length,
      hasCompleted: completed,
      hasDeleted: false
    };
  }

  function statsForMonth(key) {
    const revenus = filterByMonth(filterActive(data.revenus), key);
    const depenses = filterByMonth(filterActive(data.depenses), key);
    const revTotal = sumMontant(revenus);
    const depensesTotal = sumMontant(depenses);
    const benefice = profit(revTotal, depensesTotal, 1);
    const rdvsMonth = filterByMonth(data.rdvs, key);
    const pending = rdvsMonth.filter((r) => r.status === RDV_STATUS.PENDING && isRdvActive(r));
    return {
      monthKey: key,
      revenus: revTotal,
      depenses: depensesTotal,
      loyer: getLoyer(),
      benefice,
      volumeRevenus: revenus.length,
      rdvPending: pending.length,
      pipelineRevenue: sumMontant(pending)
    };
  }

  function allActivityMonthKeys({ archived = false } = {}) {
    const revenus = archived ? filterArchived(data.revenus) : filterActive(data.revenus);
    const depenses = archived ? filterArchived(data.depenses) : filterActive(data.depenses);
    return uniqueMonthKeys(revenus, depenses);
  }

  function cumulativeMonthKeys(upToKey = monthKey(today()), { archived = false } = {}) {
    const activityKeys = allActivityMonthKeys({ archived }).filter((k) => k <= upToKey);
    if (!activityKeys.length) return [];
    return monthsBetween(activityKeys[0], upToKey);
  }

  function statsForReport(type = REPORT_TYPES.CURRENT_MONTH) {
    const nowKey = monthKey(today());
    let title = "Mois actuel";
    let revenus = filterArchived(data.revenus);
    let depenses = filterArchived(data.depenses);
    let monthKeys = [];
    let rentMonths = 1;

    if (type === REPORT_TYPES.CURRENT_MONTH) {
      title = `Mois actuel — ${nowKey}`;
      revenus = filterByMonth(revenus, nowKey);
      depenses = filterByMonth(depenses, nowKey);
      monthKeys = [nowKey];
    } else {
      title = `Cumul jusqu'au mois présent — ${nowKey}`;
      revenus = filterUpToMonth(revenus, nowKey);
      depenses = filterUpToMonth(depenses, nowKey);
      monthKeys = cumulativeMonthKeys(nowKey, { archived: true });
      rentMonths = monthKeys.length || 1;
    }

    const totalRev = sumMontant(revenus);
    const totalDep = sumMontant(depenses);
    const totalRent = getLoyer() * rentMonths;
    const totalProfit = totalRev - totalDep - totalRent;
    const allRevenus = filterArchived(data.revenus);
    const allDepenses = filterArchived(data.depenses);
    const monthlyBreakdown = monthKeys.map((key) => {
      const rs = filterByMonth(allRevenus, key);
      const ds = filterByMonth(allDepenses, key);
      const rev = sumMontant(rs);
      const dep = sumMontant(ds);
      return {
        monthKey: key,
        revenus: rs,
        depenses: ds,
        revenusTotal: rev,
        depensesTotal: dep,
        loyer: getLoyer(),
        benefice: profit(rev, dep, 1)
      };
    });

    return {
      type,
      title,
      revenus,
      depenses,
      monthKeys,
      rentMonths,
      loyerUnit: getLoyer(),
      totalRev,
      totalDep,
      totalRent,
      totalProfit,
      monthlyBreakdown
    };
  }

  function rebuildSnapshot() {
    const nowKey = monthKey(today());
    snapshot = {
      version,
      loyer: getLoyer(),
      currentMonth: statsForMonth(nowKey),
      pendingRdvs: sortRdvs(rdvsPending()),
      rdvGroupsByDate: groupRdvsByDate()
    };
    return snapshot;
  }

  function getSnapshot() {
    if (!snapshot) rebuildSnapshot();
    return snapshot;
  }

  function sync({ revenus, depenses, rdvs, loyer } = {}) {
    if (revenus !== undefined) data.revenus = revenus;
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
    parseMoney,
    monthKey,
    today,
    sumMontant,
    profit,
    statsForMonth,
    statsForReport,
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
    canCompleteAndCash,
    canCancelRdv,
    activeRdvs,
    isRdvActive,
    matchRdvToRevenu,
    findClientPhone,
    groupRdvsByDate,
    dayActivity,
    calendarDaySummary,
    revNom,
    revTel,
    revGenre,
    rdvNom,
    rdvTel,
    rdvGenre
  };
})();

window.CalcPlatform = CalcPlatform;
