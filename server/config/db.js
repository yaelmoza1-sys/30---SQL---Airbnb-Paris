// Step 1: the connection pool - ONE pool for the whole server.
//
 const sql = require("mssql");
// 2. Build the config from process.env (DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).
//    Use a small pool: pool: { max: 3 }  (the whole class uses the same server)
//    and options: { encrypt: true, trustServerCertificate: true }
// 3. Create the pool once and start connecting:
//      const poolPromise = new sql.ConnectionPool(config).connect();
// 4. Export it, so the DAL and server.js can use it:
//      module.exports = { sql, poolPromise };
//
// See docs/mssql-cheatsheet.md for a full example.
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,

    pool: {
        max: 3
    },

     options: {
         encrypt: true,
         trustServerCertificate: true
     }
};
const poolPromise = new sql.ConnectionPool(config).connect();
module.exports = { sql, poolPromise };