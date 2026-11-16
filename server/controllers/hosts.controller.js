// Controller for /api/hosts
//
// Step 4: getHostListings(req, res)
//   - hostId is not a number -> 400, no places found -> 404
//   - try/catch -> 500 { error }
const { getHostListings } = require("../dal/listings.dal");

async function getHostListingsController(req, res) {
    try {
        const hostId = Number(req.params.hostId);

        if (!Number.isFinite(hostId)) {
            return res.status(400).json({ error: "Invalid host id" });
        }

        const listings = await getHostListings(hostId);

        if (listings.length === 0) {
            return res.status(404).json({ error: "No listings found for this host" });
        }

        return res.status(200).json(listings);
    }
    catch (error) {
        console.error("Error fetching host listings:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = { getHostListingsController };