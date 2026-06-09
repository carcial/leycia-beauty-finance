/**
 * MonSalon — couche données Supabase v2
 */
const Data = (() => {
  const RENT_KEY = "monthly_rent";
  const DEFAULT_RENT = 250;

  let db = null;

  function parseMoney(v) {
    return parseFloat(String(v || "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
  }

  function normalizePhone(phone) {
    if (!phone || !String(phone).trim()) return null;
    const digits = String(phone).replace(/[\s\-().]/g, "").replace(/\D/g, "");
    return digits || null;
  }

  function normalizeRow(row) {
    if (!row) return row;
    const out = { ...row };
    if (typeof out.date === "string" && out.date.length > 10) out.date = out.date.slice(0, 10);
    if (out.montant != null) out.montant = Number(out.montant);
    if (out.encaisse != null) out.encaisse = out.encaisse ? 1 : 0;
    return out;
  }

  function init() {
    if (window.__CONFIG_MISSING__) throw new Error("Configuration Supabase manquante");
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
      throw new Error("Configuration Supabase manquante");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Configuration Supabase manquante");
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async function updateClientIfNeeded(client, { nom, genre, note }) {
    const patch = {};
    if (nom && nom.trim() && nom.trim() !== client.nom) patch.nom = nom.trim();
    if (genre != null && genre !== client.genre) patch.genre = genre;
    if (note != null && note !== client.note) patch.note = note;
    if (!Object.keys(patch).length) return client;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from("clients").update(patch).eq("id", client.id).select().single();
    if (error) throw error;
    return data;
  }

  async function getOrCreateClient({ nom, telephone, genre, note }) {
    const name = (nom || "").trim();
    if (!name) throw new Error("Le nom du client est requis.");
    const phone = normalizePhone(telephone);

    if (!phone) {
      return {
        clientId: null,
        client_nom_snapshot: name,
        telephone_snapshot: null,
        genre_snapshot: genre || ""
      };
    }

    const { data: existing, error: findErr } = await db
      .from("clients")
      .select("*")
      .eq("telephone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      await updateClientIfNeeded(existing, { nom: name, genre, note });
      return {
        clientId: existing.id,
        client_nom_snapshot: name,
        telephone_snapshot: phone,
        genre_snapshot: genre || existing.genre || ""
      };
    }

    const { data: created, error: insertErr } = await db
      .from("clients")
      .insert({ nom: name, telephone: phone, genre: genre || "", note: note || "" })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return {
      clientId: created.id,
      client_nom_snapshot: name,
      telephone_snapshot: phone,
      genre_snapshot: genre || ""
    };
  }

  async function loadSettings() {
    const { data, error } = await db.from("settings").select("key, value").eq("key", RENT_KEY).maybeSingle();
    if (error) throw error;
    if (!data) {
      await db.from("settings").upsert({ key: RENT_KEY, value: String(DEFAULT_RENT) }, { onConflict: "key" });
      return { monthlyRent: DEFAULT_RENT };
    }
    const rent = parseMoney(data.value);
    return { monthlyRent: rent > 0 ? rent : DEFAULT_RENT };
  }

  async function updateRent(amount) {
    const val = parseMoney(amount);
    if (val <= 0) throw new Error("Montant de loyer invalide.");
    const { error } = await db.from("settings").upsert({ key: RENT_KEY, value: String(val) }, { onConflict: "key" });
    if (error) throw error;
    return val;
  }

  async function loadClients() {
    const { data, error } = await db.from("clients").select("*").is("deleted_at", null).order("nom", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function loadRevenus() {
    const { data, error } = await db.from("revenus").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeRow);
  }

  async function addRevenue(row) {
    const resolved = await getOrCreateClient({
      nom: row.nom,
      telephone: row.telephone,
      genre: row.genre,
      note: row.note
    });
    const { data, error } = await db
      .from("revenus")
      .insert({
        date: row.date,
        client_id: resolved.clientId,
        client_nom_snapshot: resolved.client_nom_snapshot,
        telephone_snapshot: resolved.telephone_snapshot,
        genre_snapshot: resolved.genre_snapshot,
        montant: row.montant,
        note: row.note || "",
        rdv_id: row.rdv_id || null
      })
      .select()
      .single();
    if (error) throw error;
    return normalizeRow(data);
  }

  async function softDeleteRevenue(id) {
    const { error } = await db
      .from("revenus")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
  }

  async function loadDepenses() {
    const { data, error } = await db.from("depenses").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeRow);
  }

  async function addDepense(row) {
    const { data, error } = await db
      .from("depenses")
      .insert({ date: row.date, description: row.description, montant: row.montant })
      .select()
      .single();
    if (error) throw error;
    return normalizeRow(data);
  }

  async function softDeleteDepense(id) {
    const { error } = await db
      .from("depenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
  }

  async function loadRdvs() {
    const { data, error } = await db
      .from("rdvs")
      .select("*")
      .is("deleted_at", null)
      .order("date", { ascending: true })
      .order("heure", { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeRow);
  }

  async function addRdv(row) {
    const resolved = await getOrCreateClient({
      nom: row.nom,
      telephone: row.telephone,
      genre: row.genre,
      note: row.note
    });
    const { data, error } = await db
      .from("rdvs")
      .insert({
        date: row.date,
        heure: row.heure || "10:00",
        client_id: resolved.clientId,
        client_nom_snapshot: resolved.client_nom_snapshot,
        telephone_snapshot: resolved.telephone_snapshot,
        genre_snapshot: resolved.genre_snapshot,
        style: row.style || "",
        montant: row.montant,
        duree: row.duree || "",
        note: row.note || "",
        status: "pending",
        encaisse: false
      })
      .select()
      .single();
    if (error) throw error;
    return normalizeRow(data);
  }

  async function completeRdvAndCreateRevenue(rdv) {
    if (!rdv || rdv.deleted_at) throw new Error("Rendez-vous introuvable.");
    if (rdv.encaisse) throw new Error("Ce rendez-vous est déjà encaissé.");

    const { data: existing, error: checkErr } = await db
      .from("revenus")
      .select("id")
      .eq("rdv_id", rdv.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (checkErr) throw checkErr;
    if (existing) throw new Error("Ce rendez-vous a déjà été encaissé.");

    const note = [rdv.style, rdv.note].filter(Boolean).join(" | ") || "Rendez-vous honoré";
    const { error: insertErr } = await db.from("revenus").insert({
      date: rdv.date,
      client_id: rdv.client_id || null,
      client_nom_snapshot: rdv.client_nom_snapshot,
      telephone_snapshot: rdv.telephone_snapshot,
      genre_snapshot: rdv.genre_snapshot,
      montant: Number(rdv.montant),
      note,
      rdv_id: rdv.id
    });
    if (insertErr) throw insertErr;

    const { error: updateErr } = await db
      .from("rdvs")
      .update({ status: "completed", encaisse: true, completed_at: new Date().toISOString() })
      .eq("id", rdv.id)
      .eq("encaisse", false);
    if (updateErr) throw updateErr;
  }

  async function softDeleteRdv(id) {
    const { error } = await db
      .from("rdvs")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
  }

  async function loadAll() {
    const [settings, revenus, depenses, rdvs] = await Promise.all([
      loadSettings(),
      loadRevenus(),
      loadDepenses(),
      loadRdvs()
    ]);
    return { loyer: settings.monthlyRent, revenus, depenses, rdvs };
  }

  function generateReportData(reportType, { revenus, depenses, rdvs, loyer }) {
    CalcPlatform.sync({ revenus, depenses, rdvs, loyer });
    const type =
      reportType === "cumulativeToCurrent" ? CalcPlatform.REPORT_TYPES.CUMULATIVE : CalcPlatform.REPORT_TYPES.CURRENT_MONTH;
    return CalcPlatform.statsForReport(type);
  }

  return {
    DEFAULT_RENT,
    init,
    normalizePhone,
    getOrCreateClient,
    updateClientIfNeeded,
    loadSettings,
    updateRent,
    loadClients,
    loadRevenus,
    addRevenue,
    softDeleteRevenue,
    loadDepenses,
    addDepense,
    softDeleteDepense,
    loadRdvs,
    addRdv,
    completeRdvAndCreateRevenue,
    softDeleteRdv,
    loadAll,
    generateReportData
  };
})();
