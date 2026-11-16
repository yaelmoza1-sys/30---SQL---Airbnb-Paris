// Router for /api/listings - only paths -> controller functions (no logic, no SQL).
//
// Step 2: GET /      -> the cards (filters, sort, limit)
// Step 3: GET /:id   -> one place with host details
//
// const express = require("express");
// const router = express.Router();
// router.get("/", ...);
// module.exports = router;
const express = require("express");
const router = express.Router();

const {
    getListings,
    getListingById
} = require("../controllers/listings.controller");

router.get("/", getListings);
router.get("/:id", getListingById);

module.exports = router;