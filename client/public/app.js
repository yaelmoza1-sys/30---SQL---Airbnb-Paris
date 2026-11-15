// parisstays - the finished client. It only calls the 3 endpoints from docs/api-contract.md:
//   GET /api/listings?neighbourhood=&roomType=&minPrice=&maxPrice=&sort=&limit=
//   GET /api/listings/:id
//   GET /api/hosts/:hostId/listings

const $ = (selector, root = document) => root.querySelector(selector);

const els = {
  form: $("#search-form"),
  neighbourhood: $("#neighbourhood"),
  minPrice: $("#min-price"),
  maxPrice: $("#max-price"),
  sort: $("#sort"),
  limit: $("#limit"),
  categories: $("#categories"),
  listView: $("#list-view"),
  title: $("#results-title"),
  subtitle: $("#results-subtitle"),
  message: $("#message"),
  results: $("#results"),
  details: $("#details"),
};

const state = { roomType: "", neighbourhoods: new Set(), liked: new Set() };

// ---------------------------------------------------------------- API
async function api(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error("The client server is not reachable.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    const error = new Error((body && body.error) || `The API answered ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

// ---------------------------------------------------------------- helpers
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const niceType = (type) => (type ? type.charAt(0) + type.slice(1).toLowerCase() : "Place");
const money = (n) => (n === null || n === undefined ? "—" : `€${Number(n).toLocaleString("en-US")}`);
const STAR = '<svg class="star" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1.5l4.5 9.6 10.5 1.3-7.7 7.3 2 10.4L16 25l-9.3 5.1 2-10.4L1 12.4l10.5-1.3z"/></svg>';

function ratingText(stars, reviews) {
  if (stars === null || stars === undefined) return "New";
  return `${Number(stars).toFixed(1)}${reviews ? ` (${reviews})` : ""}`;
}

function facts(place) {
  const parts = [];
  if (place.accommodates !== null && place.accommodates !== undefined) parts.push(plural(place.accommodates, "guest"));
  if (place.bedrooms !== null && place.bedrooms !== undefined) parts.push(place.bedrooms === 0 ? "Studio" : plural(place.bedrooms, "bedroom"));
  if (place.beds !== null && place.beds !== undefined) parts.push(plural(place.beds, "bed"));
  if (place.bathrooms !== null && place.bathrooms !== undefined) parts.push(plural(place.bathrooms, "bath"));
  return parts.join(" · ");
}

// A soft "photo" drawn in SVG - the data has no pictures, so every place gets its own Paris illustration
const PALETTES = [
  ["#ffd9df", "#ffeef1", "#ff385c"], ["#cdeeea", "#e9f8f6", "#00a699"], ["#ffe1cc", "#fff2e8", "#fc642d"],
  ["#dfe3f7", "#f0f2fc", "#5b6bc0"], ["#f3dcef", "#faeef8", "#b4589f"], ["#fdeec2", "#fff8e3", "#e0a100"],
];
function photoSvg(id, variant = 0) {
  let seed = (Number(id) * 9301 + 49297 * (variant + 1)) % 233280;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const [sky, light, accent] = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const buildings = [];
  let x = -10;
  while (x < 400) {
    const w = 50 + rnd() * 50;
    const h = 120 + rnd() * 120;
    const top = 380 - h;
    const shade = rnd() > 0.5 ? "#ffffff" : light;
    let windows = "";
    for (let wy = top + 30; wy < 340; wy += 32) {
      for (let wx = x + 10; wx < x + w - 14; wx += 20) {
        windows += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="9" height="16" rx="1.5" fill="${rnd() > 0.82 ? accent : sky}" opacity="${rnd() > 0.82 ? 0.75 : 0.9}"/>`;
      }
    }
    buildings.push(
      `<path d="M${x.toFixed(1)} ${(top + 14).toFixed(1)} l8 -14 h${(w - 16).toFixed(1)} l8 14 V380 H${x.toFixed(1)} Z" fill="${shade}" stroke="${accent}" stroke-opacity=".18"/>${windows}`
    );
    x += w + 2;
  }
  const tower = rnd() > 0.45
    ? `<g transform="translate(${(70 + rnd() * 240).toFixed(0)} 0)" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round" opacity=".85">
         <path d="M0 40 L-6 120 L-22 210 L-44 300 M0 40 L6 120 L22 210 L44 300 M-6 120 H6 M-22 210 H22 M-30 250 Q0 225 30 250"/>
         <path d="M0 22 V40"/></g>`
    : `<circle cx="${(60 + rnd() * 280).toFixed(0)}" cy="${(70 + rnd() * 40).toFixed(0)}" r="${(22 + rnd() * 14).toFixed(0)}" fill="#fff" opacity=".9"/>`;
  return `<svg class="art" viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="380" fill="${sky}"/>${tower}${buildings.join("")}
    <rect y="372" width="400" height="8" fill="${accent}" opacity=".25"/></svg>`;
}

function avatarColor(name) {
  const colors = ["#ff385c", "#00a699", "#fc642d", "#484848", "#5b6bc0", "#b4589f"];
  let sum = 0;
  for (const ch of String(name || "?")) sum += ch.charCodeAt(0);
  return colors[sum % colors.length];
}

// ---------------------------------------------------------------- cards
function cardHtml(card) {
  const favorite = card.stars !== null && card.stars >= 4.8 && card.reviewsCount >= 5;
  const line = [niceType(card.propertyType), card.neighbourhood].filter(Boolean).join(" · ");
  return `
    <article class="card" tabindex="0" data-id="${card.id}" aria-label="${escapeHtml(card.title)}">
      <div class="photo">
        ${photoSvg(card.id)}
        ${favorite ? '<span class="badge">Guest favorite</span>' : ""}
        <button class="heart ${state.liked.has(card.id) ? "liked" : ""}" type="button" aria-label="Save">
          <svg viewBox="0 0 32 32"><path d="M16 28c7-4.7 14-10 14-17a7.1 7.1 0 0 0-14-1.9A7.1 7.1 0 0 0 2 11c0 7 7 12.3 14 17z"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-title">${escapeHtml(card.title)}</span>
          <span class="card-rating">${STAR}${escapeHtml(ratingText(card.stars, card.reviewsCount))}</span>
        </div>
        <div class="card-line">${escapeHtml(line)}</div>
        <div class="card-line">${escapeHtml(facts(card))}</div>
        <div class="card-price"><strong>${money(card.pricePerNight)}</strong> night</div>
      </div>
    </article>`;
}

function showSkeleton(count = 8) {
  els.results.innerHTML = Array.from({ length: count }, () =>
    '<div class="skeleton"><div class="photo"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:55%"></div><div class="bar" style="width:35%"></div></div>'
  ).join("");
}

function showMessage(title, lines = [], isError = false) {
  els.message.hidden = false;
  els.message.className = `message${isError ? " error" : ""}`;
  els.message.innerHTML = `<h2>${escapeHtml(title)}</h2>${lines.map((l) => `<p>${l}</p>`).join("")}`;
}

function errorLines(error) {
  const lines = [escapeHtml(error.message)];
  if (error.status === 404) lines.push("The endpoint does not exist yet - build the router, controller and DAL in <code>server/</code>.");
  else if (error.status === 502) lines.push("Run <code>npm start</code> in the <code>server</code> folder, then refresh this page.");
  else if (error.status === 500) lines.push("Look at the error in the server terminal (is the database connected?).");
  return lines;
}

function rememberNeighbourhoods(cards) {
  let added = false;
  for (const card of cards) {
    if (card.neighbourhood && !state.neighbourhoods.has(card.neighbourhood)) {
      state.neighbourhoods.add(card.neighbourhood);
      added = true;
    }
  }
  if (!added) return;
  const current = els.neighbourhood.value;
  const names = [...state.neighbourhoods].sort((a, b) => a.localeCompare(b));
  // The values come from the API exactly as they are stored (some are garbled - that's the data)
  els.neighbourhood.innerHTML = '<option value="">All of Paris</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  els.neighbourhood.value = current;
}

function currentQuery() {
  const params = new URLSearchParams();
  if (els.neighbourhood.value) params.set("neighbourhood", els.neighbourhood.value);
  if (state.roomType) params.set("roomType", state.roomType);
  if (els.minPrice.value !== "") params.set("minPrice", els.minPrice.value);
  if (els.maxPrice.value !== "") params.set("maxPrice", els.maxPrice.value);
  params.set("sort", els.sort.value);
  params.set("limit", els.limit.value);
  return params;
}

let requestNumber = 0;
async function loadListings() {
  const params = currentQuery();
  const mine = ++requestNumber;
  els.message.hidden = true;
  showSkeleton(Math.min(Number(els.limit.value), 12));
  try {
    const cards = await api(`/api/listings?${params}`);
    if (mine !== requestNumber) return; // a newer search already started
    rememberNeighbourhoods(cards);
    const where = els.neighbourhood.value || "Paris";
    els.title.textContent = state.roomType ? `${state.roomType} stays in ${where}` : `Places to stay in ${where}`;
    els.subtitle.textContent = cards.length
      ? `${plural(cards.length, "stay")} · ${els.sort.value === "rating" ? "top rated first" : "lowest price first"}`
      : "";
    els.results.innerHTML = cards.map(cardHtml).join("");
    if (!cards.length) showMessage("No exact matches", ["Try changing or removing some of your filters."]);
  } catch (error) {
    if (mine !== requestNumber) return;
    els.results.innerHTML = "";
    els.title.textContent = "Places to stay in Paris";
    els.subtitle.textContent = `GET /api/listings?${params}`;
    showMessage(error.status === 400 ? "Check your search" : "We couldn't load the stays", errorLines(error), true);
  }
}

// ---------------------------------------------------------------- details
function detailsHtml(place) {
  const superhost = place.hostIsSuperhost === true;
  const initial = escapeHtml(String(place.hostName || "?").charAt(0).toUpperCase());
  const check = '<span class="check"><svg viewBox="0 0 32 32"><path d="M8 17l5 5 11-12"/></svg></span>';
  const longAbout = place.hostAbout && Number(place.aboutLength) > 320;
  const amenities = Array.isArray(place.amenities) && place.amenities.length
    ? `<div class="section"><h3>What this place offers</h3><ul class="amenities">${place.amenities.slice(0, 16).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul></div>`
    : "";
  const mapLink = place.latitude && place.longitude
    ? `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=16/${place.latitude}/${place.longitude}`
    : null;

  return `
    <button class="back-btn" id="back-btn" type="button">‹ Back to all stays</button>
    <h1>${escapeHtml(place.title)}</h1>
    <div class="details-sub">
      ${STAR}<span>${escapeHtml(ratingText(place.stars, null))}</span><span class="dot">·</span>
      <span>${place.reviewsCount ? plural(place.reviewsCount, "review") : "No reviews yet"}</span><span class="dot">·</span>
      ${superhost ? '<span class="pill superhost">★ Superhost</span><span class="dot">·</span>' : ""}
      ${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener">${escapeHtml(place.neighbourhood)}, Paris</a>` : escapeHtml(place.neighbourhood)}
    </div>

    <div class="gallery">${[0, 1, 2, 3, 4].map((v) => `<div>${photoSvg(place.id, v)}</div>`).join("")}</div>

    <div class="details-body">
      <div>
        <div class="section">
          <h2>${escapeHtml(niceType(place.propertyType))} in ${escapeHtml(place.neighbourhood)}</h2>
          <div class="muted">${escapeHtml(facts(place))}</div>
        </div>

        <div class="section host-mini">
          <div class="host-avatar" style="background:${avatarColor(place.hostName)}">${initial}${superhost ? check : ""}</div>
          <div>
            <strong>Hosted by ${escapeHtml(place.hostName || "a local host")}</strong>
            <div class="muted">${superhost ? "Superhost · " : ""}${place.yearsHosting !== null && place.yearsHosting !== undefined ? `${plural(place.yearsHosting, "year")} hosting` : "New host"}</div>
          </div>
        </div>

        <div class="section">
          <ul class="highlights">
            ${superhost ? `<li><svg viewBox="0 0 32 32"><path d="M16 3l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L16 21.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"/></svg><div><strong>${escapeHtml(place.hostName)} is a Superhost</strong><span>Superhosts are experienced, highly rated hosts.</span></div></li>` : ""}
            <li><svg viewBox="0 0 32 32"><path d="M16 29s10-8.6 10-16a10 10 0 0 0-20 0c0 7.4 10 16 10 16z"/><circle cx="16" cy="13" r="3.5"/></svg><div><strong>${escapeHtml(place.neighbourhood)}</strong><span>${place.latitude !== null ? `${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}` : "Paris"}</span></div></li>
            <li><svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="22" rx="3"/><path d="M4 12h24M10 3v6M22 3v6"/></svg><div><strong>${place.hostSinceYear ? `Hosting since ${place.hostSinceYear}` : "New on parisstays"}</strong><span>${place.hostSince ? `Joined on ${new Date(place.hostSince).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : "Join date unknown"}</span></div></li>
          </ul>
        </div>

        ${amenities}

        <div class="section">
          <h3>Meet your host</h3>
          <div class="host-card">
            <div class="host-profile">
              <div class="who">
                <div class="host-avatar big" style="background:${avatarColor(place.hostName)};margin:0 auto">${initial}${superhost ? check : ""}</div>
                <strong>${escapeHtml(place.hostName || "Host")}</strong>
                <span>${superhost ? "★ Superhost" : "Host"}</span>
              </div>
              <div class="host-stats">
                <div><strong>${place.yearsHosting ?? "—"}</strong><span>Years hosting</span></div>
                <div><strong>${place.hostSinceYear ?? "—"}</strong><span>Joined</span></div>
                ${place.hostResponseRate ? `<div><strong>${escapeHtml(place.hostResponseRate)}</strong><span>Response rate</span></div>` : ""}
              </div>
            </div>
            <div>
              ${place.hostAbout
                ? `<p class="about" id="about-text">${escapeHtml(longAbout ? place.hostAbout.slice(0, 320).trimEnd() + "…" : place.hostAbout)}</p>
                   ${longAbout ? `<button class="link-btn" id="about-more" type="button">Show more (${Number(place.aboutLength).toLocaleString("en-US")} characters) ›</button>` : ""}`
                : '<p class="muted">This host has not written about themselves yet.</p>'}
            </div>
          </div>
        </div>
      </div>

      <aside class="booking">
        <div class="booking-price"><strong>${money(place.pricePerNight)}</strong> <span class="muted">night</span></div>
        <div class="muted">${STAR} ${escapeHtml(ratingText(place.stars, place.reviewsCount))}</div>
        <div class="booking-grid">
          <div><b>Check-in</b>Add date</div><div><b>Checkout</b>Add date</div>
          <div><b>Guests</b>${place.accommodates ? `up to ${place.accommodates}` : "—"}</div><div><b>Room</b>${escapeHtml(place.roomType || "—")}</div>
        </div>
        <button class="reserve" type="button" disabled>Reserve</button>
        <p class="note">Read-only demo - you won't be charged</p>
      </aside>
    </div>

    <h2 class="more-title">More places hosted by <span id="host-name">${escapeHtml(place.hostName || "this host")}</span></h2>
    <div id="host-listings" class="row-scroll"><div class="skeleton"><div class="photo"></div></div></div>`;
}

async function loadHostListings(place) {
  const box = $("#host-listings");
  try {
    const cards = await api(`/api/hosts/${place.hostId}/listings`);
    if (cards[0] && cards[0].hostName) $("#host-name").textContent = cards[0].hostName;
    const others = cards.filter((c) => c.id !== place.id);
    box.innerHTML = others.length
      ? others.map(cardHtml).join("")
      : `<p class="muted">This is the only place ${escapeHtml(place.hostName || "this host")} has with a price.</p>`;
  } catch (error) {
    box.innerHTML = `<p class="muted">Could not load the host's places: ${escapeHtml(error.message)}</p>`;
  }
}

async function showDetails(id) {
  els.listView.hidden = true;
  els.details.hidden = false;
  els.details.innerHTML = '<div class="skeleton"><div class="bar" style="width:40%;height:28px"></div><div class="photo" style="aspect-ratio:3/1;margin-top:24px"></div></div>';
  window.scrollTo({ top: 0 });
  try {
    const place = await api(`/api/listings/${encodeURIComponent(id)}`);
    els.details.innerHTML = detailsHtml(place);
    document.title = `${place.title} · parisstays`;
    const more = $("#about-more");
    if (more) {
      more.addEventListener("click", () => {
        $("#about-text").textContent = place.hostAbout;
        more.remove();
      });
    }
    if (place.hostId !== null && place.hostId !== undefined) loadHostListings(place);
    else $("#host-listings").innerHTML = "";
  } catch (error) {
    els.details.innerHTML = `<button class="back-btn" id="back-btn" type="button">‹ Back to all stays</button>`;
    const box = document.createElement("div");
    box.className = "message error";
    box.innerHTML = `<h2>${error.status === 404 ? "This place doesn't exist" : "We couldn't load this place"}</h2>${errorLines(error).map((l) => `<p>${l}</p>`).join("")}`;
    els.details.appendChild(box);
  }
}

function showList() {
  els.details.hidden = true;
  els.listView.hidden = false;
  document.title = "parisstays · Places to stay in Paris";
}

// ---------------------------------------------------------------- routing + events
function route() {
  const match = location.hash.match(/^#\/listing\/(.+)$/);
  if (match) showDetails(decodeURIComponent(match[1]));
  else showList();
}

document.addEventListener("click", (event) => {
  const heart = event.target.closest(".heart");
  if (heart) {
    const id = Number(heart.closest(".card").dataset.id);
    state.liked.has(id) ? state.liked.delete(id) : state.liked.add(id);
    heart.classList.toggle("liked");
    return;
  }
  if (event.target.closest("#back-btn")) {
    location.hash = "#/";
    return;
  }
  const card = event.target.closest(".card");
  if (card) location.hash = `#/listing/${card.dataset.id}`;
});

document.addEventListener("keydown", (event) => {
  const card = event.target.closest && event.target.closest(".card");
  if (card && event.key === "Enter") location.hash = `#/listing/${card.dataset.id}`;
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  location.hash = "#/";
  loadListings();
});

els.categories.addEventListener("click", (event) => {
  const button = event.target.closest(".category");
  if (!button) return;
  els.categories.querySelectorAll(".category").forEach((b) => b.classList.toggle("active", b === button));
  state.roomType = button.dataset.roomType;
  location.hash = "#/";
  loadListings();
});

for (const select of [els.sort, els.limit, els.neighbourhood]) {
  select.addEventListener("change", () => {
    location.hash = "#/";
    loadListings();
  });
}

window.addEventListener("hashchange", route);

// Start: load the cards, and fill the neighbourhood list with values that came from the API
loadListings();
api("/api/listings?sort=rating&limit=50").then(rememberNeighbourhoods).catch(() => {});
route();
