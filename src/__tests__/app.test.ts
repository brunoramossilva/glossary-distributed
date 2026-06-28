import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { _resetParaTestes } from "../store";

beforeEach(() => {
  _resetParaTestes();
});

// HEALTH

describe("GET /health", () => {
  it("retorna 200 com status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ADD

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

// QUERY

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

// FIX

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

// LIST

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

  it("filtra por substring na chave via ?busca=", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "Protocolo confiável." });
    await request(app).post("/termos").send({ chave: "UDP", definicao: "Protocolo sem conexão." });
    await request(app).post("/termos").send({ chave: "DNS", definicao: "Sistema de nomes." });

    const res = await request(app).get("/termos?busca=TCP");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].chave).toBe("TCP");
  });

  it("filtra por substring na definição via ?busca=", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "Protocolo confiável." });
    await request(app).post("/termos").send({ chave: "UDP", definicao: "Protocolo sem conexão." });
    await request(app).post("/termos").send({ chave: "DNS", definicao: "Sistema de nomes." });

    const res = await request(app).get("/termos?busca=Protocolo");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("busca é case-insensitive", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "Protocolo confiável." });
    const res = await request(app).get("/termos?busca=tcp");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("retorna array vazio quando busca não encontra nada", async () => {
    const res = await request(app).get("/termos?busca=INEXISTENTE");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("ignora ?busca= vazio e retorna todos", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
    const res = await request(app).get("/termos?busca=");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

  // DELETE
  describe("DELETE /termos/:chave", () => {
    it("200 remove termo existente e retorna o termo removido", async () => {
      await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
      const res = await request(app).delete("/termos/TCP");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chave: "TCP", definicao: "def" });
    });

    it("termo removido não aparece no LIST", async () => {
      await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
      await request(app).delete("/termos/TCP");
      const res = await request(app).get("/termos");
      expect(res.body).toHaveLength(0);
    });

    it("termo removido pode ser adicionado novamente", async () => {
      await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
      await request(app).delete("/termos/TCP");
      const res = await request(app).post("/termos").send({ chave: "TCP", definicao: "nova def" });
      expect(res.status).toBe(201);
    });

    it("404 ao remover chave inexistente", async () => {
      const res = await request(app).delete("/termos/FANTASMA");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("erro");
    });

    it("concorrência: DELETE e ADD simultâneos resultam em estado consistente", async () => {
      await request(app).post("/termos").send({ chave: "TCP", definicao: "original" });
      await Promise.allSettled([
        request(app).delete("/termos/TCP"),
        request(app).post("/termos").send({ chave: "TCP", definicao: "nova" }),
      ]);
      const rList = await request(app).get("/termos");
      expect(rList.status).toBe(200);
      expect(rList.body.length).toBeLessThanOrEqual(1);
      if (rList.body.length === 1) {
        expect(rList.body[0].chave).toBe("TCP");
      }
    });
  });

// LOCKS

describe("GET /locks", () => {
  it("retorna array vazio quando não há travas ativas", async () => {
    const res = await request(app).get("/locks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// API

describe("GET /api", () => {
  it("retorna índice de endpoints", async () => {
    const res = await request(app).get("/api");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("endpoints");
    expect(res.body).toHaveProperty("servico");
  });
});

// STATS

describe("GET /stats", () => {
  it("retorna estrutura de métricas", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_termos: expect.any(Number),
      total_queries: expect.any(Number),
      total_adds: expect.any(Number),
      total_fixes: expect.any(Number),
      total_searches: expect.any(Number),
      uptime_segundos: expect.any(Number),
    });
  });

  it("incrementa total_termos após ADD", async () => {
    await request(app).post("/termos").send({ chave: "TCP", definicao: "def" });
    const res = await request(app).get("/stats");
    expect(res.body.total_termos).toBe(1);
  });
});