import { z } from "zod";

// Chave do termo: texto não-vazio, sem espaços nas pontas, com limite de tamanho.
const chave = z
  .string()
  .trim()
  .min(1, "chave não pode ser vazia")
  .max(200, "chave excede 200 caracteres");

// Definição do termo: texto não-vazio, sem espaços nas pontas, com limite.
const definicao = z
  .string()
  .trim()
  .min(1, "definicao não pode ser vazia")
  .max(2000, "definicao excede 2000 caracteres");

// Corpo do ADD (POST /termos): chave + definicao.
export const addBodySchema = z.object({ chave, definicao });

// Corpo do FIX (PUT /termos/:chave): só a definicao (a chave vem da URL).
export const fixBodySchema = z.object({ definicao });

// Tipos inferidos a partir dos schemas — uma fonte de verdade só.
export type AddBody = z.infer<typeof addBodySchema>;
export type FixBody = z.infer<typeof fixBodySchema>;

export const normalizeChave = (raw: string): string => raw.trim();