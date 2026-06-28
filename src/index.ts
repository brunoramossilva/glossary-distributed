import { app } from "./app";
import { log } from "./log";
import * as store from "./store";
import { caminhoArquivo } from "./persistencia";

// Porta fixa do servidor
const PORTA = 3000;

// Carrega o estado persistido em disco ANTES de aceitar requisições para o
// glossário já subir com os termos salvos em execuções anteriores.
async function main(): Promise<void> {
  await store.iniciar();
  app.listen(PORTA, () => {
    log.info("servidor.iniciado", {
      porta: PORTA,
      url: `http://localhost:${PORTA}`,
      db: caminhoArquivo(),
    });
  });
}

main();
