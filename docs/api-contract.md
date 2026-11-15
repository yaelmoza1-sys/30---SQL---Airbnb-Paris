# API contract - Paris Airbnb

The client (`client/`) and the tests (`server/tests/`) depend on these paths, field names and status codes. Match them exactly.

All endpoints are `GET`, answer with JSON, and read from `dbo.Paris_Airbnb_listings`.

Every error answers with a JSON object that has an `error` message:

```json
{ "error": "limit must be a whole number from 1 to 50" }
```

| Status | When |
|---|---|
| `200` | OK |
| `400` | invalid input (see each endpoint) |
| `404` | the id / host was not found |
| `500` | the database query failed (`try/catch` in the controller) |

---

## The card object

Endpoints 1 and 3 return arrays of cards. Endpoint 2 returns a card with more fields.

| Field | Type | SQL |
|---|---|---|
| `id` | number (int) | `CAST(id AS INT)` |
| `title` | string | `CONCAT(room_type, ' in ', neighbourhood_cleansed)` |
| `propertyType` | string | `UPPER(property_type)` |
| `roomType` | string | `room_type` |
| `neighbourhood` | string | `neighbourhood_cleansed` |
| `pricePerNight` | number (int) | `CAST(price AS INT)` |
| `stars` | number (0-5, one decimal) or `null` | `ROUND(review_scores_rating / 20.0, 1)` |
| `reviewsCount` | number (int) or `null` | `CAST(number_of_reviews AS INT)` |
| `bedrooms` | number (int) or `null` | `CAST(bedrooms AS INT)` |
| `beds` | number (int) or `null` | `CAST(beds AS INT)` |
| `accommodates` | number (int) or `null` | `CAST(accommodates AS INT)` |

A column that is `NULL` in the table stays `null` in the JSON.

---

## 1. `GET /api/listings`

The cards for the home page. All query parameters are optional:

| Parameter | Meaning | Invalid → `400` |
|---|---|---|
| `neighbourhood` | exact `neighbourhood_cleansed` value (take it from the API - some names are garbled, e.g. `PanthÃ©on`) | - |
| `roomType` | exact `room_type`, e.g. `Entire home/apt`, `Private room` | - |
| `minPrice` | `price >= minPrice` | not a number, or negative |
| `maxPrice` | `price <= maxPrice` | not a number, or negative |
| `sort` | `price` (default) → `ORDER BY price ASC`, `rating` → `ORDER BY review_scores_rating DESC` | any other value |
| `limit` | how many cards, `TOP (@limit)`. Default `20`. More than `50` → use `50` | not a whole number ≥ 1 (`abc`, `0`, `-5`, `2.5`) |
| `minRating` *(bonus)* | in stars (0-5): `review_scores_rating / 20.0 >= minRating` | - |

Places with no price (`price IS NULL`) are never returned.

```
GET /api/listings?limit=1
```
```json
[
  {
    "id": 3109,
    "title": "Entire home/apt in Observatoire",
    "propertyType": "APARTMENT",
    "roomType": "Entire home/apt",
    "neighbourhood": "Observatoire",
    "pricePerNight": 60,
    "stars": 5.0,
    "reviewsCount": 9,
    "bedrooms": 0,
    "beds": 1,
    "accommodates": 2
  }
]
```

---

## 2. `GET /api/listings/:id`

One place: all the card fields, plus:

| Field | Type | How |
|---|---|---|
| `bathrooms` | number (int) or `null` | `CAST(bathrooms AS INT)` |
| `latitude`, `longitude` | number | the columns as they are |
| `hostId` | number | `CAST(host_id AS INT)` - the client uses it to call endpoint 3 |
| `hostName` | string | `host_name` |
| `hostIsSuperhost` | boolean | `host_is_superhost` is `'t'` / `'f'` → `true` / `false` **in the controller** |
| `hostSince` | date (JSON string, e.g. `"2008-10-14T00:00:00.000Z"`) | `DATEADD(day, host_since - 2, '1900-01-01')` - `host_since` is an Excel day number |
| `hostSinceYear` | number | `YEAR(...)` of that date |
| `yearsHosting` | number | `DATEDIFF(year, <that date>, GETDATE())` |
| `hostAbout` | string or `null` | `host_about` |
| `aboutLength` | number or `null` | `LEN(host_about)` |
| `amenities` *(bonus)* | array of strings | `{Wifi,Kitchen,"Hair dryer"}` → `["Wifi", "Kitchen", "Hair dryer"]` in the controller |
| `hostResponseRate` *(bonus)* | string, e.g. `"100%"` | made with `STR(...)` in SQL |

> `LEN()` of a very long text column returns `BIGINT`, and the `mssql` package turns `BIGINT` into a string (`"856"`). `CAST(LEN(host_about) AS INT)` gives a normal number.

| Case | Answer |
|---|---|
| `id` is not a number (`abc`, `12abc`) | `400` - check it before calling the DAL |
| no row with this `id` | `404` |

---

## 3. `GET /api/hosts/:hostId/listings`

All the places of one host that have a price, cheapest first (`ORDER BY price ASC`, no `TOP`).
An array of cards, and every card also has:

| Field | Type | SQL |
|---|---|---|
| `hostName` | string | `UPPER(host_name)` |

| Case | Answer |
|---|---|
| `hostId` is not a number | `400` |
| the host has no places with a price | `404` |
