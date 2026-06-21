import { app } from "./app";
import { log } from "./log";

// Porta fixa do servidor (a Entrega 1 exige "porta fixada").
// Ajustar para a porta definida pelo professor/equipe, se houver.
const PORTA = 3000;

app.listen(PORTA, () => {
  log.info("servidor.iniciado", { porta: PORTA, url: `http://localhost:${PORTA}` });
});
