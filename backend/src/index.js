require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./db");
const { ensureBootstrap } = require("./bootstrap");

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    const dbResult = await pool.query("SELECT NOW() AS server_time");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        server_time: dbResult.rows[0].server_time,
      },
    });
  } catch (err) {
    console.error("[Health] DB check failed:", err.message);
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      database: { connected: false, error: err.message },
    });
  }
});

app.use("/api/teller", require("./routes/teller"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/accounts", require("./routes/accounts"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/workspace", require("./routes/workspace"));

async function start() {
  await ensureBootstrap();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`UseOrigin backend listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[Bootstrap] Failed to start backend:", err);
  process.exit(1);
});
