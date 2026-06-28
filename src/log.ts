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
