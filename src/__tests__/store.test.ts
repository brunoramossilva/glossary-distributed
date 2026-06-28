import { describe, it, expect, beforeEach } from "vitest";
import {
  add, fix, query, list,
  TermoJaExisteError, TermoNaoEncontradoError,
  _resetParaTestes,
} from "../store";

beforeEach(() => {
  _resetParaTestes();
});

describe("add", () => {
  it("cria um termo novo e retorna { chave, definicao }", async () => {
    const resultado = await add("TCP", "Protocolo confiável.");
    expect(resultado).toEqual({ chave: "TCP", definicao: "Protocolo confiável." });
  });

  it("lança TermoJaExisteError se a chave já existe", async () => {
    await add("TCP", "primeira definição");
    await expect(add("TCP", "segunda definição")).rejects.toThrow(TermoJaExisteError);
  });

  it("lança TermoJaExisteError com a chave correta na mensagem", async () => {
    await add("TCP", "def");
    await expect(add("TCP", "def")).rejects.toThrow("TCP");
  });

  it("permite adicionar chaves diferentes sem conflito", async () => {
    await add("TCP", "def1");
    await expect(add("UDP", "def2")).resolves.toEqual({ chave: "UDP", definicao: "def2" });
  });

  it("serializa tentativas concorrentes sobre a mesma chave", async () => {
    const [r1, r2] = await Promise.allSettled([
      add("TCP", "def A"),
      add("TCP", "def B"),
    ]);
    const sucessos = [r1, r2].filter((r) => r.status === "fulfilled");
    const falhas   = [r1, r2].filter((r) => r.status === "rejected");
    expect(sucessos).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect((falhas[0] as PromiseRejectedResult).reason).toBeInstanceOf(TermoJaExisteError);
  });
});

describe("query", () => {
  it("retorna o termo existente", async () => {
    await add("DNS", "Sistema de nomes.");
    expect(query("DNS")).toEqual({ chave: "DNS", definicao: "Sistema de nomes." });
  });

  it("lança TermoNaoEncontradoError para chave inexistente", () => {
    expect(() => query("INEXISTENTE")).toThrow(TermoNaoEncontradoError);
  });

  it("lança com a chave correta na mensagem", () => {
    expect(() => query("XYZ")).toThrow("XYZ");
  });
});

describe("fix", () => {
  it("atualiza a definição de um termo existente", async () => {
    await add("TCP", "definição antiga");
    const resultado = await fix("TCP", "definição nova");
    expect(resultado).toEqual({ chave: "TCP", definicao: "definição nova" });
  });

  it("a atualização é refletida na QUERY subsequente", async () => {
    await add("TCP", "antiga");
    await fix("TCP", "nova");
    expect(query("TCP").definicao).toBe("nova");
  });

  it("lança TermoNaoEncontradoError para chave inexistente", async () => {
    await expect(fix("FANTASMA", "def")).rejects.toThrow(TermoNaoEncontradoError);
  });

  it("serializa concorrência: o segundo FIX vê o resultado do primeiro", async () => {
    await add("TCP", "original");
    await Promise.all([
      fix("TCP", "versão A"),
      fix("TCP", "versão B"),
    ]);
    const def = query("TCP").definicao;
    expect(["versão A", "versão B"]).toContain(def);
  });
});

describe("list", () => {
  it("retorna array vazio quando o glossário está vazio", () => {
    expect(list()).toEqual([]);
  });

  it("retorna todos os termos adicionados", async () => {
    await add("TCP", "def1");
    await add("UDP", "def2");
    const chaves = list().map((t) => t.chave);
    expect(chaves).toContain("TCP");
    expect(chaves).toContain("UDP");
    expect(list()).toHaveLength(2);
  });

  it("não inclui termos após reset", async () => {
    await add("TCP", "def");
    _resetParaTestes();
    expect(list()).toHaveLength(0);
  });
});