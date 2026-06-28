import { withKeyLock } from "./locks";
import { barramento } from "./barramento";
import * as persistencia from "./persistencia";

// Estado central em memória: termo (chave) -> definição.
// A unicidade do termo é garantida pela própria chave do Map. Na Entrega 3 esse
// estado também é PERSISTIDO em disco (ver persistencia.ts), então sobrevive a
// reinícios do servidor.
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

// Carrega o estado do disco na subida do servidor. Chamado por index.ts antes de
// começar a aceitar requisições.
export async function iniciar(): Promise<void> {
  const carregado = await persistencia.carregar();
  termos.clear();
  for (const [chave, definicao] of carregado) termos.set(chave, definicao);
}

// Atraso opcional (ms) para DEMONSTRAÇÃO de concorrência. Quando
// GLOSSARIO_DELAY_MS > 0, a seção crítica de ADD/FIX dorme APÓS a checagem e
// ANTES da escrita, alargando a janela em que a trava fica retida: assim o
// bloqueio transacional do FIX (e a prevenção de ADD duplicado) ficam visíveis
// ao vivo na interface e nos logs. Em uso normal fica desligado (0).
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
  const definicao = termos.get(chave);
  if (definicao === undefined) throw new TermoNaoEncontradoError(chave);
  return { chave, definicao };
}

// LIST — leitura de todos os termos. Também sem lock.
export function list(): Termo[] {
  return [...termos].map(([chave, definicao]) => ({ chave, definicao }));
}

// ADD — cria um termo novo; falha se já existir (regra de unicidade).
// Serializado por chave: o "checa → (janela) → escreve → persiste" roda sob o
// mutex daquela chave. Com a persistência assíncrona dentro da seção crítica, a
// trava passa a prevenir de fato a corrida de criação duplicada da mesma chave.
export function add(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    if (termos.has(chave)) throw new TermoJaExisteError(chave);
    await talvezAtraso();
    termos.set(chave, definicao);
    await persistir();
    notificarLista();
    return { chave, definicao };
  });
}

// FIX — atualiza um termo existente; falha se não existir.
// Bloqueio transacional: enquanto este FIX está na seção crítica (incluindo a
// gravação em disco), qualquer outra alteração sobre a MESMA chave aguarda; já
// chaves diferentes seguem em paralelo.
export function fix(chave: string, definicao: string): Promise<Termo> {
  return withKeyLock(chave, async () => {
    if (!termos.has(chave)) throw new TermoNaoEncontradoError(chave);
    await talvezAtraso();
    termos.set(chave, definicao);
    await persistir();
    notificarLista();
    return { chave, definicao };
  });
}

// Usado apenas pelos testes — limpa o estado em memória entre cada teste.
// A persistência em disco aponta para .test-glossario.json (via vitest.config.ts).
export function _resetParaTestes(): void {
  termos.clear();
}