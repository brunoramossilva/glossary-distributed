// Logger estruturado mínimo para os logs operacionais (Entrega 2).
//
// Cada evento vira UMA linha no console:
//   <timestamp ISO> [NÍVEL] <evento> campo=valor campo=valor ...
// Formato consistente e fácil de ler ao vivo e de filtrar depois (ex.: grep req.).

type Valor = string | number | boolean | undefined;
type Campos = Record<string, Valor>;

function formatar(nivel: string, evento: string, campos: Campos): string {
  const ts = new Date().toISOString();
  const pares = Object.entries(campos)
    .filter(([, v]) => v !== undefined)
    .map(([chave, v]) => `${chave}=${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join(" ");
  return `${ts} [${nivel}] ${evento}${pares ? " " + pares : ""}`;
}

export const log = {
  info: (evento: string, campos: Campos = {}) => console.log(formatar("INFO", evento, campos)),
  warn: (evento: string, campos: Campos = {}) => console.warn(formatar("WARN", evento, campos)),
  erro: (evento: string, campos: Campos = {}) => console.error(formatar("ERRO", evento, campos)),
};
