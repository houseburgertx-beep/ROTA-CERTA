// Script para restaurar todas as entregas do arquivo de volta para a lista principal
// garantindo que todos os ganhos de meses e dias passados apareçam no Extrato Financeiro

async function restoreStore(basePath) {
  console.log(`\nIniciando restauração para ${basePath}...`);
  const archiveUrl = `https://jornada-conveniencia-5jc-a4829-default-rtdb.firebaseio.com/${basePath}/deliveries_archive.json`;
  const res = await fetch(archiveUrl);
  const data = await res.json();
  if (!data) {
    console.log(`Nenhuma entrega no arquivo de ${basePath}.`);
    return;
  }

  const entries = Object.entries(data);
  console.log(`Total de entregas em ${basePath}/deliveries_archive: ${entries.length}`);

  const chunkSize = 100;
  let totalRestored = 0;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const patchBody = {};
    for (const [id, d] of chunk) {
      patchBody[`deliveries/${id}`] = d;
      patchBody[`deliveries_archive/${id}`] = null;
    }

    const patchUrl = `https://jornada-conveniencia-5jc-a4829-default-rtdb.firebaseio.com/${basePath}.json`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error(`Erro ao restaurar lote ${i / chunkSize + 1}: ${patchRes.status} - ${errText}`);
      throw new Error(`Falha na restauração: ${errText}`);
    }

    totalRestored += chunk.length;
    console.log(`Lote restaurado com sucesso: ${totalRestored}/${entries.length}`);
  }

  console.log(`Concluída restauração de ${basePath}: ${totalRestored} pedidos restaurados com sucesso.`);
}

async function main() {
  await restoreStore("rotacerta");
  await restoreStore("rotacerta/stores/foodpark");
  console.log("\nRestauração completa concluída com sucesso!");
}

main().catch((err) => {
  console.error("Falha geral:", err);
  process.exit(1);
});
