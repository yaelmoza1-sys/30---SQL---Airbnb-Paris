// Creates dbo.Paris_Airbnb_listings with ~240 sample rows in an EMPTY SQL Server.
// GitHub Actions uses it, because the course server is not reachable from there.
// You don't need to run it - the course server already has the real table (59,320 rows).
//
// Usage (only against your own local/Docker SQL Server!):  node tests/seed.js
// It refuses to run if the table already exists.

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), quiet: true });
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
};
const DB_NAME = process.env.DB_NAME;

// A small deterministic random generator, so every run creates the same data
let seed = 20081014;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;

// Some names are garbled on purpose, exactly like in the real data (Ã© instead of é)
const NEIGHBOURHOODS = [
  "Louvre", "Bourse", "Temple", "HÃ´tel-de-Ville", "PanthÃ©on", "Luxembourg", "Palais-Bourbon",
  "Ã‰lysÃ©e", "OpÃ©ra", "EntrepÃ´t", "Popincourt", "Reuilly", "Gobelins", "Observatoire", "Vaugirard",
  "Passy", "Batignolles-Monceau", "Buttes-Montmartre", "Buttes-Chaumont", "MÃ©nilmontant",
];
const ROOM_TYPES = [
  ...Array(14).fill("Entire home/apt"), ...Array(4).fill("Private room"), "Hotel room", "Shared room",
];
const PROPERTY_TYPES = ["Apartment", "Apartment", "Apartment", "Condominium", "Loft", "House", "Serviced apartment", "Boutique hotel", "Townhouse", "Guest suite"];
const NAMES = ["Anne", "Julien", "Camille", "Thomas", "LÃ©a", "Nicolas", "Sophie", "Pierre", "Marie", "Antoine", "Chloé", "Hugo", "Emma", "Louis", "InÃ¨s", "Maxime", "Sarah", "Paul", "Manon", "Lucas"];
const AMENITIES = ["Wifi", "Kitchen", "Heating", "Washer", "Essentials", "\"Hair dryer\"", "Iron", "TV", "Elevator", "\"Coffee maker\"", "\"Laptop friendly workspace\"", "\"Smoke detector\"", "Hangers", "Refrigerator"];
const ABOUT = [
  "Bonjour! I love Paris and I love to welcome travelers from all over the world.",
  "I am a photographer living in the heart of the city.",
  "PassionnÃ© de cuisine et de voyages, je serai ravi de vous accueillir.",
  "We are a family of four. When we travel, we rent our flat to nice people.",
  "Ask me anything about the best bakeries in the neighbourhood :)",
];

function makeRows() {
  const rows = [];
  // The example row from the assignment: id 3109
  rows.push({
    id: 3109, host_id: 3631, host_name: "Anne", host_since: 39735, host_is_superhost: "f",
    host_about: null, host_response_rate: null, neighbourhood_cleansed: "Observatoire",
    latitude: 48.83349, longitude: 2.31852, property_type: "Apartment", room_type: "Entire home/apt",
    accommodates: 2, bathrooms: 1, bedrooms: 0, beds: 1, amenities: "{Wifi,Kitchen,Heating,Washer,\"Hair dryer\"}",
    price: 60, number_of_reviews: 9, review_scores_rating: 100,
  });

  // Hosts: most have one place, some have several (for GET /api/hosts/:hostId/listings)
  const hosts = [];
  for (let h = 0; h < 150; h++) {
    const about = chance(0.25) ? null : Array.from({ length: int(1, 12) }, () => pick(ABOUT)).join(" ");
    hosts.push({
      host_id: 4000 + h * 1373,
      host_name: pick(NAMES),
      host_since: chance(0.03) ? null : int(39450, 43700), // 2008 - 2019 as Excel day numbers
      host_is_superhost: chance(0.04) ? null : chance(0.3) ? "t" : "f",
      host_about: about,
      host_response_rate: chance(0.2) ? null : pick([1, 1, 1, 0.98, 0.9, 0.75, 0.5]),
      listings: h < 12 ? int(3, 7) : h < 30 ? 2 : 1,
    });
  }

  let id = 5396;
  for (const host of hosts) {
    for (let i = 0; i < host.listings; i++) {
      id += int(150, 9000);
      const reviews = chance(0.15) ? 0 : int(1, 320);
      const room = pick(ROOM_TYPES);
      const accommodates = room === "Shared room" ? 1 : int(1, 8);
      const { listings, ...hostColumns } = host;
      rows.push({
        id,
        ...hostColumns,
        neighbourhood_cleansed: pick(NEIGHBOURHOODS),
        latitude: Number((48.815 + rand() * 0.085).toFixed(5)),
        longitude: Number((2.255 + rand() * 0.16).toFixed(5)),
        property_type: room === "Hotel room" ? "Boutique hotel" : pick(PROPERTY_TYPES),
        room_type: room,
        accommodates,
        bathrooms: chance(0.05) ? null : pick([1, 1, 1, 1.5, 2]),
        bedrooms: chance(0.05) ? null : Math.min(int(0, 3), accommodates),
        beds: chance(0.05) ? null : int(1, Math.max(1, Math.ceil(accommodates / 2))),
        amenities: chance(0.1) ? "{}" : `{${AMENITIES.filter(() => chance(0.5)).join(",")}}`,
        // Hosts with several places always have one without a price (it must be filtered out)
        price: (listings > 1 && i === listings - 1) || chance(0.04) ? null : pick([int(25, 180), int(25, 180), int(80, 450), int(30, 120) + 0.5]),
        number_of_reviews: reviews,
        review_scores_rating: reviews === 0 || chance(0.05) ? null : pick([100, 100, 98, 97, 96, 95, 93, 91, 90, 88, 85, 80, 73, 60, 40]),
      });
    }
  }
  return rows;
}

async function main() {
  if (!DB_NAME || !process.env.DB_SERVER) throw new Error("DB_SERVER and DB_NAME must be set (server/.env)");
  const master = await new sql.ConnectionPool({ ...config, database: "master" }).connect();
  await master.request().input("name", sql.NVarChar, DB_NAME)
    .query("IF DB_ID(@name) IS NULL EXEC('CREATE DATABASE [' + @name + ']')");
  await master.close();

  const pool = await new sql.ConnectionPool({ ...config, database: DB_NAME }).connect();
  const exists = await pool.request().query("SELECT OBJECT_ID('dbo.Paris_Airbnb_listings') AS id");
  if (exists.recordset[0].id !== null) {
    console.log("dbo.Paris_Airbnb_listings already exists - nothing to do");
    await pool.close();
    return;
  }

  // The same column names and types as the real table (only the columns the task uses)
  const table = new sql.Table("dbo.Paris_Airbnb_listings");
  table.create = true;
  table.columns.add("id", sql.Float, { nullable: true });
  table.columns.add("host_id", sql.Float, { nullable: true });
  table.columns.add("host_name", sql.NVarChar(255), { nullable: true });
  table.columns.add("host_since", sql.Float, { nullable: true });
  table.columns.add("host_about", sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add("host_response_rate", sql.Float, { nullable: true });
  table.columns.add("host_is_superhost", sql.NVarChar(255), { nullable: true });
  table.columns.add("neighbourhood_cleansed", sql.NVarChar(255), { nullable: true });
  table.columns.add("latitude", sql.Float, { nullable: true });
  table.columns.add("longitude", sql.Float, { nullable: true });
  table.columns.add("property_type", sql.NVarChar(255), { nullable: true });
  table.columns.add("room_type", sql.NVarChar(255), { nullable: true });
  table.columns.add("accommodates", sql.Float, { nullable: true });
  table.columns.add("bathrooms", sql.Float, { nullable: true });
  table.columns.add("bedrooms", sql.Float, { nullable: true });
  table.columns.add("beds", sql.Float, { nullable: true });
  table.columns.add("amenities", sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add("price", sql.Money, { nullable: true });
  table.columns.add("number_of_reviews", sql.Float, { nullable: true });
  table.columns.add("review_scores_rating", sql.Float, { nullable: true });

  const names = table.columns.map((c) => c.name);
  const rows = makeRows();
  for (const row of rows) table.rows.add(...names.map((n) => (row[n] === undefined ? null : row[n])));
  await pool.request().bulk(table);
  console.log(`✔ created dbo.Paris_Airbnb_listings with ${rows.length} rows in ${DB_NAME}`);
  await pool.close();
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
