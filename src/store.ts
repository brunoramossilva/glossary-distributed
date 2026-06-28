import { withKeyLock } from "./locks";
import { barramento } from "./barramento";
import * as persistencia from "./persistencia";

const termos = new Map<string, string>();

export interface Termo {
  chave: string;
  definicao: string;
}

// Erros de domínio. O mapeamento para status HTTP fica na camada HTTP (app.ts),
// para o domínio não depender de detalhes de transporte
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

// Carrega o estado do disco na subida do servidor. Chamado por index.ts antes de
// começar a aceitar requisições
export async function iniciar(): Promise<void> {
  const carregado = await persistencia.carregar();
  termos.clear();
  for (const [chave, definicao] of carregado) termos.set(chave, definicao);
}

// Atraso opcional (ms) para DEMONSTRAÇÃO de concorrência
const DELAY_MS = Number(process.env.GLOSSARIO_DELAY_MS) || 0;
const talvezAtraso = (): Promise<void> =>
  DELAY_MS > 0 ? new Promise((resolve) => setTimeout(resolve, DELAY_MS)) : Promise.resolve();

// Persiste o estado atual em disco (gravação serializada e atômica).
function persistir(): Promise<void> {
  return persistencia.salvar(() => termos);
}

// Avisa os clientes (via SSE) que a lista mudou.
function notificarLista(): void {
  barramento.emitir("termos:mudou", list());
}

// QUERY — leitura de um termo. Leitura é atômica no event loop, não usa lock.
export function query(chave: string): Termo {
  contadores.queries++;
  const definicao = termos.get(chave);
  if (definicao === undefined) throw new TermoNaoEncontradoError(chave);
  return { chave, definicao };
}

// LIST — leitura de todos os termos. Também sem lock.
export function list(): Termo[] {
  return [...termos].map(([chave, definicao]) => ({ chave, definicao }));
}

export function search(termo: string): Termo[] {
  contadores.searches++; 
  const t = termo.toLowerCase();
  return [...termos]
    .filter(([chave, definicao]) =>
      chave.toLowerCase().includes(t) ||
      definicao.toLowerCase().includes(t)
    )
    .map(([chave, definicao]) => ({ chave, definicao }));
}

// ADD — cria um termo novo; falha se já existir (regra de unicidade)
export function add(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    if (termos.has(chave)) throw new TermoJaExisteError(chave);
    await talvezAtraso();
    termos.set(chave, definicao);
    contadores.adds++; 
    await persistir();
    notificarLista();
    return { chave, definicao };
  });
}

// FIX — atualiza um termo existente; falha se não existir.
export function fix(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    if (!termos.has(chave)) throw new TermoNaoEncontradoError(chave);
    await talvezAtraso();
    termos.set(chave, definicao);
    contadores.fixes++; 
    await persistir();
    notificarLista();
    return { chave, definicao };
  });
}

// REMOVE — remove um termo existente; falha se não existir.
export function remove(chave: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    contadores.removes++;
    const definicao = termos.get(chave);
    if (definicao === undefined) throw new TermoNaoEncontradoError(chave);
    termos.delete(chave);
    await persistir();
    notificarLista();
    return { chave, definicao };
  });
}

// Usado apenas pelos testes — limpa o estado em memória entre cada teste
// A persistência em disco aponta para .test-glossario.json (via vitest.config.ts)
export function _resetParaTestes(): void {
  termos.clear();
}

const contadores = { queries: 0, adds: 0, fixes: 0, searches: 0, removes: 0};
export function getStats() {
  return {
    total_termos: termos.size,
    total_queries: contadores.queries,
    total_adds: contadores.adds,
    total_fixes: contadores.fixes,
    total_searches: contadores.searches,
    total_removes: contadores.removes,
    uptime_segundos: Math.floor(process.uptime()),
  };
}