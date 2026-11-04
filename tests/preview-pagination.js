// Manual browser preview with disposable in-memory data; no .env or real DB.
const { createFixture, installFixture } = require("./helpers/prismaFixture");
installFixture(createFixture().db);
const app = require("../src/app");
app.listen(3105, "127.0.0.1", () => {
  console.log("SSR fixture preview: http://127.0.0.1:3105/dishes (137 mock dishes; no real database)");
});
