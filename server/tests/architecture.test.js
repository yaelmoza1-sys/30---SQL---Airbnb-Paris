const { test } = require("node:test");
const assert = require("node:assert/strict");
const { jsFilesIn, codeOf } = require("./helpers");

const SQL = /\b(select\s|from\s+dbo\.|where\s|order\s+by)\b/i;

function codeIn(folder) {
  return jsFilesIn(folder).map((file) => ({ file, code: codeOf(file) }));
}

function expectDalHasQueries() {
  const dal = codeIn("dal");
  assert.ok(dal.length > 0, "the dal/ folder should have at least one .js file");
  assert.ok(dal.some((f) => /\bselect\b/i.test(f.code)), "dal/ should contain your SQL queries (SELECT ...) - the DAL is the only place with SQL");
  return dal;
}

test("Architecture: routes/, controllers/, dal/ and config/ each have their part of the code", () => {
  const routes = codeIn("routes");
  assert.ok(routes.some((f) => /Router\s*\(/.test(f.code)), "routes/ should have a file that creates an express.Router() and defines the paths");
  const controllers = codeIn("controllers");
  assert.ok(controllers.some((f) => /\bres\s*\.\s*(json|status|send)\b/.test(f.code)), "controllers/ should have the functions that read req and answer with res.status(...).json(...)");
  expectDalHasQueries();
  const config = codeIn("config");
  assert.ok(config.some((f) => /ConnectionPool|\.connect\s*\(/.test(f.code)), "config/db.js should create the connection pool with the mssql package");
});

test("Architecture: SQL is written only in dal/ (not in routes/, controllers/ or app.js)", () => {
  expectDalHasQueries();
  for (const { file, code } of [...codeIn("routes"), ...codeIn("controllers"), { file: "app.js", code: codeOf("app.js") }]) {
    const strings = (code.match(/(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g) || []).join("\n");
    assert.doesNotMatch(strings, SQL, `${file} contains SQL - move every query into a function in dal/`);
    assert.doesNotMatch(code, /\.query\s*[(`]/, `${file} runs a query - only the DAL runs SQL (the controller calls a DAL function)`);
  }
});

test("Architecture: the DAL does not use req or res", () => {
  for (const { file, code } of expectDalHasQueries()) {
    assert.doesNotMatch(code, /\breq\s*\.\s*(query|params|body)\b|\bres\s*\.\s*(json|status|send)\b/, `${file} uses req/res - the DAL gets plain values as arguments and returns the rows; the controller reads req and answers with res`);
  }
});

test("Architecture: routes only map paths to controller functions (no req/res logic)", () => {
  const routes = codeIn("routes");
  assert.ok(routes.some((f) => /Router\s*\(/.test(f.code)), "routes/ should have a file that creates an express.Router()");
  for (const { file, code } of routes) {
    assert.doesNotMatch(code, /\breq\s*\.|\bres\s*\./, `${file} uses req/res - move that logic into a controller function, and in the router only write router.get("/path", controllerFunction)`);
  }
});
