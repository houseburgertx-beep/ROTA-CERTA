import assert from "node:assert/strict";
import test from "node:test";

function matchTakeatDriver(assignedMotoboy, driversList = []) {
  const rawName = assignedMotoboy.name.trim();
  const candLower = rawName.toLowerCase();

  let match = driversList.find((d) => {
    if (d.active === false) return false;
    if (d.takeatId && Number(d.takeatId) === Number(assignedMotoboy.id)) return true;
    const dLower = (d.name || "").toLowerCase().trim();
    return (
      dLower === candLower ||
      dLower.includes(candLower) ||
      candLower.includes(dLower) ||
      (d.email && d.email.toLowerCase().includes(candLower))
    );
  });

  if (!match && assignedMotoboy.phone) {
    const cleanAssignedPhone = assignedMotoboy.phone.replace(/\D/g, "");
    if (cleanAssignedPhone.length >= 8) {
      match = driversList.find((d) => {
        if (!d.phone) return false;
        const cleanDPhone = d.phone.replace(/\D/g, "");
        return cleanDPhone.includes(cleanAssignedPhone) || cleanAssignedPhone.includes(cleanDPhone);
      });
    }
  }

  if (match) {
    return {
      driverName: match.name,
      driverId: match.id,
      phone: match.phone || assignedMotoboy.phone || undefined,
    };
  } else {
    const formatted = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
    return {
      driverName: formatted,
      driverId: `takeat-${assignedMotoboy.id}`,
      phone: assignedMotoboy.phone || undefined,
    };
  }
}

function calculateFinancialStats(deliveries, driverNameFilter, driverIdFilter) {
  const filterNorm = driverNameFilter ? driverNameFilter.toLowerCase().trim() : undefined;
  const idNorm = driverIdFilter ? driverIdFilter.toLowerCase().trim() : undefined;

  const filtered = (filterNorm || idNorm)
    ? deliveries.filter((d) => {
        if (idNorm && d.driverId) {
          const dId = d.driverId.toLowerCase().trim();
          if (dId === idNorm || dId === `drv-${idNorm}` || `drv-${dId}` === idNorm) {
            return true;
          }
        }
        if (!filterNorm || !d.driver) return false;
        const dNorm = d.driver.toLowerCase().trim();
        return dNorm === filterNorm || dNorm.includes(filterNorm) || filterNorm.includes(dNorm);
      })
    : deliveries;

  const deliveredOnly = filtered.filter(
    (d) => d.status.toLowerCase() === "entregue" || d.status.toLowerCase() === "delivered",
  );

  let total = 0;
  for (const item of deliveredOnly) {
    total += Number(item.deliveryFee) || 0;
  }

  return {
    total,
    count: deliveredOnly.length,
  };
}

test("matchTakeatDriver associa motoboy reatribuído no Takeat ao Rota Certa", () => {
  const drivers = [
    {
      id: "drv-sErnkmVPQrXNDTGER1WWXBESZof2",
      name: "Amorim",
      email: "amorim@motoboy.com",
      phone: "(73) 99999-0001",
      active: true,
    },
    {
      id: "drv-VKgsm10i9wWWgazNqe3hQd7hkrB2",
      name: "Stefany",
      email: "stefany@motoboy.com",
      phone: "(73) 99999-0002",
      active: true,
    }
  ];

  const assigned = {
    id: 263244,
    name: "AMORIM",
    phone: "(73) 99999-0001",
    deliveryFee: 9.0
  };

  const matched = matchTakeatDriver(assigned, drivers);
  assert.equal(matched.driverName, "Amorim");
  assert.equal(matched.driverId, "drv-sErnkmVPQrXNDTGER1WWXBESZof2");
});

test("calculateFinancialStats calcula faturamento com tolerância a case e driverId", () => {
  const deliveries = [
    {
      id: "takeat-1",
      order: "#1",
      deliveryFee: 8.0,
      status: "Entregue",
      driver: "AMORIM",
      driverId: "drv-sErnkmVPQrXNDTGER1WWXBESZof2"
    },
    {
      id: "takeat-2",
      order: "#2",
      deliveryFee: 10.0,
      status: "Entregue",
      driver: "Amorim",
      driverId: "drv-sErnkmVPQrXNDTGER1WWXBESZof2"
    },
    {
      id: "takeat-3",
      order: "#3",
      deliveryFee: 7.0,
      status: "Entregue",
      driver: "Stefany",
      driverId: "drv-VKgsm10i9wWWgazNqe3hQd7hkrB2"
    }
  ];

  const statsAmorim = calculateFinancialStats(deliveries, "Amorim", "drv-sErnkmVPQrXNDTGER1WWXBESZof2");
  assert.equal(statsAmorim.count, 2);
  assert.equal(statsAmorim.total, 18.0);

  const statsStefany = calculateFinancialStats(deliveries, "Stefany", "drv-VKgsm10i9wWWgazNqe3hQd7hkrB2");
  assert.equal(statsStefany.count, 1);
  assert.equal(statsStefany.total, 7.0);
});

test("sanitizeDeliveryOrder remove prefixo TK- e recupera senha da loja", () => {
  function sanitizeDeliveryOrder(item) {
    if (!item || typeof item !== "object") return item;
    let order = item.order;
    const pickupCode = item.pickupCode;

    if (pickupCode && typeof pickupCode === "string" && pickupCode.trim()) {
      const cleanPc = pickupCode.trim().replace(/^#+/, "");
      if (!order || order.includes("TK-") || (order.replace(/\D/g, "").length >= 7 && cleanPc.length <= 4)) {
        order = `#${cleanPc}`;
      }
    } else if (order && typeof order === "string" && order.includes("TK-")) {
      order = `#${order.replace(/#?TK-?/i, "").trim()}`;
    }
    return { ...item, order };
  }

  // Caso 1: pedido de loja que veio com #TK-62155127 mas tem senha 9
  const d1 = sanitizeDeliveryOrder({
    id: "takeat-62155127",
    order: "#TK-62155127",
    pickupCode: "9",
    customer: "Jackson"
  });
  assert.equal(d1.order, "#9");

  // Caso 2: pedido de loja que veio com #TK-62164008 e senha 17
  const d2 = sanitizeDeliveryOrder({
    id: "takeat-62164008",
    order: "#TK-62164008",
    pickupCode: "17",
    customer: "Wanderson"
  });
  assert.equal(d2.order, "#17");

  // Caso 3: pedido legado com TK- sem pickupCode conhecido
  const d3 = sanitizeDeliveryOrder({
    id: "takeat-61426964",
    order: "#TK-61426964",
    customer: "Claudio"
  });
  assert.equal(d3.order, "#61426964");
  assert.ok(!d3.order.includes("TK-"));

  // Caso 4: pedido normal sem TK- é preservado intacto
  const d4 = sanitizeDeliveryOrder({
    id: "takeat-1",
    order: "#1",
    customer: "Mirian"
  });
  assert.equal(d4.order, "#1");
});

test("Formatação de exibição de pedidos de loja e iFood", () => {
  function formatDisplayOrder(delivery) {
    const isIfood =
      delivery.platform === "ifood" ||
      Boolean(delivery.ifoodLocalizer) ||
      Boolean(delivery.payment?.toLowerCase().includes("ifood"));

    const cleanOrderNum = (
      (!isIfood && delivery.pickupCode
        ? delivery.pickupCode
        : delivery.order
      ) || ""
    )
      .replace(/#?TK-?/i, "")
      .replace(/^#+/, "")
      .trim();

    return cleanOrderNum
      ? `#${cleanOrderNum}`
      : delivery.order?.startsWith("#")
      ? delivery.order
      : `#${delivery.order}`;
  }

  // Pedido loja com pickupCode
  assert.equal(
    formatDisplayOrder({ platform: "takeat", order: "#TK-62155127", pickupCode: "9" }),
    "#9"
  );
  // Pedido loja sem pickupCode mas com order limpo
  assert.equal(
    formatDisplayOrder({ platform: "takeat", order: "#21" }),
    "#21"
  );
  // Pedido iFood com order próprio e pickupCode
  assert.equal(
    formatDisplayOrder({ platform: "ifood", order: "#18", pickupCode: "18" }),
    "#18"
  );
});

test("isValidIfoodLocalizer valida estritamente 6 a 8 dígitos e rejeita telefones/CPFs", () => {
  function isValidIfoodLocalizer(code) {
    if (!code) return false;
    const clean = String(code).replace(/\D/g, "");
    if (clean.length < 6 || clean.length > 8) return false;
    if (clean.startsWith("0800") || clean.startsWith("739") || clean.startsWith("00")) return false;
    return true;
  }

  // Válidos: 6 a 8 dígitos legítimos
  assert.equal(isValidIfoodLocalizer("75523066"), true);
  assert.equal(isValidIfoodLocalizer("84729103"), true);
  assert.equal(isValidIfoodLocalizer("123456"), true);
  assert.equal(isValidIfoodLocalizer("1234567"), true);

  // Inválidos: Telefones celulares com DDD 73 (11 dígitos) como na imagem do usuário
  assert.equal(isValidIfoodLocalizer("+55 73 99964-3417"), false);
  assert.equal(isValidIfoodLocalizer("73999643417"), false);
  assert.equal(isValidIfoodLocalizer("73988112233"), false);

  // Inválidos: Telefones 0800 ou Takeat (11 dígitos)
  assert.equal(isValidIfoodLocalizer("08007051234"), false);
  assert.equal(isValidIfoodLocalizer("0800 123 4567"), false);

  // Inválidos: Curtos demais, longos demais, nulos
  assert.equal(isValidIfoodLocalizer(""), false);
  assert.equal(isValidIfoodLocalizer(null), false);
  assert.equal(isValidIfoodLocalizer(undefined), false);
  assert.equal(isValidIfoodLocalizer("12345"), false);
  assert.equal(isValidIfoodLocalizer("123456789"), false);
  assert.equal(isValidIfoodLocalizer("00123456"), false);
});

test("Filtro de notificações de novos pedidos ignora histórico e ordens entregues", () => {
  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const prevIds = new Set(["deliv-old-1"]);

  const deliveries = [
    // 1. Pedido antigo entregue do histórico (ex: os 101 pedidos do motoboy)
    {
      id: "deliv-hist-1",
      status: "Entregue",
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      driver: "Guilherme"
    },
    // 2. Pedido já conhecido no snapshot anterior
    {
      id: "deliv-old-1",
      status: "Pronta para sair",
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      driver: "Guilherme"
    },
    // 3. Pedido cancelado
    {
      id: "deliv-canc-1",
      status: "cancelada",
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
      driver: "Guilherme"
    },
    // 4. Pedido antigo não entregue (> 2 horas)
    {
      id: "deliv-stale-1",
      status: "Pronta para sair",
      createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      driver: "Guilherme"
    },
    // 5. Pedido GENUINAMENTE NOVO ATIVO
    {
      id: "deliv-new-1",
      status: "Pronta para sair",
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      driver: "Guilherme"
    }
  ];

  const newForMe = deliveries.filter((d) => {
    if (prevIds.has(d.id)) return false;
    const stLower = String(d.status || "").toLowerCase();
    if (stLower === "entregue" || stLower.includes("cancel")) return false;
    const createdAtMs = d.createdAt ? new Date(d.createdAt).getTime() : 0;
    if (createdAtMs > 0 && now - createdAtMs > twoHoursMs) return false;
    return d.driver === "Guilherme";
  });

  assert.equal(newForMe.length, 1);
  assert.equal(newForMe[0].id, "deliv-new-1");
});

test("Cálculo financeiro suporta meses passados e histórico total", () => {
  const deliveries = [
    {
      id: "deliv-sep-1",
      order: "#101",
      deliveryFee: 10.0,
      status: "Entregue",
      driver: "Guilherme",
      driverId: "drv-gui",
      createdAt: "2026-09-15T20:00:00.000Z",
    },
    {
      id: "deliv-sep-2",
      order: "#102",
      deliveryFee: 15.0,
      status: "Entregue",
      driver: "Guilherme",
      driverId: "drv-gui",
      createdAt: "2026-09-28T21:00:00.000Z",
    },
    {
      id: "deliv-oct-1",
      order: "#103",
      deliveryFee: 8.0,
      status: "Entregue",
      driver: "Guilherme",
      driverId: "drv-gui",
      createdAt: "2026-10-02T19:30:00.000Z",
    },
    {
      id: "deliv-oct-2",
      order: "#104",
      deliveryFee: 12.0,
      status: "Entregue",
      driver: "Amorim",
      driverId: "drv-amo",
      createdAt: "2026-10-05T20:00:00.000Z",
    },
  ];

  function calcByMonth(list, drvName, targetMonth) {
    const delivered = list.filter(
      (d) =>
        (d.status.toLowerCase() === "entregue" || d.status.toLowerCase() === "delivered") &&
        (!drvName || d.driver.toLowerCase() === drvName.toLowerCase())
    );

    const filtered = delivered.filter((d) => {
      if (targetMonth === "all") return true;
      return (d.createdAt || d.deliveredAt || "").startsWith(targetMonth);
    });

    const totalFee = filtered.reduce((acc, d) => acc + (Number(d.deliveryFee) || 0), 0);
    return {
      totalFee,
      totalOrders: filtered.length,
      avgFee: filtered.length > 0 ? totalFee / filtered.length : 0,
    };
  }

  // Setembro de 2026 para Guilherme
  const sepGui = calcByMonth(deliveries, "Guilherme", "2026-09");
  assert.equal(sepGui.totalOrders, 2);
  assert.equal(sepGui.totalFee, 25.0);
  assert.equal(sepGui.avgFee, 12.5);

  // Outubro de 2026 para Guilherme
  const octGui = calcByMonth(deliveries, "Guilherme", "2026-10");
  assert.equal(octGui.totalOrders, 1);
  assert.equal(octGui.totalFee, 8.0);

  // Todos os meses (Histórico Geral) para Guilherme
  const allGui = calcByMonth(deliveries, "Guilherme", "all");
  assert.equal(allGui.totalOrders, 3);
  assert.equal(allGui.totalFee, 33.0);
  assert.equal(allGui.avgFee, 11.0);

  // Histórico Geral de todos os motoboys
  const allTotal = calcByMonth(deliveries, null, "all");
  assert.equal(allTotal.totalOrders, 4);
  assert.equal(allTotal.totalFee, 45.0);
});


