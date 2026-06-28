import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log";

const raizProjeto = dirname(dirname(fileURLToPath(import.meta.url)));

const ARQUIVO = process.env.GLOSSARIO_DB ?? join(raizProjeto, "data", "glossario.json");

export function caminhoArquivo(): string {
  return ARQUIVO;
}

// Lê o arquivo no início. Se não existir, começa vazio. Se estiver corrompido,
// avisa nos logs e começa vazio (não derruba o servidor)
export async function carregar(): Promise<Map<string, string>> {
  try {
    const texto = await readFile(ARQUIVO, "utf8");
    const dados = JSON.parse(texto) as Record<string, string>;
    const mapa = new Map<string, string>(Object.entries(dados));
    log.info("persistencia.carregada", { arquivo: ARQUIVO, termos: mapa.size });
    return mapa;
  } catch (e: unknown) {
    const erro = e as NodeJS.ErrnoException;
    if (erro?.code === "ENOENT") {
      log.info("persistencia.vazia", { arquivo: ARQUIVO });
      return new Map();
    }
    log.erro("persistencia.falha_leitura", {
      arquivo: ARQUIVO,
      erro: erro?.message ?? String(e),
    });
    return new Map();
  }
}

// Corrente de gravações: serializa os salvamentos. `snapshot` é avaliada no
// momento da gravação para sempre persistir o estado mais novo.
let cadeia: Promise<void> = Promise.resolve();

export function salvar(snapshot: () => Map<string, string>): Promise<void> {
  cadeia = cadeia.then(
    () => escrever(snapshot()),
    () => escrever(snapshot()),
  );
  return cadeia;
}

async function escrever(mapa: Map<string, string>): Promise<void> {
  const obj = Object.fromEntries(mapa);
  const texto = JSON.stringify(obj, null, 2);
  await mkdir(dirname(ARQUIVO), { recursive: true });
  const temporario = `${ARQUIVO}.tmp`;
  await writeFile(temporario, texto, "utf8");
  await rename(temporario, ARQUIVO); // troca atômica no sistema de arquivos
}
