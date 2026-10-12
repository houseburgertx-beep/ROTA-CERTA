// Script de arquivamento seguro de pedidos antigos do RTDB
// Move pedidos com mais de 3 dias com status "Entregue" ou "Cancelado"
// para o nó /rotacerta/deliveries_archive (preservando 100% dos dados para sempre)

async function archiveStore(basePath) {
  console.log(`\nIniciando arquivamento para ${basePath}...`);
  const url = `https://jornada-conveniencia-5jc-a4829-default-rtdb.firebaseio.com/${basePath}/deliveries.json`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data) {
    console.log(`Nenhuma entrega encontrada para ${basePath}.`);
    return;
  }

  const entries = Object.entries(data);
  console.log(`Total de entregas em ${basePath}/deliveries: ${entries.length}`);

  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const toArchive = [];

  for (const [id, d] of entries) {
    if (!d) continue;
    const isDone = d.status === "Entregue" || d.status === "Cancelado";
    const created = d.createdAt ? new Date(d.createdAt).getTime() : 0;
    const isOld = created > 0 && (now - created > threeDaysMs);
    if (isDone && isOld) {
      toArchive.push([id, d]);
    }
  }

  console.log(`Encontradas ${toArchive.length} entregas antigas finalizadas para arquivar.`);
  if (toArchive.length === 0) return;

  // Processa em lotes de 100 para garantir requisições leves e atômicas
  const chunkSize = 100;
  let totalArchived = 0;

  for (let i = 0; i < toArchive.length; i += chunkSize) {
    const chunk = toArchive.slice(i, i + chunkSize);
    const patchBody = {};
    for (const [id, d] of chunk) {
      patchBody[`deliveries_archive/${id}`] = d;
      patchBody[`deliveries/${id}`] = null;
    }

    const patchUrl = `https://jornada-conveniencia-5jc-a4829-default-rtdb.firebaseio.com/${basePath}.json`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error(`Erro ao arquivar lote ${i / chunkSize + 1}: ${patchRes.status} - ${errText}`);
      throw new Error(`Falha no arquivamento: ${errText}`);
    }

    totalArchived += chunk.length;
    console.log(`Lote arquivado com sucesso: ${totalArchived}/${toArchive.length}`);
  }

  console.log(`Concluído arquivamento de ${basePath}: ${totalArchived} pedidos arquivados.`);
}

async function main() {
  await archiveStore("rotacerta");
  await archiveStore("rotacerta/stores/foodpark");
  console.log("\nArquivamento completo concluído com sucesso!");
}

main().catch((err) => {
  console.error("Falha geral:", err);
  process.exit(1);
});
