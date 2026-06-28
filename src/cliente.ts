// Para rodar, com o servidor no ar em outro terminal:
//   npm run cliente

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// Endereço do servidor (mesma porta fixa do index.ts)
const BASE = process.env.GLOSSARIO_URL ?? "http://localhost:3000";

const AJUDA = `Comandos:
  ADD <chave> <definição>    cria um termo novo   (erro se já existir)
  FIX <chave> <definição>    atualiza um termo    (erro se não existir)
  QUERY <chave>              busca a definição de um termo
  LIST                       lista todos os termos
  HELP                       mostra esta ajuda
  SAIR                       encerra o cliente

A <chave> é uma única palavra; o restante da linha é a definição.
Ex.: ADD TCP Protocolo confiável e orientado a conexão.`;

interface Resposta {
  status: number;
  corpo: any;
}

// Faz a requisição HTTP e devolve status + corpo (JSON, quando houver).
async function pedir(metodo: string, caminho: string, corpo?: unknown): Promise<Resposta> {
  const resp = await fetch(BASE + caminho, {
    method: metodo,
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let corpoParsed: any = texto;
  try {
    corpoParsed = texto ? JSON.parse(texto) : null;
  } catch {
    // se não for JSON, mantém o texto cru
  }
  return { status: resp.status, corpo: corpoParsed };
}

// Separa a primeira palavra (chave) do restante da linha (definição)
function chaveEResto(args: string): [string, string] {
  const i = args.indexOf(" ");
  if (i === -1) return [args.trim(), ""];
  return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
}

// Imprime uma resposta que devolve { chave, definicao } ou { erro }
function mostrarTermo(r: Resposta): void {
  if (r.status >= 200 && r.status < 300) {
    console.log(`  ${r.corpo.chave} → ${r.corpo.definicao}`);
    return;
  }
  if (r.corpo && typeof r.corpo === "object" && "erro" in r.corpo) {
    console.log(`  ✗ (${r.status}) ${r.corpo.erro}`);
    if (Array.isArray(r.corpo.detalhes)) {
      for (const d of r.corpo.detalhes) {
        console.log(`      - ${d?.message ?? JSON.stringify(d)}`);
      }
    }
    return;
  }
  console.log(`  ✗ (${r.status}) ${JSON.stringify(r.corpo)}`);
}

async function executar(cmd: string, args: string): Promise<void> {
  switch (cmd) {
    case "ADD": {
      const [chave, definicao] = chaveEResto(args);
      if (!chave || !definicao) return void console.log("  uso: ADD <chave> <definição>");
      mostrarTermo(await pedir("POST", "/termos", { chave, definicao }));
      return;
    }
    case "FIX": {
      const [chave, definicao] = chaveEResto(args);
      if (!chave || !definicao) return void console.log("  uso: FIX <chave> <definição>");
      mostrarTermo(await pedir("PUT", `/termos/${encodeURIComponent(chave)}`, { definicao }));
      return;
    }
    case "QUERY": {
      const [chave] = chaveEResto(args);
      if (!chave) return void console.log("  uso: QUERY <chave>");
      mostrarTermo(await pedir("GET", `/termos/${encodeURIComponent(chave)}`));
      return;
    }
    case "LIST": {
      const r = await pedir("GET", "/termos");
      if (Array.isArray(r.corpo) && r.corpo.length > 0) {
        for (const termo of r.corpo) console.log(`  ${termo.chave} → ${termo.definicao}`);
      } else {
        console.log("  (glossário vazio)");
      }
      return;
    }
    case "HELP":
    case "AJUDA":
    case "?":
      console.log(AJUDA);
      return;
    default:
      console.log(`  comando desconhecido: ${cmd} (digite HELP)`);
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });
  console.log(`Glossário Técnico — cliente interativo (servidor: ${BASE})`);
  console.log("Digite HELP para ver os comandos, ou SAIR para encerrar.\n");

  rl.setPrompt("glossário> ");
  rl.prompt();

  for await (const linhaRaw of rl) {
    const linha = linhaRaw.trim();
    if (!linha) {
      rl.prompt();
      continue;
    }

    const espaco = linha.indexOf(" ");
    const cmd = (espaco === -1 ? linha : linha.slice(0, espaco)).toUpperCase();
    const args = espaco === -1 ? "" : linha.slice(espaco + 1).trim();

    if (cmd === "SAIR" || cmd === "EXIT" || cmd === "QUIT") break;

    try {
      await executar(cmd, args);
    } catch (e) {
      // Erro de rede mais comum: servidor fora do ar.
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ falha ao falar com o servidor (${BASE}): ${msg}`);
      console.log("    o servidor está rodando? (npm run dev em outro terminal)");
    }
    rl.prompt();
  }

  rl.close();
  console.log("\naté mais.");
}

main();
