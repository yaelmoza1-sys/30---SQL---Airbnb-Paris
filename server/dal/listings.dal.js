// DAL for listings - runs the SQL through the pool and returns the rows. No req / res here.
// Always pass values with .input(...) and use @name in the query.


// Step 2: getListings({ neighbourhood, roomType, minPrice, maxPrice, orderBy, limit })
//   SELECT TOP (@limit) ... FROM dbo.Paris_Airbnb_listings WHERE price IS NOT NULL ... ORDER BY ...
//   Build the fields in SQL: CONCAT (title), UPPER (propertyType), CAST ... AS INT, ROUND (stars)
//
// Step 3: getListingById(id)
//   DATEADD (hostSince), YEAR (hostSinceYear), DATEDIFF + GETDATE (yearsHosting), LEN (aboutLength)

const { sql, poolPromise } = require("../config/db");

async function getListings({ neighbourhood, roomType, minPrice, maxPrice, minRating, orderBy, limit }) {
    const pool = await poolPromise;
    const request = pool.request();
    request.input("limit", sql.Int, limit);

    if (neighbourhood) {
        request.input("neighbourhood", sql.NVarChar, neighbourhood);
    }

    if (roomType) {
        request.input("roomType", sql.NVarChar, roomType);
    }

    if (minPrice !== undefined) {
        request.input("minPrice", sql.Money, minPrice);
    }

    if (maxPrice !== undefined) {
        request.input("maxPrice", sql.Money, maxPrice);
    }

    if (minRating !== undefined) {
        request.input("minRating", sql.Float, minRating);
    }

    let whereClause = "WHERE price IS NOT NULL";

    if (neighbourhood) {
        whereClause += " AND neighbourhood_cleansed = @neighbourhood";
    }

    if (roomType) {
        whereClause += " AND room_type = @roomType";
    }

    if (minPrice !== undefined) {
        whereClause += " AND price >= @minPrice";
    }

    if (maxPrice !== undefined) {
        whereClause += " AND price <= @maxPrice";
    }

    if (minRating !== undefined) {
        whereClause += " AND review_scores_rating / 20.0 >= @minRating";
    }

    const sortColumn = orderBy === "rating"
        ? "review_scores_rating"
        : "price";

    const sortDirection = orderBy === "rating"
        ? "DESC"
        : "ASC";

    const query = `
    SELECT TOP (@limit)
        CAST(id AS INT) AS id,
        CONCAT(room_type, ' in ', neighbourhood_cleansed) AS title,
        UPPER(property_type) AS propertyType,
        room_type AS roomType,
        neighbourhood_cleansed AS neighbourhood,
        CAST(price AS INT) AS pricePerNight,
        ROUND(review_scores_rating / 20.0, 1) AS stars,
        CAST(number_of_reviews AS INT) AS reviewsCount,
        CAST(bedrooms AS INT) AS bedrooms,
        CAST(beds AS INT) AS beds,
        CAST(accommodates AS INT) AS accommodates
    FROM dbo.Paris_Airbnb_listings
    ${whereClause}
    ORDER BY ${sortColumn} ${sortDirection}
`;
    const result = await request.query(query);
    return result.recordset;
}

async function getListingById(id) {
    const pool = await poolPromise;
    const request = pool.request();

    request.input("id", sql.Float, id);

    const query = `
        SELECT
            CAST(id AS INT) AS id,
            CONCAT(room_type, ' in ', neighbourhood_cleansed) AS title,
            UPPER(property_type) AS propertyType,
            room_type AS roomType,
            neighbourhood_cleansed AS neighbourhood,
            CAST(price AS INT) AS pricePerNight,
            ROUND(review_scores_rating / 20.0, 1) AS stars,
            CAST(number_of_reviews AS INT) AS reviewsCount,
            CAST(bedrooms AS INT) AS bedrooms,
            CAST(beds AS INT) AS beds,
            CAST(accommodates AS INT) AS accommodates,
            CAST(bathrooms AS INT) AS bathrooms,
            latitude,
            longitude,
            CAST(host_id AS INT) AS hostId,
            host_name AS hostName,
            host_is_superhost AS hostIsSuperhost,
            DATEADD(day, CAST(host_since AS INT) - 2, '1900-01-01') AS hostSince,
            YEAR(DATEADD(day, CAST(host_since AS INT) - 2, '1900-01-01')) AS hostSinceYear,
            DATEDIFF(year, DATEADD(day, CAST(host_since AS INT) - 2, '1900-01-01'), GETDATE()) AS yearsHosting,
            host_about AS hostAbout,
            CAST(LEN(host_about) AS INT) AS aboutLength
        FROM dbo.Paris_Airbnb_listings
        WHERE id = @id
    `;

    const result = await request.query(query);
    return result.recordset[0];
}
async function getHostListings(hostId) {
    const pool = await poolPromise;
    const request = pool.request();

    request.input("hostId", sql.Float, hostId);

    const query = `
        SELECT
            CAST(id AS INT) AS id,
            CONCAT(room_type, ' in ', neighbourhood_cleansed) AS title,
            UPPER(property_type) AS propertyType,
            room_type AS roomType,
            neighbourhood_cleansed AS neighbourhood,
            CAST(price AS INT) AS pricePerNight,
            ROUND(review_scores_rating / 20.0, 1) AS stars,
            CAST(number_of_reviews AS INT) AS reviewsCount,
            CAST(bedrooms AS INT) AS bedrooms,
            CAST(beds AS INT) AS beds,
            CAST(accommodates AS INT) AS accommodates,
            UPPER(host_name) AS hostName
        FROM dbo.Paris_Airbnb_listings
        WHERE host_id = @hostId
          AND price IS NOT NULL
        ORDER BY price ASC
    `;

    const result = await request.query(query);
    return result.recordset;
}
module.exports = {
    getListings,
    getListingById,
    getHostListings
};