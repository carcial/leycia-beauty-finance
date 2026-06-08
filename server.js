const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "monsalon.db");

const app = express();
app.use(express.raw({ type: "application/octet-stream", limit: "50mb" }));
app.use(express.static(ROOT));

app.get("/api/db", (req, res) => {
  if (!fs.existsSync(DB_PATH)) {
    return res.status(204).end();
  }
  const stat = fs.statSync(DB_PATH);
  res.set("X-Db-Updated", stat.mtime.toISOString());
  res.type("application/octet-stream");
  res.send(fs.readFileSync(DB_PATH));
});

app.put("/api/db", (req, res) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, req.body);
  const stat = fs.statSync(DB_PATH);
  res.json({ ok: true, path: "data/monsalon.db", updated_at: stat.mtime.toISOString() });
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Leycia beauty — http://localhost:${port}`);
    console.log(`Base SQLite partagée : ${DB_PATH}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && port < 3010) {
      console.warn(`Port ${port} occupé, essai sur ${port + 1}…`);
      startServer(port + 1);
      return;
    }
    throw err;
  });
}

startServer(Number(PORT));
