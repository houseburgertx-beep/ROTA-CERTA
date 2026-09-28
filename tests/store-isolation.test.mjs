import assert from "node:assert/strict";
import test from "node:test";

// Simulação da lógica de isolamento do storeService
function detectStoreId(hostname = "", queryString = "", storedId = null) {
  const queryParams = new URLSearchParams(queryString);
  const queryStore = queryParams.get("store")?.toLowerCase();

  if (queryStore === "foodpark" || hostname.includes("foodpark")) {
    return "foodpark";
  }
  if (queryStore === "houseburger" || hostname.includes("houseburger")) {
    return "houseburger";
  }

  if (storedId && (storedId === "foodpark" || storedId === "houseburger")) {
    return storedId;
  }

  return "houseburger";
}

function getRtdbPathForStore(storeId, subpath) {
  const prefix = storeId === "foodpark" ? "rotacerta/stores/foodpark" : "rotacerta";
  const cleanSub = subpath.replace(/^\/+/, "");
  return `${prefix}/${cleanSub}`;
}

function getStoreCacheKeyForStore(storeId, baseKey) {
  if (storeId === "houseburger") return baseKey;
  return `${baseKey}_${storeId}`;
}

test("detectStoreId resolve corretamente por hostname e query param", () => {
  // Teste por hostname oficial
  assert.equal(detectStoreId("foodpark-entregas.web.app"), "foodpark");
  assert.equal(detectStoreId("houseburger-entregas.web.app"), "houseburger");
  assert.equal(detectStoreId("jornada-conveniencia-5jc-a4829.web.app"), "houseburger");

  // Teste por query param
  assert.equal(detectStoreId("localhost", "?store=foodpark"), "foodpark");
  assert.equal(detectStoreId("localhost", "?store=houseburger"), "houseburger");

  // Prioridade do query param sobre o default
  assert.equal(detectStoreId("", "?store=foodpark"), "foodpark");
  assert.equal(detectStoreId("", ""), "houseburger");
});

test("getRtdbPath isola dados entre House Burger e Food Park", () => {
  // House Burger (100% retrocompatível)
  assert.equal(getRtdbPathForStore("houseburger", "deliveries"), "rotacerta/deliveries");
  assert.equal(getRtdbPathForStore("houseburger", "drivers"), "rotacerta/drivers");
  assert.equal(getRtdbPathForStore("houseburger", "config/takeat"), "rotacerta/config/takeat");

  // Food Park (namespace completamente isolado)
  assert.equal(getRtdbPathForStore("foodpark", "deliveries"), "rotacerta/stores/foodpark/deliveries");
  assert.equal(getRtdbPathForStore("foodpark", "drivers"), "rotacerta/stores/foodpark/drivers");
  assert.equal(getRtdbPathForStore("foodpark", "config/takeat"), "rotacerta/stores/foodpark/config/takeat");
});

test("getStoreCacheKey isola chaves de cache local por loja", () => {
  assert.equal(getStoreCacheKeyForStore("houseburger", "rotacerta_deliveries"), "rotacerta_deliveries");
  assert.equal(getStoreCacheKeyForStore("foodpark", "rotacerta_deliveries"), "rotacerta_deliveries_foodpark");
  assert.equal(getStoreCacheKeyForStore("foodpark", "rotacerta_drivers"), "rotacerta_drivers_foodpark");
  assert.equal(getStoreCacheKeyForStore("foodpark", "rotacerta_takeat_creds"), "rotacerta_takeat_creds_foodpark");
});
