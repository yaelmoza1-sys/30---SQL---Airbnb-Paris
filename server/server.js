// Starts the server: node server.js (or npm start / npm run dev)
require("dotenv").config({ path: require("node:path").join(__dirname, ".env"), quiet: true });
const app = require("./app");
const { poolPromise } = require("./config/db.js");
const PORT = process.env.PORT || 3000;

// Step 1: check the database connection on startup.
// Import the pool from ./config/db.js, wait for it to connect, and log a clear message:
//   success -> e.g. "Connected to SQL Server"
//   failure -> e.g. "Database connection failed: <the error message>"


// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });

async function startServer() {
    try {
        await poolPromise;
        console.log("Connected to SQL Server");

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
    }
}
startServer();
