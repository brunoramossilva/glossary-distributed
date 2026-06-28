import { barramento } from "./barramento";

export interface EstadoLock {
  chave: string;
  ocupado: boolean; // há uma operação na seção crítica desta chave
  aguardando: number; // quantas operações esperam a liberação desta chave
}

interface Entrada {
  cauda: Promise<void>; // fim da corrente de operações desta chave
  ocupado: boolean;
  aguardando: number;
}

const entradas = new Map<string, Entrada>();

// Retrato apenas das travas "ativas" (ocupadas ou com fila)
function retrato(): EstadoLock[] {
  const lista: EstadoLock[] = [];
  for (const [chave, e] of entradas) {
    if (e.ocupado || e.aguardando > 0) {
      lista.push({ chave, ocupado: e.ocupado, aguardando: e.aguardando });
    }
  }
  return lista;
}

export function estadoLocks(): EstadoLock[] {
  return retrato();
}

function publicar(): void {
  barramento.emitir("locks:mudou", retrato());
}

export function withKeyLock<T>(chave: string, fn: () => Promise<T> | T): Promise<T> {
  let entrada = entradas.get(chave);
  if (!entrada) {
    entrada = { cauda: Promise.resolve(), ocupado: false, aguardando: 0 };
    entradas.set(chave, entrada);
  }
  const e = entrada;

  // Se a chave já está ocupada ou com fila, esta operação entra "aguardando"
  if (e.ocupado || e.aguardando > 0) {
    e.aguardando += 1;
    publicar();
  }

  const anterior = e.cauda;

  // Roda `fn` depois da anterior terminar (mesmo que a anterior tenha falhado)
  const resultado = anterior.then(
    () => iniciar(),
    () => iniciar(),
  );

  async function iniciar(): Promise<T> {
    // Assumiu a seção crítica: sai da fila e marca ocupado
    if (e.aguardando > 0) e.aguardando -= 1;
    e.ocupado = true;
    publicar();
    try {
      return await fn();
    } finally {
      e.ocupado = false;
      publicar();
    }
  }

  // Elo que nunca rejeita, para não quebrar o encadeamento da próxima operação
  const elo = resultado.then(
    () => undefined,
    () => undefined,
  );
  e.cauda = elo;

  // Limpa a entrada quando esta for a última da corrente e a trava estiver
  // livre (sem ocupado nem fila) para o Map não crescer indefinidamente
  void elo.then(() => {
    const atual = entradas.get(chave);
    if (atual === e && atual.cauda === elo && !atual.ocupado && atual.aguardando === 0) {
      entradas.delete(chave);
    }
  });

  // O chamador recebe o resultado real (que pode rejeitar com erro de domínio)
  return resultado;
}
