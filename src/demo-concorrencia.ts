// Demonstração da estratégia de bloqueio (mutex por chave) de src/locks.ts.

// Para rodar: npm run demo
import { withKeyLock } from "./locks";

let marco = Date.now();
const t = (): string => String(Date.now() - marco).padStart(4, " ");
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function reiniciarRelogio(): void {
  marco = Date.now();
}

// Tarefa que ocupa o lock de `chave` por `ms` ms, registrando início e fim.
function tarefa(nome: string, chave: string, ms: number): Promise<void> {
  return withKeyLock(chave, async () => {
    console.log(`[${t()}ms] início  ${nome}  (chave="${chave}")`);
    await dormir(ms);
    console.log(`[${t()}ms] fim     ${nome}  (chave="${chave}")`);
  });
}

async function cenario1(): Promise<void> {
  console.log("\n── Cenário 1: MESMA chave → serializa (uma de cada vez) ──");
  console.log("   esperado: A1 (0→100), depois A2 (100→200), depois A3 (200→300)\n");
  reiniciarRelogio();
  await Promise.all([
    tarefa("A1", "TCP", 100),
    tarefa("A2", "TCP", 100),
    tarefa("A3", "TCP", 100),
  ]);
}

async function cenario2(): Promise<void> {
  console.log("\n── Cenário 2: chaves DIFERENTES → em paralelo ──");
  console.log("   esperado: X e Y rodando juntos (ambos 0→100)\n");
  reiniciarRelogio();
  await Promise.all([
    tarefa("X", "HTTP", 100),
    tarefa("Y", "DNS", 100),
  ]);
}

async function cenario3(): Promise<void> {
  console.log("\n── Cenário 3: erro no meio NÃO quebra a corrente ──");
  console.log("   esperado: C1 (0→100), C2 falha (~160), C3 ainda roda (160→260)\n");
  reiniciarRelogio();
  const c1 = tarefa("C1", "IP", 100);
  const c2 = withKeyLock("IP", async () => {
    console.log(`[${t()}ms] início  C2  (vai lançar erro)`);
    await dormir(60);
    throw new Error("erro proposital em C2");
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${t()}ms] erro    C2 capturado: ${msg}`);
  });
  const c3 = tarefa("C3", "IP", 100);
  await Promise.all([c1, c2, c3]);
}

async function main(): Promise<void> {
  console.log("Demonstração do mutex por chave (src/locks.ts)");
  await cenario1();
  await cenario2();
  await cenario3();
  console.log("\nConclusão: o lock serializa operações sobre a MESMA chave,");
  console.log("deixa chaves diferentes em paralelo, e um erro numa operação");
  console.log("não impede as seguintes sobre a mesma chave.\n");
}

main();
