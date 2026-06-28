import express, { type Request, type Response, type NextFunction } from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { addBodySchema, fixBodySchema, normalizeChave } from "./schemas";
import * as store from "./store";
import { TermoJaExisteError, TermoNaoEncontradoError } from "./store";
import { estadoLocks } from "./locks";
import { barramento } from "./barramento";
import { log } from "./log";

export const app = express();

// Faz o parsing do corpo JSON (necessário para POST/PUT).
app.use(express.json());

// Serve a interface web estática: public/index.html é entregue em "/"
// O caminho é resolvido a partir deste arquivo
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(publicDir));

// Log operacional por requisição: registra "recebida" e "concluída"
// com id próprio, cliente, método+rota, chave (quando há), status, duração e quantas requisições estão "em voo"
let seqReq = 0;
let emVoo = 0;
app.use((req: Request, res: Response, next: NextFunction) => {
  // O fluxo de eventos (SSE) é uma conexão longa que só termina quando o
  // cliente desconecta e fica fora do contador em_voo para não distorcer a
  // observação de concorrência das requisições do protocolo.
  if (req.path === "/eventos") return next();
  const id = ++seqReq;
  emVoo += 1;
  const inicio = process.hrtime.bigint();
  log.info("req.recebida", {
    req: id,
    metodo: req.method,
    rota: req.originalUrl,
    cliente: req.ip,
    em_voo: emVoo,
  });
  res.on("finish", () => {
    emVoo -= 1;
    try {
      const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e5) / 10;
      const params = (req.params ?? {}) as Record<string, string | undefined>;
      const corpo = req.body as { chave?: unknown } | undefined;
      const chaveBruta =
        params.chave ?? (corpo && typeof corpo === "object" ? corpo.chave : undefined);
      log.info("req.concluida", {
        req: id,
        metodo: req.method,
        rota: req.originalUrl,
        chave: typeof chaveBruta === "string" ? chaveBruta : undefined,
        status: res.statusCode,
        ms,
        em_voo: emVoo,
      });
    } catch {
      // ignora qualquer falha de logging
    }
  });
  next();
});

// Middleware único de validação de formato (uma forma só de validar).
// Falha retorna 422. Sucesso substitui o corpo pelos dados já
// normalizados (com trim) e segue para o handler.
function validarCorpo<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(422).json({ erro: "validação falhou", detalhes: r.error.issues });
      return;
    }
    req.body = r.data;
    next();
  };
}

// Índice do protocolo em JSON. A página web fica em "/"
app.get("/api", (_req: Request, res: Response) => {
  res.status(200).json({
    servico: "Glossário Técnico Compartilhado",
    equipe: 10,
    interface: "GET / — página web (public/index.html)",
    endpoints: {
      "GET /health": "verifica se o servidor está no ar",
      "GET /termos": "lista todos os termos (LIST) — ?busca=texto filtra por substring",
      "GET /termos/:chave": "busca um termo (QUERY)",
      "POST /termos": "cria um termo (ADD) — corpo: { chave, definicao }",
      "PUT /termos/:chave": "atualiza um termo (FIX) — corpo: { definicao }",
      "GET /locks": "retrato das travas ativas (ocupadas / com fila)",
      "GET /eventos": "fluxo SSE com estado em tempo real (termos + travas)",
    },
  });
});

// Rota de teste
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Resposta 204 (sem conteúdo) para pedido automático de favicon.ico do navegador
app.get("/favicon.ico", (_req: Request, res: Response) => {
  res.status(204).end();
});

// LIST — GET /termos
app.get("/termos", (_req: Request, res: Response) => {
  const busca = req.query.busca;
  if (typeof busca === "string" && busca.trim().length > 0) {
    res.status(200).json(store.search(busca.trim()));
    return;
  }
  res.status(200).json(store.list());
});

// QUERY — GET /termos/:chave
app.get("/termos/:chave", (req: Request<{ chave: string }>, res: Response) => {
  res.status(200).json(store.query(normalizeChave(req.params.chave)));
});

// ADD — POST /termos
app.post(
  "/termos",
  validarCorpo(addBodySchema),
  async (req: Request, res: Response) => {
    const { chave, definicao } = req.body;
    res.status(201).json(await store.add(chave, definicao));
  },
);

// FIX — PUT /termos/:chave
app.put(
  "/termos/:chave",
  validarCorpo(fixBodySchema),
  async (req: Request<{ chave: string }>, res: Response) => {
    const { definicao } = req.body;
    res.status(200).json(await store.fix(normalizeChave(req.params.chave), definicao));
  },
);

// LOCKS — GET /locks: retrato atual das travas ativas (ocupadas / com fila).
app.get("/locks", (_req: Request, res: Response) => {
  res.status(200).json(estadoLocks());
});

// EVENTOS — GET /eventos: fluxo SSE entrega o estado em TEMPO REAL para a interface
// Envia um retrato inicial (lista de termos + travas) e reenvia a cada mudança publicada no barramento por store/locks.
app.get("/eventos", (req: Request, res: Response) => {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // evita buffering em proxies (ex.: nginx)
  });
  res.flushHeaders?.();

  const enviar = (evento: string, dados: unknown): void => {
    res.write(`event: ${evento}\n`);
    res.write(`data: ${JSON.stringify(dados)}\n\n`);
  };

  // Estado inicial, para o cliente pintar a tela já na conexão
  enviar("termos", store.list());
  enviar("locks", estadoLocks());

  const offTermos = barramento.inscrever("termos:mudou", (lista) => enviar("termos", lista));
  const offLocks = barramento.inscrever("locks:mudou", (snap) => enviar("locks", snap));

  // Comentário-batimento periódico para manter a conexão viva através de proxies
  const batimento = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(batimento);
    offTermos();
    offLocks();
  });
});

// Tratador de erros: mapeia erros de domínio para status HTTP.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof TermoNaoEncontradoError) {
    res.status(404).json({ erro: err.message });
    return;
  }
  if (err instanceof TermoJaExisteError) {
    res.status(409).json({ erro: err.message });
    return;
  }
  log.erro("erro.inesperado", { mensagem: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ erro: "erro interno" });
});
