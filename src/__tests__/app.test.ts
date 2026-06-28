import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { _resetParaTestes } from "../store";

beforeEach(() => {
  _resetParaTestes();
});

// ─── HEALTH ─────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("retorna 200 com status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ─── ADD ────────────────────────────────────────────────────────────────────

describe("POST /termos", () => {
  it("201 ao criar termo válido", async () => {
    const res = await request(app)
      .post("/termos")
      .send({ chave: "TCP", definicao: "Protocolo confiável." });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ chave: "TCP", definicao: "Protocolo confiável." });
  });

  it("201 e aplica trim na chave e definição", async () => {
    const res = await request(app)
      .post("/termos")
      .send({ chave: "  TCP  ", definicao: "  com espaços  " });
    expect(res.status).toBe(201);
    expect(res.body.chave).toBe("TCP");
    expect(res.body.definicao).toBe("com espaços");
  });

  it("409 ao criar termo com chave duplicada", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
    const res = await request(app).post("/termos").send({ chave: "TCP", definicao: "outra" });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("erro");
  });

  it("422 quando chave está ausente", async () => {
    const res = await request(app).post("/termos").send({ definicao: "sem chave" });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty("detalhes");
  });

  it("422 quando chave é só espaços", async () => {
    const res = await request(app).post("/termos").send({ chave: "   ", definicao: "def" });
    expect(res.status).toBe(422);
  });

  it("422 quando chave excede 200 caracteres", async () => {
    const res = await request(app).post("/termos").send({ chave: "A".repeat(201), definicao: "def" });
    expect(res.status).toBe(422);
  });

  it("422 quando definição excede 2000 caracteres", async () => {
    const res = await request(app).post("/termos").send({ chave: "TCP", definicao: "A".repeat(2001) });
    expect(res.status).toBe(422);
  });
});

// ─── QUERY ──────────────────────────────────────────────────────────────────

describe("GET /termos/:chave", () => {
  it("200 retorna o termo existente", async () => {
    await request(app).post("/termos").send({ chave: "DNS", definicao: "Sistema de nomes." });
    const res = await request(app).get("/termos/DNS");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chave: "DNS", definicao: "Sistema de nomes." });
  });

  it("404 para chave inexistente", async () => {
    const res = await request(app).get("/termos/FANTASMA");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("erro");
  });

  it("normaliza trim na chave da URL", async () => {
    await request(app).post("/termos").send({ chave: "  TCP3  ", definicao: "teste" });
    const res = await request(app).get("/termos/%20%20TCP3%20%20");
    expect(res.status).toBe(200);
  });
});

// ─── FIX ────────────────────────────────────────────────────────────────────

describe("PUT /termos/:chave", () => {
  it("200 atualiza definição de termo existente", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "antiga" });
    const res = await request(app).put("/termos/TCP").send({ definicao: "nova definição" });
    expect(res.status).toBe(200);
    expect(res.body.definicao).toBe("nova definição");
  });

  it("404 para chave inexistente", async () => {
    const res = await request(app).put("/termos/FANTASMA").send({ definicao: "qualquer" });
    expect(res.status).toBe(404);
  });

  it("422 quando definição está ausente", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
    const res = await request(app).put("/termos/TCP").send({});
    expect(res.status).toBe(422);
  });

  it("422 quando definição é só espaços", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
    const res = await request(app).put("/termos/TCP").send({ definicao: "   " });
    expect(res.status).toBe(422);
  });

  it("FIX concorrente na mesma chave serializa — segundo aguarda o primeiro", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "original" });
    const [r1, r2] = await Promise.all([
      request(app).put("/termos/TCP").send({ definicao: "versão A" }),
      request(app).put("/termos/TCP").send({ definicao: "versão B" }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // estado final deve ser um dos dois — sem corrupção
    const final = await request(app).get("/termos/TCP");
    expect(["versão A", "versão B"]).toContain(final.body.definicao);
  });
});

// ─── LIST ───────────────────────────────────────────────────────────────────

describe("GET /termos", () => {
  it("200 retorna array vazio quando glossário vazio", async () => {
    const res = await request(app).get("/termos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("200 retorna todos os termos", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def1" });
    await request(app).post("/termos").send({ chave: "UDP", definicao: "def2" });
    const res = await request(app).get("/termos");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ─── LOCKS ──────────────────────────────────────────────────────────────────

describe("GET /locks", () => {
  it("retorna array vazio quando não há travas ativas", async () => {
    const res = await request(app).get("/locks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── API ────────────────────────────────────────────────────────────────────

describe("GET /api", () => {
  it("retorna índice de endpoints", async () => {
    const res = await request(app).get("/api");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("endpoints");
    expect(res.body).toHaveProperty("servico");
  });
});