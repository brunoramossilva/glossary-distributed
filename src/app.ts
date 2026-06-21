import express, { type Request, type Response, type NextFunction } from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { addBodySchema, fixBodySchema } from "./schemas";
import * as store from "./store";
import { TermoJaExisteError, TermoNaoEncontradoError } from "./store";
import { log } from "./log";

export const app = express();

// Faz o parsing do corpo JSON (necessário para POST/PUT).
app.use(express.json());

// Serve a interface web estática: public/index.html é entregue em "/".
// O caminho é resolvido a partir deste arquivo, independente do diretório
// de onde o servidor é iniciado.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(publicDir));

// Log operacional por requisição (Entrega 2): registra "recebida" e "concluída"
// com id próprio, cliente, método+rota, chave (quando há), status, duração e
// quantas requisições estão "em voo" — o que evidencia o isolamento de chamadas
// concorrentes sobre chaves diferentes. (Arquivos estáticos já foram servidos
// acima; aqui passam apenas as requisições do protocolo.)
let seqReq = 0;
let emVoo = 0;
app.use((req: Request, res: Response, next: NextFunction) => {
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
    const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e5) / 10;
    const params = req.params as Record<string, string | undefined>;
    const corpo = req.body as { chave?: unknown } | undefined;
    const chaveBruta = params.chave ?? (corpo && typeof corpo === "object" ? corpo.chave : undefined);
    log.info("req.concluida", {
      req: id,
      metodo: req.method,
      rota: req.originalUrl,
      chave: typeof chaveBruta === "string" ? chaveBruta : undefined,
      status: res.statusCode,
      ms,
      em_voo: emVoo,
    });
  });
  next();
});

// Middleware único de validação de formato (uma forma só de validar).
// Em falha, responde 422; em sucesso, substitui o corpo pelos dados já
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

// Índice do protocolo em JSON. A página web fica em "/" (servida de public/);
// este endpoint expõe a mesma informação em formato legível por máquina.
app.get("/api", (_req: Request, res: Response) => {
  res.status(200).json({
    servico: "Glossário Técnico Compartilhado",
    equipe: 10,
    interface: "GET / — página web (public/index.html)",
    endpoints: {
      "GET /health": "verifica se o servidor está no ar",
      "GET /termos": "lista todos os termos (LIST)",
      "GET /termos/:chave": "busca um termo (QUERY)",
      "POST /termos": "cria um termo (ADD) — corpo: { chave, definicao }",
      "PUT /termos/:chave": "atualiza um termo (FIX) — corpo: { definicao }",
    },
  });
});

// Rota de teste exigida na Entrega 1.
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// LIST — GET /termos
app.get("/termos", (_req: Request, res: Response) => {
  res.status(200).json(store.list());
});

// QUERY — GET /termos/:chave
app.get("/termos/:chave", (req: Request<{ chave: string }>, res: Response) => {
  res.status(200).json(store.query(req.params.chave));
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
    res.status(200).json(await store.fix(req.params.chave, definicao));
  },
);

// Tratador de erros: mapeia erros de domínio para status HTTP.
// (Express 5 encaminha erros de handlers async para cá automaticamente.)
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
