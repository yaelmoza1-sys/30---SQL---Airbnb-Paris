const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  TABLE, DETAIL_KEYS, oracle, get, describe, expectOk, expectError, recordQueries, failNextQueryWith,
  checkCard, checkWholeNumber, expectSqlUses, expectParameter, closeAll,
} = require("./helpers");

after(closeAll);

const RAW = `id, room_type, neighbourhood_cleansed, property_type, price, review_scores_rating, number_of_reviews,
  bedrooms, beds, accommodates, bathrooms, latitude, longitude, host_id, host_name, host_is_superhost, host_since,
  host_about, LEN(host_about) AS about_len, host_response_rate, amenities`;

/** One row picked by a condition, with all the raw columns the details need */
async function pickRow(where, order = "id") {
  const rows = await oracle(`SELECT TOP 1 ${RAW} FROM ${TABLE} WHERE ${where} ORDER BY ${order}`);
  assert.ok(rows.length, `the tests could not find a row WHERE ${where} in ${TABLE}`);
  return rows[0];
}

async function getDetails(id) {
  const url = `/api/listings/${id}`;
  const res = await get(url);
  expectOk(assert, res, `GET ${url}`);
  assert.ok(res.json && typeof res.json === "object" && !Array.isArray(res.json), `GET ${url} should answer with ONE object (not an array) - send rows[0] ${describe(res)}`);
  for (const key of DETAIL_KEYS) {
    assert.ok(key in res.json, `GET ${url} is missing the key "${key}" - see docs/api-contract.md (got keys: ${Object.keys(res.json).join(", ")})`);
  }
  return res.json;
}

/** Excel day number -> "YYYY-MM-DD", like DATEADD(day, host_since - 2, '1900-01-01') */
const excelDate = (n) => new Date(Date.UTC(1900, 0, 1) + (n - 2) * 86400000).toISOString().slice(0, 10);

test("Step 3: GET /api/listings/:id answers with the place and the card fields", async () => {
  const row = await pickRow("price IS NOT NULL AND review_scores_rating IS NOT NULL AND host_since IS NOT NULL", "id DESC");
  const details = await getDetails(row.id);
  checkCard(assert, details, row, `GET /api/listings/${row.id}`);
  const where = `GET /api/listings/${row.id}`;
  checkWholeNumber(assert, details.bathrooms, row.bathrooms, "bathrooms", where);
  for (const key of ["latitude", "longitude"]) {
    assert.ok(row[key] === null ? details[key] === null : Math.abs(details[key] - row[key]) < 1e-6, `${where}: ${key} should be ${row[key]} (got ${details[key]})`);
  }
});

test("Step 3: the host details - id, name, join date, join year and years hosting", async () => {
  const row = await pickRow("host_since IS NOT NULL AND host_name IS NOT NULL");
  const details = await getDetails(row.id);
  const where = `GET /api/listings/${row.id}`;
  assert.equal(details.hostId, Number(row.host_id), `${where}: hostId should be ${row.host_id} (the client uses it to load the host's other places)`);
  assert.equal(String(details.hostName).toLowerCase(), row.host_name.toLowerCase(), `${where}: hostName should be "${row.host_name}"`);

  const date = excelDate(row.host_since);
  assert.equal(String(details.hostSince).slice(0, 10), date, `${where}: hostSince should be the date ${date} - host_since ${row.host_since} is an Excel day number: DATEADD(day, host_since - 2, '1900-01-01') (got ${JSON.stringify(details.hostSince)})`);
  const year = Number(date.slice(0, 4));
  assert.equal(details.hostSinceYear, year, `${where}: hostSinceYear should be ${year} - YEAR(...) of the date (got ${JSON.stringify(details.hostSinceYear)})`);
  const [{ now }] = await oracle("SELECT YEAR(GETDATE()) AS now");
  assert.equal(details.yearsHosting, now - year, `${where}: yearsHosting should be ${now - year} - DATEDIFF(year, <the date>, GETDATE()) (got ${JSON.stringify(details.yearsHosting)})`);
});

test("Step 3: hostAbout and aboutLength (LEN) - and null when there is no text", async () => {
  const withAbout = await pickRow("host_about IS NOT NULL", "LEN(host_about) DESC");
  const details = await getDetails(withAbout.id);
  const where = `GET /api/listings/${withAbout.id}`;
  assert.equal(details.hostAbout, withAbout.host_about, `${where}: hostAbout should be the host_about text`);
  assert.equal(Number(details.aboutLength), Number(withAbout.about_len), `${where}: aboutLength should be ${withAbout.about_len} - LEN(host_about) (got ${JSON.stringify(details.aboutLength)})`);

  const noAbout = await pickRow("host_about IS NULL");
  const empty = await getDetails(noAbout.id);
  assert.equal(empty.aboutLength, null, `GET /api/listings/${noAbout.id}: the host has no about text, so aboutLength should be null (got ${JSON.stringify(empty.aboutLength)})`);
});

test("Step 3: hostIsSuperhost is true / false (converted from 't' / 'f' in the controller)", async () => {
  for (const [flag, expected] of [["t", true], ["f", false]]) {
    const row = await pickRow(`host_is_superhost = '${flag}'`);
    const details = await getDetails(row.id);
    assert.equal(details.hostIsSuperhost, expected, `GET /api/listings/${row.id}: host_is_superhost is '${flag}', so hostIsSuperhost should be ${expected} (a boolean, not a string) - got ${JSON.stringify(details.hostIsSuperhost)}`);
  }
});

test("Step 3: the SQL uses DATEADD, YEAR, DATEDIFF, GETDATE, LEN and the id is a parameter", async () => {
  const row = await pickRow("host_since IS NOT NULL");
  const { queries } = await recordQueries(() => getDetails(row.id));
  expectSqlUses(assert, queries, ["DATEADD", "YEAR", "DATEDIFF", "GETDATE", "LEN"], `GET /api/listings/${row.id}`);
  expectParameter(assert, queries, Number(row.id), `GET /api/listings/${row.id}`);
});

test("Step 3: an id that does not exist answers 404 with a JSON error", async () => {
  await getDetails((await pickRow("price IS NOT NULL")).id); // the route must exist first
  const [{ missing }] = await oracle(`SELECT ISNULL(MAX(id), 0) + 7 AS missing FROM ${TABLE}`);
  expectError(assert, await get(`/api/listings/${missing}`), 404, `GET /api/listings/${missing} (no such id)`);
});

test("Step 3: an id that is not a number answers 400 with a JSON error", async () => {
  for (const bad of ["abc", "12abc"]) {
    const { value: res, queries } = await recordQueries(() => get(`/api/listings/${bad}`));
    expectError(assert, res, 400, `GET /api/listings/${bad}`);
    assert.equal(queries.length, 0, `GET /api/listings/${bad}: validate the id in the controller BEFORE calling the DAL`);
  }
});

test("Step 3: a database error answers 500 with a JSON error", async () => {
  const row = await pickRow("price IS NOT NULL");
  failNextQueryWith();
  expectError(assert, await get(`/api/listings/${row.id}`), 500, `GET /api/listings/${row.id} when the database fails`);
});

test("Bonus: amenities is an array parsed from the text {Wifi,Kitchen,\"Hair dryer\"}", { todo: "bonus" }, async () => {
  const row = await pickRow("amenities LIKE '{%\"%' ", "id");
  const details = await getDetails(row.id);
  const expected = row.amenities.replace(/^\{|\}$/g, "").split(",").map((a) => a.trim().replace(/^"|"$/g, "")).filter(Boolean);
  assert.deepEqual(details.amenities, expected, `GET /api/listings/${row.id}: amenities should be ${JSON.stringify(expected)}`);
  const none = await pickRow("amenities = '{}'");
  assert.deepEqual((await getDetails(none.id)).amenities, [], "amenities {} should become an empty array []");
});

test("Bonus: hostResponseRate is a percent text made with STR, like \"100%\"", { todo: "bonus" }, async () => {
  const row = await pickRow("host_response_rate IS NOT NULL");
  const { value: details, queries } = await recordQueries(() => getDetails(row.id));
  assert.match(String(details.hostResponseRate), /^\d{1,3}(\.\d+)?%$/, `GET /api/listings/${row.id}: hostResponseRate should look like "100%" (got ${JSON.stringify(details.hostResponseRate)})`);
  expectSqlUses(assert, queries, ["STR"], `GET /api/listings/${row.id}`);
});
