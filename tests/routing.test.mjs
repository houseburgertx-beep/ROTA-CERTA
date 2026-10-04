import assert from "node:assert/strict";
import test from "node:test";

// Implementação do decodificador de polyline6 para teste unitário Node
function decodeValhallaPolyline(str, precision = 6) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return coordinates;
}

const radians = (value) => (value * Math.PI) / 180;
const haversine = (a, b) => {
  const earth = 6371000;
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(lon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};

function optimizeDeliverySequence(deliveries, startPoint) {
  const withCoords = [];
  const withoutCoords = [];

  for (const d of deliveries) {
    if (
      typeof d.latitude === "number" &&
      typeof d.longitude === "number" &&
      !isNaN(d.latitude) &&
      !isNaN(d.longitude)
    ) {
      withCoords.push(d);
    } else {
      withoutCoords.push(d);
    }
  }

  const ordered = [];
  const distancesMeters = {};
  const pending = [...withCoords];
  let current = startPoint;

  while (pending.length > 0) {
    let bestIdx = 0;
    let minDistance = haversine(current, {
      latitude: pending[0].latitude,
      longitude: pending[0].longitude,
    });

    for (let i = 1; i < pending.length; i++) {
      const dist = haversine(current, {
        latitude: pending[i].latitude,
        longitude: pending[i].longitude,
      });
      if (dist < minDistance) {
        minDistance = dist;
        bestIdx = i;
      }
    }

    const chosen = pending.splice(bestIdx, 1)[0];
    distancesMeters[chosen.id] = Math.round(minDistance);
    ordered.push(chosen);
    current = { latitude: chosen.latitude, longitude: chosen.longitude };
  }

  return {
    ordered: [...ordered, ...withoutCoords],
    distancesMeters,
  };
}

test("decodeValhallaPolyline decodifica string polyline6 em coordenadas válidas", () => {
  const testShape = "pxowWp`skhAl@yHsLiBoIcBiEwAgC_BcD{D{BcEiByEoByFu@aB";
  const points = decodeValhallaPolyline(testShape);

  assert.ok(Array.isArray(points));
  assert.ok(points.length > 0);
  assert.ok(points[0].latitude < 0); // Coordenada no Brasil (Sul)
  assert.ok(points[0].longitude < 0); // Coordenada no Brasil (Oeste)
  assert.equal(typeof points[0].latitude, "number");
  assert.equal(typeof points[0].longitude, "number");
  assert.ok(Math.abs(points[0].latitude - (-12.9847)) < 0.01);
});

test("optimizeDeliverySequence ordena pontos pelo mais próximo e preserva itens sem coordenadas", () => {
  const start = { latitude: -12.9714, longitude: -38.5014 };
  const dFar = { id: "1", latitude: -12.9900, longitude: -38.4500 };
  const dNear = { id: "2", latitude: -12.9720, longitude: -38.5020 };
  const dNoCoord = { id: "3" };

  const result = optimizeDeliverySequence([dFar, dNear, dNoCoord], start);

  assert.equal(result.ordered.length, 3);
  assert.equal(result.ordered[0].id, "2"); // O mais perto de start primeiro
  assert.equal(result.ordered[1].id, "1"); // O mais longe em seguida
  assert.equal(result.ordered[2].id, "3"); // Sem coordenada no fim
  assert.ok(result.distancesMeters["2"] < result.distancesMeters["1"]);
});

test("Fallback local de roteirização opera corretamente em caso de vazio ou ponto único", () => {
  const start = { latitude: -12.9714, longitude: -38.5014 };
  const emptyRes = optimizeDeliverySequence([], start);
  assert.equal(emptyRes.ordered.length, 0);

  const single = { id: "abc", latitude: -12.9750, longitude: -38.5050 };
  const singleRes = optimizeDeliverySequence([single], start);
  assert.equal(singleRes.ordered.length, 1);
  assert.equal(singleRes.ordered[0].id, "abc");
  assert.ok(singleRes.distancesMeters["abc"] > 0);
});
