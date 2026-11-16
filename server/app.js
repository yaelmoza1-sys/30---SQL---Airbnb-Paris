// The Express app (without listen - server.js starts it, and the tests use this file directly)
const express = require("express");

const app = express();
app.use(express.json());

// Steps 2-4: import your routers and mount them here, for example:
const listingsRouter = require("./routes/listings.routes");
const hostsRouter = require("./routes/hosts.routes");
app.use("/api/listings", listingsRouter);
app.use("/api/hosts", hostsRouter);


// Any other /api path -> 404 as JSON
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

module.exports = app;
