import { describe, it, expect } from "vitest";
import { withKeyLock } from "../locks";

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("withKeyLock", () => {
  it("serializa operações sobre a mesma chave", async () => {
    const ordem: number[] = [];
    await Promise.all([
      withKeyLock("X", async () => { await dormir(30); ordem.push(1); }),
      withKeyLock("X", async () => { await dormir(10); ordem.push(2); }),
      withKeyLock("X", async () => { ordem.push(3); }),
    ]);
    expect(ordem).toEqual([1, 2, 3]);
  });

  it("executa chaves diferentes em paralelo", async () => {
    const inicio = Date.now();
    await Promise.all([
      withKeyLock("A", () => dormir(50)),
      withKeyLock("B", () => dormir(50)),
    ]);
    expect(Date.now() - inicio).toBeLessThan(90);
  });

  it("erro em uma operação não bloqueia as seguintes", async () => {
    const ordem: string[] = [];
    await Promise.allSettled([
      withKeyLock("Y", async () => { await dormir(20); ordem.push("ok1"); }),
      withKeyLock("Y", async () => { throw new Error("falha"); }),
      withKeyLock("Y", async () => { ordem.push("ok3"); }),
    ]);
    expect(ordem).toContain("ok1");
    expect(ordem).toContain("ok3");
  });

  it("retorna o valor da função passada", async () => {
    const resultado = await withKeyLock("Z", () => 42);
    expect(resultado).toBe(42);
  });

  it("propaga o erro da função para o chamador", async () => {
    await expect(
      withKeyLock("W", () => { throw new Error("erro real"); })
    ).rejects.toThrow("erro real");
  });
});