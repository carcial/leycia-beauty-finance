const LOYER_DEFAUT = 250;
const PURGE_DAYS = 2;
const DB_STORE = "monsalon_db_v1";
const DB_BACKUP_KEY = "monsalon_db_backup_v1";
const IDB_NAME = "MonSalonDB";
const LEGACY_KEYS = {
  clients:"ms_clients_data_v4",
  depenses:"ms_depenses_data_v4",
  rdv:"ms_rdv_data_v4",
  loyer:"ms_loyer_fixe_v4"
};
const FORMAT_CAD = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} $`;
const FORMAT_CAD_EXPENSE = (n) => `−${Number(n || 0).toFixed(2).replace('.', ',')} $`;
const TODAY = () => new Date().toISOString().slice(0, 10);
const MONTH_KEY = (d) => (d || "").slice(0, 7);
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const JOURS_FR = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
const MONTH_LABEL = (key) => {
  if(!key) return "";
  const [y,m] = key.split("-");
  return `${MOIS_FR[parseInt(m)-1]} ${y}`;
};
const JOURS_COMPLETS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
function formatDateFR(dateStr){
  if(!dateStr) return "—";
  const [y,m,d]=dateStr.split("-");
  const dt=new Date(Number(y),Number(m)-1,Number(d));
  return `${JOURS_COMPLETS[dt.getDay()]} ${parseInt(d,10)} ${MOIS_FR[parseInt(m,10)-1]} ${y}`;
}
function formatHeureFR(heure){
  if(!heure) return "—";
  const [h,min]=heure.split(":");
  return `${h}h${min||"00"}`;
}
let db = null;
let dbReady = false;

const state = {
  tab:"tableau-bord",
  menu:false,
  toast:null,
  error:"",
  clients:[],
  depenses:[],
  rdvs:[],
  selectedDate:TODAY(),
  loyer: LOYER_DEFAUT,
  loyerDraft: String(LOYER_DEFAUT),
  dbSaved:true,
  persistError:"",
  calYear:new Date().getFullYear(),
  calMonth:new Date().getMonth(),
  showRdvModal:false,
  showClientForm:false,
  showDepForm:false,
  reportType:"currentMonth",
  reportMonth:MONTH_KEY(TODAY()),
  reportYear:String(new Date().getFullYear()),
  clientForm:{date:TODAY(),client:"",telephone:"",genre:"Femme",montant:"",note:""},
  depForm:{date:TODAY(),description:"",montant:""},
  rdvForm:{date:TODAY(),heure:"10:00",client:"",telephone:"",genre:"Femme",style:"",montant:"",duree:"1h00",dureeCustom:"",note:""}
};

function escapeHTML(v){return String(v??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function parseMoney(v){return parseFloat(String(v||"").replace(",",".").replace(/[^0-9.]/g,""))||0}
function notify(msg,ok=true){state.toast={msg,ok};render();setTimeout(()=>{state.toast=null;render()},3000)}

/* ── Persistance locale : IndexedDB + secours localStorage ── */
function appBasePath(){
  const path=window.location.pathname.replace(/\/[^/]*$/,"");
  return path.endsWith("/")?path:`${path}/`;
}
function sqlAssetPath(file){
  return `${appBasePath()}vendor/sql.js/${file}`;
}
function normalizeDbBytes(saved){
  if(!saved) return null;
  if(saved instanceof Uint8Array) return saved;
  if(saved instanceof ArrayBuffer) return new Uint8Array(saved);
  if(ArrayBuffer.isView(saved)) return new Uint8Array(saved.buffer, saved.byteOffset, saved.byteLength);
  if(Array.isArray(saved)) return Uint8Array.from(saved);
  return null;
}
function bytesToBase64(bytes){
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}
function base64ToBytes(b64){
  const binary=atob(b64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function readLocalBackup(){
  try{
    const b64=localStorage.getItem(DB_BACKUP_KEY);
    return b64?normalizeDbBytes(base64ToBytes(b64)):null;
  }catch(e){
    console.warn("Lecture backup localStorage impossible", e);
    return null;
  }
}
function writeLocalBackup(bytes){
  try{
    localStorage.setItem(DB_BACKUP_KEY, bytesToBase64(bytes));
    return true;
  }catch(e){
    console.warn("Écriture backup localStorage impossible", e);
    return false;
  }
}
function idbSupported(){
  return typeof indexedDB!=="undefined";
}
function idbOpen(){
  return new Promise((resolve,reject)=>{
    if(!idbSupported()){reject(new Error("IndexedDB indisponible"));return}
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbGet(key){
  const idb=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=idb.transaction("files","readonly");
    const req=tx.objectStore("files").get(key);
    req.onsuccess=()=>resolve(normalizeDbBytes(req.result));
    req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key,val){
  const idb=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=idb.transaction("files","readwrite");
    tx.objectStore("files").put(val,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function loadSavedDatabase(){
  let saved=null;
  let source="new";
  if(idbSupported()){
    try{
      saved=await idbGet(DB_STORE);
      if(saved) source="indexeddb";
    }catch(e){
      console.warn("IndexedDB lecture échouée, tentative backup localStorage", e);
    }
  }
  if(!saved){
    saved=readLocalBackup();
    if(saved) source="localstorage";
  }
  return {saved, source};
}
async function requestPersistentStorage(){
  try{
    if(navigator.storage&&navigator.storage.persist){
      await navigator.storage.persist();
    }
  }catch(e){
    console.warn("Demande de stockage persistant ignorée", e);
  }
}

/* ── SQLite (sql.js) + IndexedDB — persistance locale, compatible GitHub Pages ── */
let persistChain = Promise.resolve();

function dbExec(sql,params=[]){
  db.run(sql,params);
}
function queuePersist(){
  persistChain = persistChain
    .then(() => persistDb())
    .catch(e => {
      console.error("Échec de sauvegarde locale", e);
      state.dbSaved=false;
      state.persistError="Les données n'ont pas pu être sauvegardées sur cet appareil.";
      render();
    });
  return persistChain;
}
async function dbRun(sql,params=[]){
  dbExec(sql,params);
  await queuePersist();
}
function dbGet(sql,params=[]){
  const stmt=db.prepare(sql);
  stmt.bind(params);
  if(!stmt.step()){stmt.free();return null}
  const row=stmt.getAsObject();
  stmt.free();
  return row;
}
function dbAll(sql,params=[]){
  const stmt=db.prepare(sql);
  stmt.bind(params);
  const rows=[];
  while(stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function dbScalar(sql,params=[]){
  const row=dbGet(sql,params);
  return row?Object.values(row)[0]:null;
}
async function persistDb(){
  if(!db) return;
  const data=db.export();
  state.dbSaved=false;
  state.persistError="";
  let saved=false;

  if(idbSupported()){
    try{
      await idbSet(DB_STORE,data);
      saved=true;
    }catch(e){
      console.warn("IndexedDB écriture échouée", e);
    }
  }

  const backupOk=writeLocalBackup(data);
  if(backupOk) saved=true;

  if(!saved){
    state.dbSaved=false;
    state.persistError="Impossible de sauvegarder les données sur cet appareil.";
    throw new Error(state.persistError);
  }

  state.dbSaved=true;
  state.persistError="";
}
function ensureClientColumns(){
  try{
    let cols=dbAll("PRAGMA table_info(clients)");
    if(!cols.some(c=>c.name==="rdv_id")){
      dbExec("ALTER TABLE clients ADD COLUMN rdv_id INTEGER");
      cols=dbAll("PRAGMA table_info(clients)");
    }
    if(!cols.some(c=>c.name==="telephone")){
      dbExec("ALTER TABLE clients ADD COLUMN telephone TEXT");
    }
  }catch(e){console.warn("Migration clients ignorée",e)}
}
function ensureRdvTelephoneColumn(){
  try{
    const cols=dbAll("PRAGMA table_info(rdvs)");
    if(!cols.some(c=>c.name==="telephone")){
      dbExec("ALTER TABLE rdvs ADD COLUMN telephone TEXT");
    }
  }catch(e){console.warn("Migration rdvs telephone ignorée",e)}
}
function ensureSoftDeleteColumns(){
  try{
    let cols=dbAll("PRAGMA table_info(clients)");
    if(!cols.some(c=>c.name==="deleted_at")){
      dbExec("ALTER TABLE clients ADD COLUMN deleted_at TEXT");
    }
    cols=dbAll("PRAGMA table_info(depenses)");
    if(!cols.some(c=>c.name==="deleted_at")){
      dbExec("ALTER TABLE depenses ADD COLUMN deleted_at TEXT");
    }
  }catch(e){console.warn("Migration soft-delete ignorée",e)}
}
function createSchema(){
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL, client TEXT NOT NULL,
    telephone TEXT, genre TEXT, montant REAL NOT NULL, note TEXT, rdv_id INTEGER, deleted_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS depenses (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL, montant REAL NOT NULL, deleted_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS rdvs (
    id INTEGER PRIMARY KEY, date TEXT NOT NULL, heure TEXT, client TEXT NOT NULL,
    telephone TEXT, genre TEXT, style TEXT, montant REAL NOT NULL, duree TEXT, note TEXT,
    status TEXT NOT NULL DEFAULT 'pending', encaisse INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT, deleted_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
}
function migrateFromLocalStorage(){
  if(dbGet("SELECT value FROM settings WHERE key='migrated_v5'")) return;
  try{
    const clients=JSON.parse(localStorage.getItem(LEGACY_KEYS.clients)||"[]");
    const depenses=JSON.parse(localStorage.getItem(LEGACY_KEYS.depenses)||"[]");
    const rdvs=JSON.parse(localStorage.getItem(LEGACY_KEYS.rdv)||"[]");
    const loyer=localStorage.getItem(LEGACY_KEYS.loyer)||String(LOYER_DEFAUT);
    clients.forEach(c=>dbExec("INSERT INTO clients(id,date,client,genre,montant,note) VALUES(?,?,?,?,?,?)",
      [c.id,c.date,c.client,c.genre||"",Number(c.montant||0),c.note||""]));
    depenses.forEach(d=>dbExec("INSERT INTO depenses(id,date,description,montant) VALUES(?,?,?,?)",
      [d.id,d.date,d.description,Number(d.montant||0)]));
    rdvs.forEach(r=>{
      const status=r.complete?"completed":"pending";
      dbExec(`INSERT INTO rdvs(id,date,heure,client,genre,style,montant,duree,note,status,encaisse,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.id,r.date,r.heure||"",r.client,r.genre||"",r.style||"",Number(r.montant||0),r.duree||"",r.note||"",
         status,0,status==="completed"?TODAY():null]);
    });
    dbExec("INSERT OR REPLACE INTO settings(key,value) VALUES('loyer',?)",[loyer]);
    dbExec("INSERT OR REPLACE INTO settings(key,value) VALUES('migrated_v5','1')");
  }catch(e){console.warn("Migration localStorage ignorée",e)}
}
function purgeOldRdvs(){
  const deletedCount=Number(dbScalar(`SELECT COUNT(*) FROM rdvs WHERE status='deleted'
    AND deleted_at IS NOT NULL
    AND date(deleted_at) <= date('now', '-${PURGE_DAYS} days')`)||0);
  const completedCount=Number(dbScalar(`SELECT COUNT(*) FROM rdvs WHERE status='completed'
    AND date(COALESCE(completed_at, date)) <= date('now', '-${PURGE_DAYS} days')`)||0);
  if(!deletedCount && !completedCount) return Promise.resolve();
  if(deletedCount){
    dbExec(`DELETE FROM rdvs WHERE status='deleted'
      AND deleted_at IS NOT NULL
      AND date(deleted_at) <= date('now', '-${PURGE_DAYS} days')`);
  }
  if(completedCount){
    dbExec(`DELETE FROM rdvs WHERE status='completed'
      AND date(COALESCE(completed_at, date)) <= date('now', '-${PURGE_DAYS} days')`);
  }
  return queuePersist();
}async function syncStateFromDb(){
  await purgeOldRdvs();
  state.clients=dbAll("SELECT * FROM clients ORDER BY id DESC");
  state.depenses=dbAll("SELECT * FROM depenses ORDER BY id DESC");
  state.rdvs=dbAll("SELECT * FROM rdvs ORDER BY date ASC, heure ASC");
  const loyerVal=parseMoney(dbScalar("SELECT value FROM settings WHERE key='loyer'")||LOYER_DEFAUT);
  state.loyer=loyerVal>0?loyerVal:LOYER_DEFAUT;
  state.loyerDraft=String(state.loyer);
  state.calc=CalcPlatform.sync({
    clients:state.clients,
    depenses:state.depenses,
    rdvs:state.rdvs,
    loyer:state.loyer
  });
}
async function initDb(){
  document.getElementById("root").innerHTML=`<div class="loading-screen"><img src="assets/logo.png?v=6" alt="Leycia beauty" style="max-width:200px;width:80%;height:auto;object-fit:contain"><div>Chargement de la base de données…</div></div>`;
  await requestPersistentStorage();
  const SQL=await initSqlJs({locateFile:sqlAssetPath});
  const {saved, source}=await loadSavedDatabase();
  db=saved?new SQL.Database(saved):new SQL.Database();
  if(!saved) createSchema();
  else if(source==="localstorage"){
    console.info("Base restaurée depuis la sauvegarde localStorage");
  }
  ensureClientColumns();
  ensureRdvTelephoneColumn();
  ensureSoftDeleteColumns();
  migrateFromLocalStorage();
  await persistDb();
  await syncStateFromDb();
  dbReady=true;
  render();
}
async function save(){await syncStateFromDb()}
async function load(){if(dbReady) await syncStateFromDb();render()}

function calcSnap(){return state.calc||CalcPlatform.getSnapshot()}
function pendingRdvs(){return calcSnap().pendingRdvs}
function sortedRdvs(){return CalcPlatform.sortRdvs(state.rdvs)}
function activeClients(){return CalcPlatform.filterActive(state.clients)}
function activeDepenses(){return CalcPlatform.filterActive(state.depenses)}

function setTab(id){state.tab=id;state.menu=false;state.error="";render()}
function updateForm(form,key,val){state[form][key]=val}
function updateFormAndRender(form,key,val){state[form][key]=val;render()}
function openRdvModal(date){
  state.selectedDate=date;
  state.rdvForm={...state.rdvForm,date};
  state.showRdvModal=true;
  state.error="";
  render();
}
function closeModal(){state.showRdvModal=false;state.error="";render()}

async function addClient(){
  const f=state.clientForm, name=(f.client||"").trim(), amount=parseMoney(f.montant);
  if(!name){state.error="Le nom ou l'identifiant du client est requis.";return render()}
  if(!f.date){state.error="La date est obligatoire.";return render()}
  if(amount<=0){state.error="Veuillez saisir un montant valide.";return render()}
  const id=Date.now();
  state.dbSaved=false; render();
  const phone=(f.telephone||"").trim();
  await dbRun("INSERT INTO clients(id,date,client,telephone,genre,montant,note) VALUES(?,?,?,?,?,?,?)",
    [id,f.date,name,phone,f.genre||"",amount,f.note||""]);
  state.clientForm={date:TODAY(),client:"",telephone:"",genre:"Femme",montant:"",note:""};
  state.showClientForm=false;state.error="";await syncStateFromDb();notify("Entrée client enregistrée.");
}
async function addDepense(){
  const f=state.depForm, desc=(f.description||"").trim(), amount=parseMoney(f.montant);
  if(!desc){state.error="La description est requise.";return render()}
  if(!f.date){state.error="La date est obligatoire.";return render()}
  if(amount<=0){state.error="Veuillez saisir un montant positif.";return render()}
  state.dbSaved=false; render();
  await dbRun("INSERT INTO depenses(id,date,description,montant) VALUES(?,?,?,?)",[Date.now(),f.date,desc,amount]);
  state.depForm={date:TODAY(),description:"",montant:""};
  state.showDepForm=false;state.error="";await syncStateFromDb();notify("Dépense ajoutée.");
}
async function addRdv(){
  const f=state.rdvForm, name=(f.client||"").trim(), amount=parseMoney(f.montant);
  if(!name){state.error="Le nom du client est obligatoire pour réserver.";return render()}
  if(!f.date){state.error="La date du rendez-vous doit être définie.";return render()}
  if(amount<=0){state.error="Veuillez indiquer un prix estimé.";return render()}
  const dureeFinale=f.duree==="custom"?(f.dureeCustom||"Durée personnalisée"):f.duree;
  state.dbSaved=false; render();
  const phone=(f.telephone||"").trim();
  await dbRun(`INSERT INTO rdvs(id,date,heure,client,telephone,genre,style,montant,duree,note,status,encaisse)
    VALUES(?,?,?,?,?,?,?,?,?,?,'pending',0)`,
    [Date.now(),f.date,f.heure||"10:00",name,phone,f.genre||"",f.style||"",amount,dureeFinale,f.note||""]);
  state.rdvForm={date:state.selectedDate||TODAY(),heure:"10:00",client:"",telephone:"",genre:"Femme",style:"",montant:"",duree:"1h00",dureeCustom:"",note:""};
  state.showRdvModal=false;state.error="";await syncStateFromDb();notify("Rendez-vous ajouté à l'agenda.");
}
async function terminerRdv(id){
  const r=state.rdvs.find(x=>x.id===id); if(!CalcPlatform.canTerminer(r)) return;
  if(!confirm(`Marquer le rendez-vous de ${r.client} comme terminé ?`)) return;
  state.dbSaved=false; render();
  await dbRun("UPDATE rdvs SET status='completed', completed_at=? WHERE id=?",[TODAY(),id]);
  await syncStateFromDb();notify("Tâche accomplie — le rendez-vous sera retiré automatiquement dans 2 jours.");
}
async function encaisserRdv(id){
  const r=state.rdvs.find(x=>x.id===id); if(!r) return;
  if(r.status==="deleted"){notify("Ce rendez-vous est supprimé.",false);return render()}
  if(!CalcPlatform.canEncaisser(r)){
    if(r.status==="pending") notify("Terminez d'abord le rendez-vous avant d'encaisser.",false);
    else notify("Ce rendez-vous est déjà encaissé.",false);
    return render();
  }
  if(!confirm(`Encaisser ${FORMAT_CAD(r.montant)} pour ${r.client} ?`)) return;
  state.dbSaved=false; render();
  await dbRun("INSERT INTO clients(id,date,client,telephone,genre,montant,note,rdv_id) VALUES(?,?,?,?,?,?,?,?)",
    [Date.now(),r.date,r.client,(r.telephone||"").trim(),r.genre||"",Number(r.montant),[r.style,r.note].filter(Boolean).join(" | ")||"Rendez-vous honoré",id]);
  await dbRun("UPDATE rdvs SET encaisse=1 WHERE id=?",[id]);
  await syncStateFromDb();notify("Montant encaissé et ajouté aux revenus.");
}
async function deleteRdv(id){
  const r=state.rdvs.find(x=>x.id===id); if(!CalcPlatform.canAnnuler(r)) return;
  if(!confirm(`Annuler le rendez-vous de ${r.client} ? Il sera supprimé définitivement.`)) return;
  state.dbSaved=false; render();
  await dbRun("DELETE FROM rdvs WHERE id=?",[id]);
  await syncStateFromDb();notify("Rendez-vous annulé et supprimé.",false);
}
async function dismissCompletedRdv(id){
  const r=state.rdvs.find(x=>x.id===id); if(!CalcPlatform.canDismissCompleted(r)) return;
  if(!confirm(`Retirer définitivement le rendez-vous terminé de ${r.client} ?`)) return;
  state.dbSaved=false; render();
  await dbRun("DELETE FROM rdvs WHERE id=?",[id]);
  await syncStateFromDb();notify("Rendez-vous retiré de l'agenda.");
}
async function deleteClient(id){
  if(!confirm("Retirer cette entrée de la caisse ?\n\nElle disparaîtra des totaux du mois en cours, mais restera dans l'historique et les rapports cumulés.")) return;
  state.dbSaved=false; render();
  await dbRun("UPDATE clients SET deleted_at=? WHERE id=? AND deleted_at IS NULL",[new Date().toISOString(),id]);
  await syncStateFromDb();
  notify("Entrée retirée de la caisse. L'historique cumulé est conservé.");
}
async function deleteDepense(id){
  if(!confirm("Retirer cette dépense de la caisse ?\n\nElle disparaîtra des totaux du mois en cours, mais restera dans l'historique et les rapports cumulés.")) return;
  state.dbSaved=false; render();
  await dbRun("UPDATE depenses SET deleted_at=? WHERE id=? AND deleted_at IS NULL",[new Date().toISOString(),id]);
  await syncStateFromDb();
  notify("Dépense retirée de la caisse. L'historique cumulé est conservé.");
}
async function updateRent(){
  const result=CalcPlatform.setLoyer(state.loyerDraft);
  if(!result.ok){state.error="Veuillez entrer un montant de loyer valide.";return render()}
  state.dbSaved=false; render();
  await dbRun("INSERT OR REPLACE INTO settings(key,value) VALUES('loyer',?)",[String(result.loyer)]);
  state.loyer=result.loyer;
  state.loyerDraft=String(result.loyer);
  state.error="";
  await syncStateFromDb();
  notify("Dépense fixe / loyer mis à jour. Tous les calculs de la plateforme ont été recalculés.");
}

function dateParts(date){const [y,m,d]=date.split("-");return {y:Number(y),m:Number(m),d:Number(d)}}
function changeMonth(delta){state.selectedDate=null;let m=state.calMonth+delta;if(m<0){m=11;state.calYear--}if(m>11){m=0;state.calYear++}state.calMonth=m;render()}
function selectDateFromCalendar(date){state.selectedDate=state.selectedDate===date?null:date;render()}

function reportData(){
  const type=state.reportType==="cumulativeToCurrent"
    ? CalcPlatform.REPORT_TYPES.CUMULATIVE
    : CalcPlatform.REPORT_TYPES.CURRENT_MONTH;
  const r=CalcPlatform.statsForReport(type);
  return {
    title:r.title.replace(MONTH_KEY(TODAY()),MONTH_LABEL(MONTH_KEY(TODAY()))),
    clients:r.clients,
    depenses:r.depenses,
    keys:[...r.monthKeys].reverse(),
    totalRev:r.totalRev,
    totalDep:r.totalDep,
    totalRent:r.totalRent,
    rentMonths:r.rentMonths,
    totalProfit:r.totalProfit,
    monthlyBreakdown:r.monthlyBreakdown
  };
}
function exportWord(){
  const data=reportData();
  let body="";
  data.monthlyBreakdown.slice().reverse().forEach(m=>{
    const key=m.monthKey, cs=m.clients, ds=m.depenses;
    body+=`<h2>${MONTH_LABEL(key)}</h2><div class="summary"><span>Revenus: <b>${FORMAT_CAD(m.revenus)}</b></span><span>Dépenses: <b>${FORMAT_CAD(m.depensesTotal)}</b></span><span>Loyer: <b>${FORMAT_CAD_EXPENSE(m.loyer)}</b></span><span>Bénéfice: <b>${FORMAT_CAD(m.benefice)}</b></span></div>`;
    if(cs.length){body+=`<h3>Revenus clients</h3><table><tr><th>Date</th><th>Client</th><th>Téléphone</th><th>Genre</th><th>Note</th><th>Montant</th><th>Statut</th></tr>${cs.map(c=>`<tr><td>${c.date}</td><td>${escapeHTML(c.client)}</td><td>${escapeHTML(c.telephone||"—")}</td><td>${escapeHTML(c.genre||"")}</td><td>${escapeHTML(c.note||"")}</td><td>${FORMAT_CAD(c.montant)}</td><td>${c.deleted_at?"Retiré de la caisse":"Actif"}</td></tr>`).join("")}</table>`}
    if(ds.length){body+=`<h3>Dépenses</h3><table><tr><th>Date</th><th>Description</th><th>Montant</th><th>Statut</th></tr>${ds.map(d=>`<tr><td>${d.date}</td><td>${escapeHTML(d.description)}</td><td>${FORMAT_CAD(d.montant)}</td><td>${d.deleted_at?"Retiré de la caisse":"Actif"}</td></tr>`).join("")}</table>`}
  });
  const doc=`<html><head><meta charset="utf-8"><style>body{font-family:Segoe UI,Arial,sans-serif;margin:40px;color:#334155;background:#fff}h1{text-align:center;color:#5B21B6}h2{color:#5B21B6;border-left:4px solid #6D28D9;padding-left:10px;margin-top:30px}h3{font-size:13px;text-transform:uppercase;color:#64748b}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th{background:#F5F3FF;color:#5B21B6;padding:8px;text-align:left;border-bottom:2px solid #E5E7EB}td{padding:8px;border-bottom:1px solid #F3F4F6}.summary{display:flex;gap:16px;flex-wrap:wrap;background:#F5F3FF;border:1px solid #E5E7EB;padding:10px;border-radius:6px}.total{background:#5B21B6;color:#fff;padding:20px;border-radius:8px;margin-top:35px}</style></head><body><h1>Leycia beauty — ${data.title}</h1><p style="text-align:center;color:#64748b">Généré le ${new Date().toLocaleDateString("fr-CA")} · Loyer unitaire : ${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())}/mois</p>${body||"<p>Aucune donnée disponible.</p>"}<div class="total"><h2 style="color:white;border:0;padding:0">Récapitulatif</h2><p>Total revenus : <b>${FORMAT_CAD(data.totalRev)}</b></p><p>Total dépenses : <b>${FORMAT_CAD(data.totalDep)}</b></p><p>Total loyer (${data.rentMonths} mois) : <b>${FORMAT_CAD_EXPENSE(data.totalRent)}</b></p><p><b>Bénéfice net : ${FORMAT_CAD(data.totalProfit)}</b></p></div></body></html>`;
  const blob=new Blob([doc],{type:"application/msword"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`rapport_salon_${state.reportType}_${TODAY()}.doc`;
  a.click();
}

function render(){
  if(!dbReady) return;
  document.getElementById("root").innerHTML=`
    ${state.toast?`<div class="toast ${state.toast.ok?"":"error"}">${escapeHTML(state.toast.msg)}</div>`:""}
    <div class="mobile-bar"><div class="mobile-brand"><img src="assets/logo.png?v=6" alt="Leycia beauty"><span class="mobile-brand-name">Mon activité</span></div><button class="menu-btn" onclick="state.menu=!state.menu;render()">${state.menu?"×":"☰"}</button></div>
    <div class="overlay ${state.menu?"show":""}" onclick="state.menu=false;render()"></div>
    ${state.showRdvModal?rdvModal():""}
    <div class="app">
      <aside class="sidebar ${state.menu?"open":""}">
        <div class="brand"><div class="brand-logo-wrap"><img class="brand-logo" src="assets/logo.png?v=6" alt="Leycia beauty"></div><span class="brand-tagline">Mon activité</span></div>
        <nav class="nav">${navHTML()}</nav>
        <div class="sidebar-footer">🏠 Frais de chaise fixes :<br><b>${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())} / mois</b><br><span class="sidebar-note">${state.persistError?`⚠️ ${escapeHTML(state.persistError)}`:state.dbSaved?"💾 Données sauvegardées sur cet appareil":"⏳ Sauvegarde en cours…"}</span></div>
      </aside>
      <main>${page()}</main>
    </div>
  `;
}
function navHTML(){
  const badge=pendingRdvs().length;
  const items=[
    ["tableau-bord","▦","Tableau de bord"],
    ["rdv-agenda","♙","Agenda & RDV",badge],
    ["clients-liste","$","Entrées Clients"],
    ["depenses-liste","▣","Dépenses Salon"],
    ["rapport-word","▤","Export Word"]
  ];
  return items.map(([id,ic,lbl,b])=>`<button class="${state.tab===id?"active":""}" onclick="setTab('${id}')"><span class="nav-icon">${ic}</span><span>${lbl}</span>${b?`<span class="badge">${b}</span>`:""}</button>`).join("");
}
function page(){
  if(state.tab==="tableau-bord")return dashboard();
  if(state.tab==="rdv-agenda")return agenda();
  if(state.tab==="clients-liste")return clientsPage();
  if(state.tab==="depenses-liste")return depensesPage();
  if(state.tab==="rapport-word")return rapportPage();
}
function pageHead(title,sub,actions=""){return `<div class="page-head"><div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${actions?`<div class="actions">${actions}</div>`:""}</div>`}
function kpi(label,val,color,hint="",extraClass=""){return `<div class="kpi ${extraClass}">${extraClass==="kpi-benefice"?`<div class="kpi-benefice-info"><div class="kpi-label">${label}</div>${hint?`<div class="kpi-hint">${hint}</div>`:""}</div><div class="kpi-value" style="color:${color}">${val}</div>`:`<div class="kpi-label">${label}</div><div class="kpi-value" style="color:${color}">${val}</div>${hint?`<div class="kpi-hint">${hint}</div>`:""}`}</div>`}

function dashboard(){
  const cle=MONTH_KEY(TODAY()), st=calcSnap().currentMonth;
  const prochains=pendingRdvs().slice(0,4);
  return `
  ${pageHead("Résumé de votre activité",`Période en cours : ${MONTH_LABEL(cle)}`,`<button class="btn" onclick="setTab('rdv-agenda')">Voir l’agenda</button>`)}
  <div class="grid-kpi">
    ${kpi("Revenus Clients",FORMAT_CAD(st.revenus),"var(--success)",`${st.volumeClients} entrée(s)`)}
    ${kpi("Dépenses Matériel",FORMAT_CAD(st.depenses),"var(--warning)","Hors loyer fixe")}
    ${st.rdvPending?kpi("Pipeline RDV",FORMAT_CAD(st.pipelineRevenue),"var(--purple)",`${st.rdvPending} RDV à venir (non encaissés)`):""}
    ${kpi("Bénéfice Réel Net",FORMAT_CAD(st.benefice),st.benefice>=0?"var(--success)":"var(--danger)","Revenus - dépenses - loyer","kpi-benefice")}
  </div>
  <div class="panel rent-panel">
    <div class="rent-panel-inner">
      <div class="rent-panel-main">
        <div class="kpi-label">Loyer / dépense fixe retenue</div>
        <div class="kpi-value kpi-rent">${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())}</div>
        <div class="kpi-hint">Déduit automatiquement chaque mois — tableau de bord, agenda et rapports.</div>
      </div>
      <div class="rent-panel-controls">
        <input type="number" min="0" step="0.01" class="rent-input" value="${escapeHTML(state.loyerDraft)}" oninput="state.loyerDraft=this.value">
        <button class="btn secondary btn-compact" onclick="updateRent()">Modifier</button>
      </div>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><div><h2>Prochains rendez-vous</h2><p class="subtitle">Les dates les plus proches apparaissent ici pour un meilleur suivi.</p></div></div>${prochains.length?`<div class="cards-list">${prochains.map(rdvCard).join("")}</div>`:`<p class="empty">Aucun rendez-vous à venir.</p>`}</div>
  <div class="panel"><h2>Dernières entrées de caisse</h2>${clientsTable(activeClients().slice(0,6),false)}</div>`;
}

function agenda(){
  return `
    ${pageHead("Agenda & rendez-vous","Clique sur une date du calendrier. Le rendez-vous se prend depuis la date sélectionnée.")}
    <div class="agenda-layout">
      <div class="panel">
        <div class="calendar-toolbar">
          <button class="icon-btn" onclick="changeMonth(-1)">‹</button>
          <h2>${MOIS_FR[state.calMonth]} ${state.calYear}</h2>
          <button class="icon-btn" onclick="changeMonth(1)">›</button>
        </div>
        ${calendarGrid()}
        <p class="subtitle" style="margin-top:12px">Point orange : RDV prévu · point vert : terminé (retiré après ${PURGE_DAYS} jours) · montant vert : revenu encaissé.</p>
      </div>
      <div class="selected-day-panel">${selectedDayPanel()}</div>
    </div>
  `;
}
function calendarGrid(){
  const first=new Date(state.calYear,state.calMonth,1).getDay();
  const total=new Date(state.calYear,state.calMonth+1,0).getDate();
  let html=JOURS_FR.map(j=>`<div class="cal-head">${j}</div>`).join("");
  for(let i=0;i<first;i++)html+="<div></div>";
  for(let d=1;d<=total;d++){
    const date=`${state.calYear}-${String(state.calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const day=CalcPlatform.calendarDaySummary(date);
    const selected=state.selectedDate===date;
    const today=date===TODAY();
    html+=`<div class="cal-cell ${selected?"selected":""} ${today?"today":""} ${day.hasPending?"has-rdv":""}" onclick="selectDateFromCalendar('${date}')">
      <span class="cal-day">${d}</span>
      ${day.encaissedRevenue?`<span class="day-rev">+${day.encaissedRevenue.toFixed(0)}$</span>`:""}
      <span class="dot-row">${day.hasPending?`<span class="dot" title="RDV prévu"></span><span class="day-count">${day.pendingCount} RDV</span>`:""}${day.hasCompleted?`<span class="dot green-dot" title="RDV terminé"></span>`:""}${day.hasDeleted?`<span class="dot red-dot" title="RDV supprimé"></span>`:""}</span>
    </div>`;
  }
  return `<div class="cal-grid">${html}</div>`;
}
function selectedDayPanel(){
  const date=state.selectedDate;
  if(!date)return `<h2>Aucune date sélectionnée</h2><p class="subtitle">Clique sur une date du calendrier pour voir les revenus et rendez-vous de cette journée, puis prendre un rendez-vous pour ce jour.</p>`;
  const activity=CalcPlatform.dayActivity(date);
  const {clients:c, rdvs:r, encaissedRevenue:total, pendingRevenue, rdvGroup}=activity;
  const groupHint=rdvGroup.pending?` · ${FORMAT_CAD(pendingRevenue)} en attente d'encaissement`:"";
  return `<div class="panel-head"><div><h2>${formatDateFR(date)}</h2><p class="subtitle">${c.length} revenu(s) · ${r.length} rendez-vous · ${FORMAT_CAD(total)} encaissé${groupHint}</p></div><button class="btn" onclick="openRdvModal('${date}')">Prendre rendez-vous</button></div>
    ${!c.length&&!r.length?`<p class="empty">Rien n’est encore enregistré pour ce jour.</p>`:""}
    ${r.length?`<h3 style="margin-bottom:10px">Rendez-vous (${rdvGroup.pending} prévu(s) · ${rdvGroup.completed} terminé(s))</h3><div class="cards-list" style="margin-bottom:18px">${r.map(x=>rdvCard(x.rdv,x)).join("")}</div>`:""}
    ${c.length?`<h3 style="margin-bottom:10px">Revenus encaissés</h3>${clientsTable(c,false)}`:""}`;
}
function rdvModal(){
  const f=state.rdvForm;
  const durees=["30 min","45 min","1h00","1h30","2h00","2h30","3h00","4h00","5h00","6h00","7h00","10h et +","custom"];
  return `<div class="modal-backdrop" onclick="if(event.target.className==='modal-backdrop')closeModal()">
    <div class="modal rdv-modal">
      <div class="modal-head"><div><h2>Prendre un rendez-vous</h2><p class="subtitle">Remplissez les informations ci-dessous pour réserver.</p></div><button class="close-btn" onclick="closeModal()">×</button></div>

      <div class="rdv-date-banner">
        <div class="rdv-date-banner-item">
          <span class="rdv-meta-label">Date</span>
          <span class="rdv-meta-value">${formatDateFR(f.date)}</span>
        </div>
        <div class="rdv-date-banner-item">
          <span class="rdv-meta-label">Heure</span>
          <input type="time" class="rdv-time-inline" value="${f.heure}" onchange="updateForm('rdvForm','heure',this.value)">
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">Client</h3>
        <div class="form-grid">
          <div><label>Client / Identifiant *</label><input value="${escapeHTML(f.client)}" placeholder="Nom du client..." oninput="updateForm('rdvForm','client',this.value)"></div>
          <div><label>Téléphone</label><input type="tel" value="${escapeHTML(f.telephone)}" placeholder="(514) 555-1234" oninput="updateForm('rdvForm','telephone',this.value)"></div>
          <div><label>Genre / catégorie</label><select onchange="updateForm('rdvForm','genre',this.value)"><option ${f.genre==="Femme"?"selected":""}>Femme</option><option ${f.genre==="Homme"?"selected":""}>Homme</option><option ${f.genre==="Enfant"?"selected":""}>Enfant</option><option ${f.genre==="Autre"?"selected":""}>Autre</option></select></div>
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">Prestation</h3>
        <div class="form-grid">
          <div class="field full"><label>Style / Coiffure</label><input value="${escapeHTML(f.style)}" placeholder="Tresses, coupe, coloration, tissage..." oninput="updateForm('rdvForm','style',this.value)"></div>
          <div><label>Durée estimée</label><select onchange="updateFormAndRender('rdvForm','duree',this.value)">${durees.map(d=>`<option value="${d}" ${f.duree===d?"selected":""}>${d==="custom"?"Durée personnalisée":d}</option>`).join("")}</select></div>
          ${f.duree==="custom"?`<div><label>Durée personnalisée</label><input value="${escapeHTML(f.dureeCustom)}" placeholder="Ex: 8h, 1h15, journée..." oninput="updateForm('rdvForm','dureeCustom',this.value)"></div>`:""}
          <div><label>Prix estimé (CAD) *</label><input type="number" value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('rdvForm','montant',this.value)"></div>
        </div>
      </div>

      <div class="form-section">
        <h3 class="form-section-title">Planification</h3>
        <div class="form-grid">
          <div><label>Date du rendez-vous *</label><input type="date" value="${f.date}" onchange="updateFormAndRender('rdvForm','date',this.value)"></div>
          <div class="field full"><label>Notes complémentaires</label><textarea placeholder="Précisions, préférence, matériel à prévoir..." oninput="updateForm('rdvForm','note',this.value)">${escapeHTML(f.note)}</textarea></div>
        </div>
      </div>

      ${state.error?`<div class="error">⚠️ ${escapeHTML(state.error)}</div>`:""}
      <button class="btn dark" onclick="addRdv()">Enregistrer le rendez-vous</button>
    </div>
  </div>`;
}
function rdvCard(r, enriched){
  const meta=enriched||{status:CalcPlatform.rdvStatusLabel(r),actions:CalcPlatform.rdvActions(r),linkedClient:CalcPlatform.matchRdvToClient(r)};
  const {label:statusLbl,pill:pillCls}=meta.status;
  const {terminer:canTerminer,encaisser:canEncaisser,annuler:canAnnuler,dismiss:canDismiss,encaisse}=meta.actions;
  const isCompleted=r.status==="completed";
  const isDeleted=r.status==="deleted";
  const cardCls=isDeleted?"deleted":isCompleted?"done":"";
  const daysLeft=isCompleted?CalcPlatform.daysUntilPurge(r.completed_at,PURGE_DAYS):0;
  const styleLabel=(r.style||"").trim()||"Standard";
  const phone=CalcPlatform.findClientPhone(r);
  return `<div class="rdv-card ${cardCls}">
    ${canDismiss?`<button class="rdv-dismiss" title="Retirer de l'agenda" onclick="dismissCompletedRdv(${r.id})">×</button>`:""}
    <div class="rdv-card-body">
      <div class="rdv-card-top">
        <div class="rdv-client-row">
          <b class="rdv-client-name">${escapeHTML(r.client)}</b>
          <span class="pill">${escapeHTML(r.genre||"—")}</span>
          <span class="pill ${pillCls}">${statusLbl}</span>
        </div>
        <div class="rdv-price">${FORMAT_CAD(r.montant)}</div>
      </div>
      <div class="rdv-meta-grid">
        <div class="rdv-meta-item">
          <span class="rdv-meta-label">Date</span>
          <span class="rdv-meta-value">${formatDateFR(r.date)}</span>
        </div>
        <div class="rdv-meta-item">
          <span class="rdv-meta-label">Heure</span>
          <span class="rdv-meta-value">${formatHeureFR(r.heure)}</span>
        </div>
        <div class="rdv-meta-item">
          <span class="rdv-meta-label">Style</span>
          <span class="rdv-meta-value">${escapeHTML(styleLabel)}</span>
        </div>
        <div class="rdv-meta-item">
          <span class="rdv-meta-label">Durée</span>
          <span class="rdv-meta-value">${escapeHTML(r.duree||"—")}</span>
        </div>
        ${phone?`<div class="rdv-meta-item"><span class="rdv-meta-label">Téléphone</span><span class="rdv-meta-value"><a class="rdv-phone" href="tel:${phone.replace(/[^\d+]/g,"")}">${escapeHTML(phone)}</a></span></div>`:""}
      </div>
      ${r.note?`<div class="rdv-note">Note : ${escapeHTML(r.note)}</div>`:""}
      ${meta.linkedClient?`<div class="rdv-linked">✓ Lié à l'encaissement du ${formatDateFR(meta.linkedClient.date)}</div>`:""}
      ${isCompleted?`<div class="rdv-purge-hint">✓ Tâche accomplie — retiré automatiquement ${daysLeft<=1?"demain":`dans ${daysLeft} jours`}</div>`:""}
      ${isDeleted?`<div class="rdv-purge-hint danger">Effacé automatiquement après ${PURGE_DAYS} jours</div>`:""}
    </div>
    <div class="rdv-actions">
      ${canTerminer?`<button class="btn secondary" onclick="terminerRdv(${r.id})">Terminer</button>`:""}
      ${canEncaisser?`<button class="btn success" onclick="encaisserRdv(${r.id})">Encaisser</button>`:""}
      ${encaisse?`<span class="rdv-encaisse-badge">✓ Encaissé</span>`:""}
      ${canAnnuler?`<button class="btn danger" onclick="deleteRdv(${r.id})">Annuler</button>`:""}
    </div>
  </div>`;
}

function clientsPage(){
  return `${pageHead("Registre complet des encaissements","Directs ou validés via l’agenda",`<button class="btn" onclick="state.showClientForm=!state.showClientForm;state.error='';render()">${state.showClientForm?"Fermer":"+ Encaisser un client direct"}</button>`)}
  ${state.showClientForm?clientForm():""}<div class="panel">${clientsTable(activeClients(),true)}</div>`;
}
function clientForm(){
  const f=state.clientForm;
  return `<div class="panel"><h2 style="margin-bottom:16px">Encaisser un client direct</h2><div class="form-grid">
    <div><label>Date</label><input type="date" value="${f.date}" onchange="updateForm('clientForm','date',this.value)"></div>
    <div><label>Identifiant / Client *</label><input value="${escapeHTML(f.client)}" placeholder="Nom ou référence..." oninput="updateForm('clientForm','client',this.value)"></div>
    <div><label>Téléphone</label><input type="tel" value="${escapeHTML(f.telephone)}" placeholder="(514) 555-1234" oninput="updateForm('clientForm','telephone',this.value)"></div>
    <div><label>Genre</label><select onchange="updateForm('clientForm','genre',this.value)"><option ${f.genre==="Femme"?"selected":""}>Femme</option><option ${f.genre==="Homme"?"selected":""}>Homme</option><option ${f.genre==="Enfant"?"selected":""}>Enfant</option><option ${f.genre==="Autre"?"selected":""}>Autre</option></select></div>
    <div><label>Montant perçu ($ CAD) *</label><input type="number" value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('clientForm','montant',this.value)"></div>
    <div class="field full"><label>Note / Traitement technique</label><input value="${escapeHTML(f.note)}" placeholder="Détails du soin appliqué..." oninput="updateForm('clientForm','note',this.value)"></div>
  </div>${state.error?`<div class="error">⚠️ ${escapeHTML(state.error)}</div>`:""}<button class="btn dark" onclick="addClient()">Valider l'encaissement</button></div>`;
}
function clientsTable(list,canDelete){
  if(!list.length)return `<p class="empty">Aucun encaissement pour le moment.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Client</th><th>Téléphone</th><th>Genre</th><th>Détails</th><th class="right">Prix</th>${canDelete?"<th></th>":""}</tr></thead><tbody>${list.map(c=>`<tr><td>${c.date}</td><td><b>${escapeHTML(c.client)}</b></td><td class="muted">${escapeHTML(c.telephone||"—")}</td><td><span class="muted">${escapeHTML(c.genre||"—")}</span></td><td class="muted">${escapeHTML(c.note||"—")}</td><td class="right green">${FORMAT_CAD(c.montant)}</td>${canDelete?`<td><button class="btn danger" onclick="deleteClient(${c.id})">Retirer</button></td>`:""}</tr>`).join("")}</tbody></table></div>`;
}
function depensesPage(){
  return `${pageHead("Frais d'exploitation & Achats matériel","Entrez vos achats de savons, serviettes, matériel, etc.",`<button class="btn" onclick="state.showDepForm=!state.showDepForm;state.error='';render()">${state.showDepForm?"Fermer":"+ Ajouter un achat / frais"}</button>`)}
  ${state.showDepForm?depForm():""}<div class="panel">${depensesTable(activeDepenses(),true)}</div>`;
}
function depForm(){
  const f=state.depForm;
  return `<div class="panel"><h2 style="margin-bottom:16px">Ajouter un achat / frais</h2><div class="form-grid">
    <div><label>Date du paiement</label><input type="date" value="${f.date}" onchange="updateForm('depForm','date',this.value)"></div>
    <div><label>Description *</label><input value="${escapeHTML(f.description)}" placeholder="Shampoing, savon..." oninput="updateForm('depForm','description',this.value)"></div>
    <div><label>Prix payé ($ CAD) *</label><input type="number" value="${escapeHTML(f.montant)}" placeholder="0,00" oninput="updateForm('depForm','montant',this.value)"></div>
  </div><div class="note-box">📌 Le loyer de ${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())} est calculé automatiquement par la plateforme. Ne l’entrez pas ici.</div>${state.error?`<div class="error">⚠️ ${escapeHTML(state.error)}</div>`:""}<button class="btn dark" onclick="addDepense()">Sauvegarder la dépense</button></div>`;
}
function depensesTable(list,canDelete){
  if(!list.length)return `<p class="empty">Aucun frais référencé.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th class="right">Montant</th>${canDelete?"<th></th>":""}</tr></thead><tbody>${list.map(d=>`<tr><td>${d.date}</td><td><b>${escapeHTML(d.description)}</b></td><td class="right orange">${FORMAT_CAD(d.montant)}</td>${canDelete?`<td><button class="btn danger" onclick="deleteDepense(${d.id})">Retirer</button></td>`:""}</tr>`).join("")}</tbody></table></div>`;
}
function rapportPage(){
  const data=reportData();
  return `<div class="panel">
    ${pageHead("Extraction & Production de Rapports","Les rapports conservent tout l'historique (même les entrées retirées de la caisse). Le tableau de bord, lui, ne compte que le mois en cours.")}
    <div class="export-grid" style="grid-template-columns:minmax(220px,360px)">
      <div>
        <label>Type de rapport</label>
        <select onchange="state.reportType=this.value;render()">
          <option value="currentMonth" ${state.reportType==="currentMonth"?"selected":""}>Mois actuel</option>
          <option value="cumulativeToCurrent" ${state.reportType==="cumulativeToCurrent"?"selected":""}>Cumul jusqu’au mois présent</option>
        </select>
      </div>
    </div>
    <div class="report-preview">
      <h2>${data.title}</h2>
      <p class="subtitle">
        Revenus : <b class="green">${FORMAT_CAD(data.totalRev)}</b> · 
        Dépenses : <b class="orange">${FORMAT_CAD(data.totalDep)}</b> · 
        Loyer retenu : <b class="red">${FORMAT_CAD_EXPENSE(data.totalRent)}</b> · 
        Bénéfice : <b class="${data.totalProfit<0?"red":"green"}">${FORMAT_CAD(data.totalProfit)}</b>
      </p>
      <div class="grid-kpi" style="margin-top:18px;margin-bottom:0">
        ${kpi("Revenus",FORMAT_CAD(data.totalRev),"var(--success)","Total de la période choisie")}
        ${kpi("Dépenses",FORMAT_CAD(data.totalDep),"var(--warning)","Achats et frais enregistrés")}
        ${kpi("Loyer retenu",FORMAT_CAD_EXPENSE(data.totalRent),"var(--danger)",`${data.rentMonths} mois × ${FORMAT_CAD_EXPENSE(CalcPlatform.getLoyer())}`)}
        ${kpi("Bénéfice net",FORMAT_CAD(data.totalProfit),data.totalProfit>=0?"var(--success)":"var(--danger)","Revenus - dépenses - loyer")}
      </div>
    </div>
    <div style="margin-top:18px"><button class="btn dark" onclick="exportWord()">⬇ Générer et télécharger le fichier Word (.doc)</button></div>
  </div>`;
}

window.state=state; window.render=render; window.setTab=setTab; window.updateForm=updateForm; window.updateFormAndRender=updateFormAndRender; window.openRdvModal=openRdvModal; window.closeModal=closeModal; window.addClient=addClient; window.addDepense=addDepense; window.addRdv=addRdv; window.terminerRdv=terminerRdv; window.encaisserRdv=encaisserRdv; window.deleteRdv=deleteRdv; window.dismissCompletedRdv=dismissCompletedRdv; window.deleteClient=deleteClient; window.deleteDepense=deleteDepense; window.changeMonth=changeMonth; window.selectDateFromCalendar=selectDateFromCalendar; window.exportWord=exportWord; window.updateRent=updateRent;
window.addEventListener("beforeunload",()=>{
  if(db){
    try{writeLocalBackup(db.export())}catch(e){}
  }
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"&&db) queuePersist();
});

initDb().catch(e=>{
  console.error(e);
  document.getElementById("root").innerHTML=`<div class="loading-screen"><div style="color:var(--danger)">Impossible de charger la base de données.</div><div style="font-size:13px;font-weight:500">Rechargez la page. Si le problème continue, vérifiez que les fichiers vendor/sql.js sont bien en ligne.</div></div>`;
});
