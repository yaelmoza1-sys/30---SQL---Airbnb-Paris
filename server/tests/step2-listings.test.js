const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  TABLE, oracle, get, describe, expectOk, expectError, recordQueries, failNextQueryWith,
  rawRowsById, checkCard, expectSqlUses, expectParameter, closeAll,
} = require("./helpers");

after(closeAll);

/** GET a listings URL, check it is a 200 JSON array, and return the array */
async function getCards(url) {
  const res = await get(url);
  expectOk(assert, res, `GET ${url}`);
  assert.ok(Array.isArray(res.json), `GET ${url} should answer with a JSON array of cards ${describe(res)}`);
  return res.json;
}

/** The prices (as INT) the right answer has, in the right order: WHERE + ORDER BY + TOP done by the tests */
async function expectedPrices({ where = [], params = {}, sort = "price", limit = 20 }) {
  const order = sort === "rating" ? "review_scores_rating DESC" : "price ASC";
  const rows = await oracle(
    `SELECT TOP (${limit}) CAST(price AS INT) AS p, review_scores_rating AS r FROM ${TABLE}
     WHERE ${["price IS NOT NULL", ...where].join(" AND ")} ORDER BY ${order}`,
    params
  );
  return rows;
}

/** A neighbourhood value as it is stored (prefers one with garbled characters, like the real data) */
async function someNeighbourhood() {
  const rows = await oracle(
    `SELECT TOP 1 neighbourhood_cleansed AS n, COUNT(*) AS c FROM ${TABLE}
     WHERE price IS NOT NULL AND neighbourhood_cleansed IS NOT NULL
     GROUP BY neighbourhood_cleansed
     ORDER BY CASE WHEN neighbourhood_cleansed LIKE N'%Ã%' THEN 0 ELSE 1 END, COUNT(*) DESC`
  );
  return rows[0].n;
}

async function checkAllCards(cards, where) {
  const raw = await rawRowsById(cards.map((c) => c.id));
  cards.forEach((card, i) => checkCard(assert, card, raw.get(Number(card.id)), `${where}, card #${i + 1} (id ${card.id})`));
}

test("Step 2: GET /api/listings answers with 20 cards that have the fields from the contract", async () => {
  const cards = await getCards("/api/listings");
  const expected = await expectedPrices({});
  assert.equal(cards.length, expected.length, `without a limit the answer should have ${expected.length} cards (default limit 20) - use TOP (@limit)`);
  await checkAllCards(cards, "GET /api/listings");
});

test("Step 2: places without a price are not returned", async () => {
  const cards = await getCards("/api/listings?limit=50");
  assert.ok(cards.length > 0, "GET /api/listings?limit=50 returned no cards");
  const raw = await rawRowsById(cards.map((c) => c.id), "id, price");
  for (const card of cards) {
    const row = raw.get(Number(card.id));
    assert.ok(row && row.price !== null, `listing ${card.id} has no price - add WHERE price IS NOT NULL`);
  }
});

test("Step 2: the SQL builds the fields with CONCAT, UPPER, CAST, ROUND and limits with TOP", async () => {
  const { queries } = await recordQueries(() => getCards("/api/listings?limit=3"));
  expectSqlUses(assert, queries, ["TOP", "CONCAT", "UPPER", "CAST", "ROUND"], "GET /api/listings");
});

test("Step 2: limit chooses how many cards come back", async () => {
  assert.equal((await getCards("/api/listings?limit=5")).length, 5, "GET /api/listings?limit=5 should answer with 5 cards");
  const fifty = (await expectedPrices({ limit: 50 })).length;
  assert.equal((await getCards("/api/listings?limit=50")).length, fifty, `GET /api/listings?limit=50 should answer with ${fifty} cards`);
});

test("Step 2: limit is never more than 50", async () => {
  const res = await get("/api/listings?limit=500");
  if (res.status === 400) return expectError(assert, res, 400, "GET /api/listings?limit=500");
  expectOk(assert, res, "GET /api/listings?limit=500");
  assert.ok(Array.isArray(res.json) && res.json.length > 0 && res.json.length <= 50, `limit=500 should give at most 50 cards (got ${Array.isArray(res.json) ? res.json.length : "no array"}) - use 50 when a bigger limit is sent`);
});

test("Step 2: an invalid limit (not a positive whole number) answers 400 with a JSON error", async () => {
  for (const bad of ["abc", "0", "-5", "2.5"]) {
    expectError(assert, await get(`/api/listings?limit=${bad}`), 400, `GET /api/listings?limit=${bad}`);
  }
});

test("Step 2: by default (and with sort=price) the cards are ordered by price, cheapest first", async () => {
  const expected = (await expectedPrices({ sort: "price" })).map((r) => r.p);
  for (const url of ["/api/listings", "/api/listings?sort=price"]) {
    const prices = (await getCards(url)).map((c) => c.pricePerNight);
    assert.deepEqual(prices, expected, `GET ${url} should be the cheapest places, ORDER BY price ASC (prices: ${prices.join(", ")})`);
  }
});

test("Step 2: sort=rating orders by rating, best first", async () => {
  const expected = await expectedPrices({ sort: "rating" });
  const cards = await getCards("/api/listings?sort=rating");
  const stars = cards.map((c) => c.stars);
  const expectedStars = expected.map((r) => (r.r === null ? null : r.r / 20));
  assert.equal(stars.length, expectedStars.length, `sort=rating should still answer with ${expectedStars.length} cards`);
  stars.forEach((s, i) => {
    const want = expectedStars[i];
    const ok = want === null ? s === null : typeof s === "number" && Math.abs(s - want) <= 0.0501;
    assert.ok(ok, `GET /api/listings?sort=rating should be ORDER BY review_scores_rating DESC - card #${i + 1} should have about ${want} stars (got ${s}; all stars: ${stars.join(", ")})`);
  });
});

test("Step 2: an unknown sort value answers 400 with a JSON error (ORDER BY can't be a parameter)", async () => {
  for (const bad of ["name", "price; DROP TABLE x", "id"]) {
    expectError(assert, await get(`/api/listings?sort=${encodeURIComponent(bad)}`), 400, `GET /api/listings?sort=${bad}`);
  }
});

test("Step 2: neighbourhood filters the cards (sent as a parameter)", async () => {
  const neighbourhood = await someNeighbourhood();
  const url = `/api/listings?neighbourhood=${encodeURIComponent(neighbourhood)}`;
  const { value: cards, queries } = await recordQueries(() => getCards(url));
  const expected = await expectedPrices({ where: ["neighbourhood_cleansed = @n"], params: { n: neighbourhood } });
  assert.equal(cards.length, expected.length, `GET ${url} should answer with ${expected.length} cards`);
  for (const card of cards) assert.equal(card.neighbourhood, neighbourhood, `with neighbourhood=${neighbourhood} every card should be in ${neighbourhood} (got ${card.neighbourhood})`);
  assert.deepEqual(cards.map((c) => c.pricePerNight), expected.map((r) => r.p), "the filtered cards should still be ordered by price");
  expectParameter(assert, queries, neighbourhood, `GET ${url}`);
});

test("Step 2: roomType filters the cards (sent as a parameter)", async () => {
  for (const roomType of ["Private room", "Entire home/apt"]) {
    const url = `/api/listings?roomType=${encodeURIComponent(roomType)}`;
    const { value: cards, queries } = await recordQueries(() => getCards(url));
    const expected = await expectedPrices({ where: ["room_type = @t"], params: { t: roomType } });
    assert.equal(cards.length, expected.length, `GET ${url} should answer with ${expected.length} cards`);
    for (const card of cards) assert.equal(card.roomType, roomType, `with roomType=${roomType} every card should be a "${roomType}" (got "${card.roomType}")`);
    expectParameter(assert, queries, roomType, `GET ${url}`);
  }
});

test("Step 2: minPrice and maxPrice filter by price (each one alone and both together)", async () => {
  const cases = [
    ["minPrice=133", ["price >= @min"], { min: 133 }],
    ["maxPrice=47", ["price <= @max"], { max: 47 }],
    ["minPrice=61&maxPrice=97&limit=50", ["price >= @min", "price <= @max"], { min: 61, max: 97 }, 50],
  ];
  for (const [query, where, params, limit = 20] of cases) {
    const url = `/api/listings?${query}`;
    const { value: cards, queries } = await recordQueries(() => getCards(url));
    const expected = await expectedPrices({ where, params, limit });
    assert.equal(cards.length, expected.length, `GET ${url} should answer with ${expected.length} cards (got ${cards.length})`);
    for (const card of cards) {
      if (params.min !== undefined) assert.ok(card.pricePerNight >= params.min, `with ${query} card ${card.id} costs ${card.pricePerNight} - below minPrice`);
      if (params.max !== undefined) assert.ok(card.pricePerNight <= params.max, `with ${query} card ${card.id} costs ${card.pricePerNight} - above maxPrice`);
    }
    for (const value of Object.values(params)) expectParameter(assert, queries, value, `GET ${url}`);
  }
});

test("Step 2: an invalid minPrice / maxPrice answers 400 with a JSON error", async () => {
  for (const bad of ["minPrice=abc", "maxPrice=cheap", "minPrice=-10"]) {
    expectError(assert, await get(`/api/listings?${bad}`), 400, `GET /api/listings?${bad}`);
  }
});

test("Step 2: all filters and sort work together", async () => {
  const url = "/api/listings?roomType=Entire%20home/apt&minPrice=50&maxPrice=120&sort=price";
  const cards = await getCards(url);
  const expected = await expectedPrices({ where: ["room_type = @t", "price >= @min", "price <= @max"], params: { t: "Entire home/apt", min: 50, max: 120 } });
  assert.deepEqual(cards.map((c) => c.pricePerNight), expected.map((r) => r.p), `GET ${url} should give these prices: ${expected.map((r) => r.p).join(", ")}`);
  await checkAllCards(cards, `GET ${url}`);

  const rated = await getCards("/api/listings?roomType=Private%20room&sort=rating&limit=8");
  const expectedRated = await expectedPrices({ where: ["room_type = @t"], params: { t: "Private room" }, sort: "rating", limit: 8 });
  assert.equal(rated.length, expectedRated.length, `roomType=Private room&sort=rating&limit=8 should answer with ${expectedRated.length} cards`);
  for (const card of rated) assert.equal(card.roomType, "Private room", "roomType + sort=rating: every card should be a Private room");
});

test("Step 2: user text can't change the SQL (SQL injection is blocked by parameters)", async () => {
  const attack = "' OR 1=1 --";
  const url = `/api/listings?roomType=${encodeURIComponent(attack)}`;
  const res = await get(url);
  assert.notEqual(res.status, 500, `GET ${url} crashed the query - never glue user text into SQL, use .input() ${describe(res)}`);
  expectOk(assert, res, `GET ${url}`);
  assert.deepEqual(res.json, [], `no room type is called "${attack}", so the answer should be [] - use .input("roomType", sql.NVarChar, roomType) ${describe(res)}`);
});

test("Step 2: a database error answers 500 with a JSON error (the server does not crash)", async () => {
  await getCards("/api/listings?limit=1");
  failNextQueryWith();
  expectError(assert, await get("/api/listings"), 500, "GET /api/listings when the database fails");
  assert.equal((await getCards("/api/listings?limit=2")).length, 2, "after a database error the server should keep working");
});

test("Bonus: minRating filters by stars (0-5)", { todo: "bonus" }, async () => {
  const cards = await getCards("/api/listings?minRating=4.8&limit=50");
  const expected = await expectedPrices({ where: ["review_scores_rating / 20.0 >= 4.8"], limit: 50 });
  assert.equal(cards.length, expected.length, `minRating=4.8 should answer with ${expected.length} cards (rating / 20 >= 4.8)`);
  for (const card of cards) assert.ok(card.stars >= 4.8 - 1e-9, `with minRating=4.8 card ${card.id} has only ${card.stars} stars`);
});
