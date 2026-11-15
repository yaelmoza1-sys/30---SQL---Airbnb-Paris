const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  TABLE, oracle, get, describe, expectOk, expectError, recordQueries, failNextQueryWith,
  rawRowsById, checkCard, expectSqlUses, expectParameter, closeAll,
} = require("./helpers");

after(closeAll);

/** A host with at least 2 priced places and at least one place without a price */
async function pickHost() {
  const rows = await oracle(
    `SELECT TOP 1 host_id AS hostId, MAX(host_name) AS hostName, COUNT(price) AS priced FROM ${TABLE}
     WHERE host_id IS NOT NULL
     GROUP BY host_id
     HAVING COUNT(price) >= 2 AND COUNT(*) > COUNT(price)
     ORDER BY COUNT(price), host_id`
  );
  assert.ok(rows.length, "the tests could not find a host with several places");
  return rows[0];
}

async function getHostCards(hostId) {
  const url = `/api/hosts/${hostId}/listings`;
  const res = await get(url);
  expectOk(assert, res, `GET ${url}`);
  assert.ok(Array.isArray(res.json), `GET ${url} should answer with a JSON array of cards ${describe(res)}`);
  return res.json;
}

test("Step 4: GET /api/hosts/:hostId/listings answers with all the host's places that have a price", async () => {
  const host = await pickHost();
  const cards = await getHostCards(host.hostId);
  const expected = await oracle(`SELECT id FROM ${TABLE} WHERE host_id = @h AND price IS NOT NULL`, { h: host.hostId });
  assert.deepEqual(
    cards.map((c) => Number(c.id)).sort((a, b) => a - b),
    expected.map((r) => Number(r.id)).sort((a, b) => a - b),
    `host ${host.hostId} has ${expected.length} places with a price - return all of them (WHERE host_id = @hostId AND price IS NOT NULL, no TOP)`
  );
});

test("Step 4: every card has the card fields and the host name in UPPERCASE", async () => {
  const host = await pickHost();
  const cards = await getHostCards(host.hostId);
  assert.ok(cards.length > 0, `host ${host.hostId} should have places`);
  const raw = await rawRowsById(cards.map((c) => c.id), "id, room_type, neighbourhood_cleansed, property_type, price, review_scores_rating, number_of_reviews, bedrooms, beds, accommodates, host_name");
  cards.forEach((card, i) => {
    const row = raw.get(Number(card.id));
    checkCard(assert, card, row, `GET /api/hosts/${host.hostId}/listings, card #${i + 1}`);
    assert.ok("hostName" in card, `every card should have "hostName" (got keys: ${Object.keys(card).join(", ")})`);
    assert.equal(String(card.hostName).toLowerCase(), String(row.host_name).toLowerCase(), `hostName should be the name of host ${host.hostId}: ${row.host_name}`);
    assert.equal(card.hostName, String(card.hostName).toUpperCase(), `hostName should be in UPPERCASE - UPPER(host_name) (got "${card.hostName}")`);
  });
});

test("Step 4: the host's places are ordered by price, cheapest first", async () => {
  const host = await pickHost();
  const prices = (await getHostCards(host.hostId)).map((c) => c.pricePerNight);
  const expected = (await oracle(`SELECT CAST(price AS INT) AS p FROM ${TABLE} WHERE host_id = @h AND price IS NOT NULL ORDER BY price`, { h: host.hostId })).map((r) => r.p);
  assert.deepEqual(prices, expected, `the places should be ORDER BY price ASC (got prices ${prices.join(", ")})`);
});

test("Step 4: the SQL uses UPPER and the hostId is a parameter", async () => {
  const host = await pickHost();
  const { queries } = await recordQueries(() => getHostCards(host.hostId));
  expectSqlUses(assert, queries, ["UPPER", "CONCAT", "CAST"], `GET /api/hosts/${host.hostId}/listings`);
  expectParameter(assert, queries, Number(host.hostId), `GET /api/hosts/${host.hostId}/listings`);
});

test("Step 4: a hostId that is not a number answers 400, a host with no places answers 404", async () => {
  expectError(assert, await get("/api/hosts/abc/listings"), 400, "GET /api/hosts/abc/listings");
  const [{ missing }] = await oracle(`SELECT ISNULL(MAX(host_id), 0) + 11 AS missing FROM ${TABLE}`);
  expectError(assert, await get(`/api/hosts/${missing}/listings`), 404, `GET /api/hosts/${missing}/listings (no such host)`);
});

test("Step 4: a database error answers 500 with a JSON error", async () => {
  const host = await pickHost();
  failNextQueryWith();
  expectError(assert, await get(`/api/hosts/${host.hostId}/listings`), 500, `GET /api/hosts/${host.hostId}/listings when the database fails`);
});
