// Controller for /api/listings - reads req.query / req.params, validates, calls the DAL,
// sets the status code and sends JSON. No SQL here.
//
// Step 2: getListings(req, res)
//   - read neighbourhood, roomType, minPrice, maxPrice, sort, limit from req.query
//   - validate: limit (default 20, max 50), minPrice/maxPrice are numbers, sort is "price" or "rating"
//     (anything else -> 400 { error })
//   - map sort to a column name here: ORDER BY can't be a parameter
//
// Step 3: getListingById(req, res)
//   - id is not a number -> 400, no such id -> 404
//   - convert hostIsSuperhost 't' / 'f' to true / false
//
// Every controller: try/catch -> 500 { error } when the DAL throws.
const {
    getListings: getListingsFromDal,
    getListingById: getListingByIdFromDal
} = require("../dal/listings.dal");

async function getListings(req, res) {
    try {
        const {
            neighbourhood,
            roomType,
            minPrice,
            maxPrice,
            minRating,
            sort,
            limit
        } = req.query;

        let parsedLimit = limit === undefined ? 20 : Number(limit);

        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
            return res.status(400).json({ error: "Invalid limit" });
        }
        parsedLimit = Math.min(parsedLimit, 50);

        const parsedMinPrice = minPrice === undefined ? undefined : Number(minPrice);
        const parsedMaxPrice = maxPrice === undefined ? undefined : Number(maxPrice);

        if (
            (parsedMinPrice !== undefined && (!Number.isFinite(parsedMinPrice) || parsedMinPrice < 0)) ||
            (parsedMaxPrice !== undefined && (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0))
        ) {
            return res.status(400).json({ error: "Invalid price" });
        }

        const parsedSort = sort === undefined ? "price" : sort;

        if (parsedSort !== "price" && parsedSort !== "rating") {
            return res.status(400).json({ error: "Invalid sort" });
        }

        const parsedMinRating = minRating === undefined ? undefined : Number(minRating);

        if (
            parsedMinRating !== undefined &&
            (!Number.isFinite(parsedMinRating) || parsedMinRating < 0 || parsedMinRating > 5)
        ) {
            return res.status(400).json({ error: "Invalid minRating" });
        }

        const listings = await getListingsFromDal({
            neighbourhood,
            roomType,
            minPrice: parsedMinPrice,
            maxPrice: parsedMaxPrice,
            minRating: parsedMinRating,
            orderBy: parsedSort,
            limit: parsedLimit
        });

        return res.status(200).json(listings);
    }

    catch (error) {
        console.error("Error fetching listings:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}

async function getListingById(req, res) {
    try {
        const id = Number(req.params.id);

        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid listing id" });
        }

        const listing = await getListingByIdFromDal(id);

        if (!listing) {
            return res.status(404).json({ error: "Listing not found" });
        }

        listing.hostIsSuperhost = listing.hostIsSuperhost === "t";

        return res.status(200).json(listing);
    }
    catch (error) {
        console.error("Error fetching listing:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
module.exports = { getListings, getListingById };
