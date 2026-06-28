import { EventEmitter } from "node:events";
import type { Termo } from "./store";
import type { EstadoLock } from "./locks";

interface MapaEventos {
  "termos:mudou": Termo[];
  "locks:mudou": EstadoLock[];
}

class Barramento {
  private readonly ee = new EventEmitter();

  constructor() {
    // Cada conexão SSE registra ouvintes; sem limite para não emitir warning
    // de "possible memory leak" quando houver muitos clientes simultâneos.
    this.ee.setMaxListeners(0);
  }

  emitir<E extends keyof MapaEventos>(evento: E, dados: MapaEventos[E]): void {
    this.ee.emit(evento, dados);
  }

  // Inscreve um ouvinte e devolve uma função para cancelar a inscrição
  inscrever<E extends keyof MapaEventos>(
    evento: E,
    ouvinte: (dados: MapaEventos[E]) => void,
  ): () => void {
    this.ee.on(evento, ouvinte as (dados: unknown) => void);
    return () => {
      this.ee.off(evento, ouvinte as (dados: unknown) => void);
    };
  }
}

export const barramento = new Barramento();
