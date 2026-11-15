// Test helpers - you don't need to read or change this file.
// The tests run your Express app (app.js) inside the test process, send it HTTP requests,
// and compare the answers with the real data in the database (read-only queries).

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

// Without `npm install` every test fails with this message (instead of crashing the whole file)
const missing = ["dotenv", "express", "mssql"].filter((m) => !fs.existsSync(path.join(ROOT, "node_modules", m)));
if (missing.length) {
  const fail = () => {
    throw new Error(`${missing.join(", ")} not installed - run \`npm install\` inside the server folder first`);
  };
  module.exports = new Proxy({}, { get: (_, key) => (key === "closeAll" ? async () => {} : key === "ROOT" ? ROOT : fail) });
  return;
}

require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
const sql = require("mssql");

const TABLE = "dbo.Paris_Airbnb_listings";
const CARD_KEYS = ["id", "title", "propertyType", "roomType", "neighbourhood", "pricePerNight", "stars", "reviewsCount", "bedrooms", "beds", "accommodates"];
const HOST_KEYS = ["hostId", "hostName", "hostIsSuperhost", "hostSince", "hostSinceYear", "yearsHosting", "hostAbout", "aboutLength"];
const DETAIL_KEYS = [...CARD_KEYS, "latitude", "longitude", "bathrooms", ...HOST_KEYS];

// ---------------------------------------------------------------------------
// Watch what the student's code does with mssql: which pools it opens and which queries it runs
// ---------------------------------------------------------------------------
let oraclePool = null;
const createdPools = new Set();
const queries = [];
let failNextQuery = null;

const rootPool = (parent) => {
  let p = parent;
  while (p && !(p instanceof sql.ConnectionPool) && p.parent) p = p.parent;
  return p;
};
const isOracle = (pool) => pool && pool === oraclePool;

const originalConnect = sql.ConnectionPool.prototype.connect;
sql.ConnectionPool.prototype.connect = function (...args) {
  if (!isOracle(this)) createdPools.add(this);
  return originalConnect.apply(this, args);
};

const originalQuery = sql.Request.prototype.query;
sql.Request.prototype.query = function (command, ...rest) {
  const pool = rootPool(this.parent);
  if (isOracle(pool)) return originalQuery.call(this, command, ...rest);

  const entry = { sql: Array.isArray(command) ? command.join("@param") : String(command), pool, params: {} };
  queries.push(entry);
  if (failNextQuery) {
    const error = failNextQuery;
    failNextQuery = null;
    const callback = rest.find((a) => typeof a === "function");
    if (callback) return void setImmediate(() => callback(error));
    return Promise.reject(error);
  }
  const result = originalQuery.call(this, command, ...rest);
  for (const [name, p] of Object.entries(this.parameters || {})) entry.params[name] = p.value;
  return result;
};

/** The SQL queries the student's code ran during fn() */
async function recordQueries(fn) {
  const start = queries.length;
  const value = await fn();
  return { value, queries: queries.slice(start) };
}

/** Makes the next query of the student's code fail, like a database that went down */
function failNextQueryWith(message = "Simulated database error (from the tests)") {
  failNextQuery = new Error(message);
}

// ---------------------------------------------------------------------------
// The "oracle": the tests' own read-only connection, used to know what the right answer is
// ---------------------------------------------------------------------------
function dbConfig() {
  return {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    pool: { max: 1 },
    options: { encrypt: true, trustServerCertificate: true },
  };
}

function checkEnv() {
  if (!fs.existsSync(path.join(ROOT, ".env")) && !process.env.DB_SERVER) {
    throw new Error("server/.env is missing - copy .env.example to .env and fill in the values from class");
  }
  for (const name of ["DB_SERVER", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    if (!process.env[name]) throw new Error(`${name} is empty in server/.env - fill in the values from class`);
  }
}

let oracleReady = null;
function oracle(text, params = {}) {
  if (!oracleReady) {
    oracleReady = (async () => {
      checkEnv();
      oraclePool = new sql.ConnectionPool(dbConfig());
      try {
        await oraclePool.connect();
      } catch (err) {
        throw new Error(`the tests could not connect to SQL Server with the values in server/.env (${process.env.DB_SERVER}): ${err.message}`);
      }
      return oraclePool;
    })();
  }
  return oracleReady.then((pool) => {
    const req = pool.request();
    for (const [name, value] of Object.entries(params)) {
      req.input(name, typeof value === "number" ? sql.Float : sql.NVarChar, value);
    }
    return req.query(text).then((r) => r.recordset);
  });
}

// ---------------------------------------------------------------------------
// The student's Express app
// ---------------------------------------------------------------------------
/** " (in dal/listings.dal.js line 12)" - the student's file where an error happened */
function whereIn(err) {
  for (const line of String((err && err.stack) || "").split(/\r?\n/)) {
    if (/node_modules|node:|[\\/]tests[\\/]/.test(line)) continue;
    const match = line.match(/([^\s()]+\.js):(\d+)/);
    if (match) return ` (in ${path.relative(ROOT, match[1]).replace(/\\/g, "/")} line ${match[2]})`;
  }
  return "";
}

let server = null;
function startApp() {
  if (server) return server;
  server = (async () => {
    const file = path.join(ROOT, "app.js");
    let app;
    try {
      app = require(file);
    } catch (err) {
      throw new Error(`app.js crashed while loading: ${err.message}${whereIn(err)}`);
    }
    if (app && typeof app !== "function" && typeof app.default === "function") app = app.default;
    if (typeof app !== "function" || typeof app.listen !== "function") {
      throw new Error("app.js should export the express app: module.exports = app; (and call app.listen only in server.js)");
    }
    const srv = http.createServer(app);
    await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
    return srv;
  })();
  return server;
}

/** GET a path from the student's app. Returns { status, headers, text, json } */
async function get(urlPath) {
  const srv = await startApp();
  const { port } = srv.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: urlPath, timeout: 20000 }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`GET ${urlPath} did not answer within 20 seconds - did you forget to send a response (res.json) or to await the query?`)));
    req.on("error", reject);
  });
}

/** A short description of a response for assertion messages */
function describe(res) {
  const body = res.text.length > 220 ? res.text.slice(0, 220) + "..." : res.text;
  return `(got status ${res.status}: ${body.replace(/\s+/g, " ") || "<empty body>"})`;
}

/** Asserts a 200 JSON answer and gives a helpful message for the common mistakes */
function expectOk(assert, res, what) {
  assert.notEqual(res.status, 404, `${what} was not found (404) - create the router and mount it in app.js ${describe(res)}`);
  assert.notEqual(res.status, 500, `${what} answered 500 - look at the error in the terminal ${describe(res)}`);
  assert.equal(res.status, 200, `${what} should answer with status 200 ${describe(res)}`);
  assert.match(String(res.headers["content-type"]), /json/, `${what} should answer with JSON - use res.json(...) ${describe(res)}`);
}

/** Asserts an error answer: the status code and a JSON body like { "error": "..." } */
function expectError(assert, res, status, what) {
  assert.equal(res.status, status, `${what} should answer with status ${status} ${describe(res)}`);
  assert.match(String(res.headers["content-type"]), /json/, `${what} should answer with JSON, like res.status(${status}).json({ error: "..." }) ${describe(res)}`);
  assert.ok(res.json && typeof res.json.error === "string" && res.json.error.trim(), `${what} should answer with a JSON object that has an "error" message: { "error": "..." } ${describe(res)}`);
}

// ---------------------------------------------------------------------------
// Expected values, computed from the raw columns
// ---------------------------------------------------------------------------
const RAW_CARD_COLUMNS = "id, room_type, neighbourhood_cleansed, property_type, price, review_scores_rating, number_of_reviews, bedrooms, beds, accommodates";

async function rawRowsById(ids, columns = RAW_CARD_COLUMNS) {
  const numbers = ids.map(Number).filter(Number.isFinite);
  if (!numbers.length) return new Map();
  const rows = await oracle(`SELECT ${columns} FROM ${TABLE} WHERE id IN (${numbers.join(",")})`);
  return new Map(rows.map((r) => [Number(r.id), r]));
}

function checkWholeNumber(assert, value, raw, field, where) {
  if (raw === null || raw === undefined) {
    assert.equal(value, null, `${where}: ${field} should be null (the column is NULL)`);
    return;
  }
  assert.equal(typeof value, "number", `${where}: ${field} should be a number (got ${JSON.stringify(value)}) - CAST(... AS INT) in SQL`);
  assert.ok(Number.isInteger(value), `${where}: ${field} should be a whole number (got ${value}) - CAST(... AS INT) in SQL`);
  assert.ok(Math.abs(value - Number(raw)) < 1, `${where}: ${field} should be ${raw} as an INT (got ${value})`);
}

/** Checks every field of one card against the raw database row */
function checkCard(assert, card, raw, where = `listing ${card && card.id}`) {
  assert.ok(card && typeof card === "object" && !Array.isArray(card), `${where} should be an object`);
  for (const key of CARD_KEYS) {
    assert.ok(key in card, `${where} is missing the key "${key}" - the field names must match docs/api-contract.md (got keys: ${Object.keys(card).join(", ")})`);
  }
  assert.ok(raw, `${where}: id ${card.id} does not exist in the table - id should be CAST(id AS INT)`);
  assert.equal(card.id, Number(raw.id), `${where}: id should be the number ${raw.id}`);
  const title = `${raw.room_type ?? ""} in ${raw.neighbourhood_cleansed ?? ""}`;
  assert.equal(card.title, title, `${where}: title should be "${title}" - CONCAT(room_type, ' in ', neighbourhood_cleansed)`);
  const upper = raw.property_type === null ? null : raw.property_type.toUpperCase();
  assert.equal(card.propertyType, upper, `${where}: propertyType should be "${upper}" - UPPER(property_type)`);
  assert.equal(card.roomType, raw.room_type, `${where}: roomType should be "${raw.room_type}"`);
  assert.equal(card.neighbourhood, raw.neighbourhood_cleansed, `${where}: neighbourhood should be "${raw.neighbourhood_cleansed}"`);
  checkWholeNumber(assert, card.pricePerNight, raw.price, "pricePerNight", where);

  if (raw.review_scores_rating === null) {
    assert.equal(card.stars, null, `${where}: stars should be null when there is no rating`);
  } else {
    const exact = raw.review_scores_rating / 20;
    assert.equal(typeof card.stars, "number", `${where}: stars should be a number (got ${JSON.stringify(card.stars)})`);
    assert.ok(Math.abs(card.stars * 10 - Math.round(card.stars * 10)) < 1e-6, `${where}: stars should have one decimal - ROUND(review_scores_rating / 20.0, 1) (got ${card.stars})`);
    assert.ok(Math.abs(card.stars - exact) <= 0.0501, `${where}: stars should be the rating ${raw.review_scores_rating} / 20 = ${exact} rounded to one decimal (got ${card.stars})`);
  }
  checkWholeNumber(assert, card.reviewsCount, raw.number_of_reviews, "reviewsCount", where);
  checkWholeNumber(assert, card.bedrooms, raw.bedrooms, "bedrooms", where);
  checkWholeNumber(assert, card.beds, raw.beds, "beds", where);
  checkWholeNumber(assert, card.accommodates, raw.accommodates, "accommodates", where);
}

/** Asserts that the SQL the student ran uses some functions / keywords */
function expectSqlUses(assert, ran, words, what) {
  assert.ok(ran.length > 0, `${what} did not run any SQL query`);
  const text = ran.map((q) => q.sql).join("\n");
  for (const word of words) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    assert.match(text, re, `${what}: the SQL query should use ${word}${word === "TOP" ? "" : "(...)"} - do this in SQL, not in JavaScript`);
  }
  assert.doesNotMatch(text, /select\s+(top\s*\(?\s*@?\w+\s*\)?\s+)?(distinct\s+)?\*/i, `${what}: don't use SELECT * - select only the columns you need`);
  assert.doesNotMatch(text, /\b(insert|update|delete|drop|alter|truncate|merge)\b\s/i, `${what}: this task is read-only - only SELECT queries`);
}

/** Asserts that a value from the URL was sent as a parameter (.input), not glued into the SQL text */
function expectParameter(assert, ran, value, what) {
  const text = ran.map((q) => q.sql).join("\n");
  assert.ok(!text.includes(String(value)), `${what}: the value "${value}" was written into the SQL text - pass it with .input(...) and use @name in the query`);
  const sent = ran.some((q) => Object.values(q.params).some((v) => String(v) === String(value) || Number(v) === Number(value)));
  assert.ok(sent, `${what}: the value "${value}" should be sent as a parameter with .input(...)`);
}

// ---------------------------------------------------------------------------
// Source files (for the architecture rules)
// ---------------------------------------------------------------------------
function jsFilesIn(folder) {
  const dir = path.join(ROOT, folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(folder, f));
}

/** A file's code without comments */
function codeOf(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// Running server.js as its own process (for the "log on startup" check)
// ---------------------------------------------------------------------------
function runServerFile(env, { until, timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const finish = () => {
      clearTimeout(timer);
      if (child.exitCode === null) child.kill();
      resolve(output);
    };
    const onData = (chunk) => {
      output += chunk;
      if (until && until(output)) setTimeout(finish, 300);
    };
    child.stdout.setEncoding("utf8").on("data", onData);
    child.stderr.setEncoding("utf8").on("data", onData);
    child.on("exit", () => finish());
    const timer = setTimeout(finish, timeout);
  });
}

async function closeAll() {
  if (server) {
    const srv = await server.catch(() => null);
    if (srv) {
      srv.closeAllConnections?.();
      await new Promise((r) => srv.close(() => r()));
    }
  }
  for (const pool of createdPools) await pool.close().catch(() => {});
  if (oraclePool) await oraclePool.close().catch(() => {});
}

module.exports = {
  ROOT, TABLE, CARD_KEYS, HOST_KEYS, DETAIL_KEYS, sql,
  oracle, get, describe, expectOk, expectError, startApp,
  recordQueries, failNextQueryWith, createdPools, rootPool,
  rawRowsById, checkCard, checkWholeNumber, expectSqlUses, expectParameter,
  jsFilesIn, codeOf, runServerFile, closeAll,
};
