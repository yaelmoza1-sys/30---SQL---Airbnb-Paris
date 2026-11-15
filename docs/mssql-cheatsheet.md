# mssql cheatsheet

The [`mssql`](https://www.npmjs.com/package/mssql) package connects Node.js to SQL Server.

## One pool for the whole server - `config/db.js`

```js
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  pool: { max: 3 },                       // small - the whole class uses the same server
  options: { encrypt: true, trustServerCertificate: true },
};

// connect ONCE - everyone awaits the same promise
const poolPromise = new sql.ConnectionPool(config).connect();

module.exports = { sql, poolPromise };
```

`process.env` is filled by `require("dotenv").config()` at the top of `server.js`, before `config/db.js` is loaded.

## Checking the connection on startup - `server.js`

```js
const { poolPromise } = require("./config/db");

poolPromise
  .then(() => console.log("Connected to SQL Server"))
  .catch((err) => console.error("Database connection failed:", err.message));
```

## One parameterized query - in the DAL

```js
const { sql, poolPromise } = require("../config/db");

async function getPlacesByRoomType(roomType) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("roomType", sql.NVarChar, roomType)   // the value goes in as a parameter
    .query(`
      SELECT TOP (5) CAST(id AS INT) AS id, room_type AS roomType
      FROM dbo.Paris_Airbnb_listings
      WHERE room_type = @roomType                -- @name, never ${"${roomType}"}
      ORDER BY id`);
  return result.recordset;                       // an array of row objects
}
```

- `.input(name, type, value)` for **every** value that comes from the user. Common types: `sql.NVarChar`, `sql.Int`, `sql.Float` (for `id` / `host_id`), `sql.Money`.
- A column name (`ORDER BY ...`) can't be a parameter. Choose it from a fixed list in your code, and reject anything else with `400`.
- `result.recordset` is the array of rows. `result.recordset[0]` is the first row, or `undefined` when there are none.
- The column aliases (`AS roomType`) become the keys of the JSON - name them like `docs/api-contract.md`.
