// Carga concorrente (Entrega 2): dispara várias requisições AO MESMO TEMPO,
// sobre chaves DIFERENTES, para evidenciar nos LOGS DO SERVIDOR que requisições
// paralelas são isoladas — cada uma com seu id, com o campo `em_voo` > 1 e sem
// conflito entre chaves distintas.
//
// Uso (com o servidor no ar em outro terminal):
//   npm run carga
// Depois, olhe os logs no terminal onde roda o servidor.

const BASE = process.env.GLOSSARIO_URL ?? "http://localhost:3000";

const TERMOS: Array<[string, string]> = [
  ["TCP", "Transmission Control Protocol"],
  ["UDP", "User Datagram Protocol"],
  ["IP", "Internet Protocol"],
  ["DNS", "Domain Name System"],
  ["HTTP", "HyperText Transfer Protocol"],
  ["TLS", "Transport Layer Security"],
];

async function add([chave, definicao]: [string, string]): Promise<string> {
  const r = await fetch(`${BASE}/termos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chave, definicao }),
  });
  return `${chave}:${r.status}`;
}

async function query(chave: string): Promise<string> {
  const r = await fetch(`${BASE}/termos/${encodeURIComponent(chave)}`);
  return `${chave}:${r.status}`;
}

async function main(): Promise<void> {
  console.log(`Disparando ${TERMOS.length} ADDs simultâneos (chaves diferentes) em ${BASE} ...`);
  const adds = await Promise.all(TERMOS.map(add));
  console.log("  ADD  :", adds.join("  "));

  console.log(`Disparando ${TERMOS.length} QUERYs simultâneos ...`);
  const consultas = await Promise.all(TERMOS.map(([chave]) => query(chave)));
  console.log("  QUERY:", consultas.join("  "));

  console.log("Pronto. Veja os LOGS DO SERVIDOR: cada requisição tem um id próprio,");
  console.log("e o campo em_voo > 1 evidencia chamadas concorrentes isoladas por chave.");
}

main().catch((e) => {
  console.error("falha ao gerar carga (o servidor está no ar?):", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
