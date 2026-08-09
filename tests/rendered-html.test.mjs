import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("gera a aplicação estática para o Firebase Hosting", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /Rota Certa/);
  assert.match(html, /assets\/index-/);
});
