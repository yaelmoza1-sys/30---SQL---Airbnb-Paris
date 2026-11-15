const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, sql, oracle, get, describe, createdPools, recordQueries, rootPool, runServerFile, closeAll } = require("./helpers");

after(closeAll);

/** Finds the pool that config/db.js created or exported (a pool, a promise of a pool, or an object with one) */
async function findPool() {
  const file = path.join(ROOT, "config", "db.js");
  assert.ok(fs.existsSync(file), "config/db.js is missing - create it");
  let exported;
  try {
    exported = require(file);
  } catch (err) {
    throw new Error(`config/db.js crashed while loading: ${err.message}`);
  }
  const candidates = [exported, ...(exported && typeof exported === "object" ? Object.values(exported) : [])];
  for (const value of candidates) {
    if (value instanceof sql.ConnectionPool) return value;
    if (value && typeof value.then === "function") {
      const resolved = await value.catch((err) => {
        throw new Error(`the pool in config/db.js could not connect: ${err.message} - check the values in server/.env`);
      });
      if (resolved instanceof sql.ConnectionPool) return resolved;
    }
  }
  if (createdPools.size) return [...createdPools][0];
  assert.fail("config/db.js should create a pool with new sql.ConnectionPool(config) and export it: module.exports = { sql, poolPromise }");
}

test("Step 1: config/db.js creates one mssql connection pool with max 3 connections", async () => {
  const pool = await findPool();
  const max = pool.config && pool.config.pool && pool.config.pool.max;
  assert.ok(max !== undefined, "set a small pool size in the config: pool: { max: 3 } (the whole class uses the same server)");
  assert.ok(max >= 1 && max <= 3, `the pool should have max 3 connections - pool: { max: 3 } (got max ${max})`);
});

test("Step 1: the pool connects to the SQL Server from .env and can run a query", async () => {
  await oracle("SELECT 1 AS ok"); // fails with a clear message if .env is wrong
  const pool = await findPool();
  if (!pool.connected && !pool.connecting) await pool.connect();
  for (let i = 0; i < 100 && pool.connecting; i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(pool.connected, "the pool from config/db.js did not connect - call .connect() on it (and check server/.env)");
  const result = await pool.request().query("SELECT 1 AS ok");
  assert.equal(result.recordset[0].ok, 1, "the pool should be able to run a query");
});

test("Step 1: every request uses the same pool (not a new connection per request)", async () => {
  const [{ id }] = await oracle("SELECT TOP 1 id FROM dbo.Paris_Airbnb_listings WHERE price IS NOT NULL ORDER BY id");
  const { queries } = await recordQueries(async () => {
    for (const url of ["/api/listings", "/api/listings?sort=rating", `/api/listings/${id}`, "/api/listings?limit=3"]) {
      const res = await get(url);
      assert.equal(res.status, 200, `GET ${url} should work before this check can run ${describe(res)}`);
    }
  });
  const pools = new Set(queries.map((q) => rootPool(q.pool)));
  assert.ok(queries.length >= 4, "every request should run a query through the pool");
  assert.equal(pools.size, 1, `4 requests used ${pools.size} different pools - create the pool ONCE in config/db.js and import it in the DAL`);
  assert.ok(createdPools.size <= 1, `${createdPools.size} pools were opened - create the pool ONCE in config/db.js and import it in the DAL`);
});

test("Step 1: server.js logs a clear message when the database connection succeeds", async () => {
  const output = await runServerFile({ PORT: "0" }, { until: (out) => /connect|database|\bdb\b|sql/i.test(out) });
  assert.match(output, /connect|database|\bdb\b|sql/i, `on startup server.js should check the connection and log a success message, e.g. "Connected to SQL Server" (it printed: ${JSON.stringify(output.trim().slice(0, 200))})`);
  assert.doesNotMatch(output, /error|fail|cannot|could not|unable/i, `with the right .env values there should be no error on startup (it printed: ${JSON.stringify(output.trim().slice(0, 300))})`);
});

test("Step 1: server.js logs a clear error message when the database connection fails", async () => {
  // A port where no SQL Server listens - nothing is sent to the course server
  const output = await runServerFile({ PORT: "0", DB_SERVER: "127.0.0.1", DB_PORT: "1" }, { until: (out) => /error|fail|cannot|could not|unable/i.test(out) });
  assert.match(output, /error|fail|cannot|could not|unable/i, `when the database is not reachable server.js should log a clear error message, e.g. "Database connection failed: ..." (it printed: ${JSON.stringify(output.trim().slice(0, 200))})`);
});
