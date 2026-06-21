import { withKeyLock } from "./locks";

// Estado central em memória: termo (chave) -> definição.
// A unicidade do termo é garantida pela própria chave do Map.
const termos = new Map<string, string>();

export interface Termo {
  chave: string;
  definicao: string;
}

// Erros de domínio. O mapeamento para status HTTP fica na camada HTTP (app.ts),
// para o domínio não depender de detalhes de transporte.
export class TermoNaoEncontradoError extends Error {
  constructor(public readonly chave: string) {
    super(`termo não encontrado: ${chave}`);
    this.name = "TermoNaoEncontradoError";
  }
}

export class TermoJaExisteError extends Error {
  constructor(public readonly chave: string) {
    super(`termo já existe: ${chave}`);
    this.name = "TermoJaExisteError";
  }
}

// Atraso opcional (ms) APENAS para demonstração de concorrência. Quando
// GLOSSARIO_DELAY_MS > 0, a seção crítica de ADD/FIX cede o controle num
// `await`, tornando visível nos logs (em_voo > 1) o paralelismo entre chaves
// diferentes e fazendo o mutex por chave realmente serializar operações sobre
// a MESMA chave. Em produção fica desligado (0) e não afeta o desempenho.
const DELAY_MS = Number(process.env.GLOSSARIO_DELAY_MS) || 0;
const talvezAtraso = (): Promise<void> =>
  DELAY_MS > 0 ? new Promise((resolve) => setTimeout(resolve, DELAY_MS)) : Promise.resolve();

// QUERY — leitura de um termo. Leitura é atômica no event loop, não usa lock.
export function query(chave: string): Termo {
  const definicao = termos.get(chave);
  if (definicao === undefined) throw new TermoNaoEncontradoError(chave);
  return { chave, definicao };
}

// LIST — leitura de todos os termos. Também sem lock.
export function list(): Termo[] {
  return [...termos].map(([chave, definicao]) => ({ chave, definicao }));
}

// ADD — cria um termo novo; falha se já existir (regra de unicidade).
// Serializado por chave: o "checa-e-escreve" roda sob o mutex daquela chave.
export function add(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    await talvezAtraso();
    if (termos.has(chave)) throw new TermoJaExisteError(chave);
    termos.set(chave, definicao);
    return { chave, definicao };
  });
}

// FIX — atualiza um termo existente; falha se não existir.
// Serializado por chave pelo mesmo motivo do ADD.
export function fix(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    await talvezAtraso();
    if (!termos.has(chave)) throw new TermoNaoEncontradoError(chave);
    termos.set(chave, definicao);
    return { chave, definicao };
  });
}
