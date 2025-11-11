// src/env.ts
import dotenv from 'dotenv';
import { z } from 'zod';

// Carrega o .env automaticamente (para dev local)
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string()
    .url()
    .refine((val) => val.startsWith('postgresql://'), {
      message: 'DATABASE_URL deve começar com postgresql://',
    }),
  GEMINI_API_KEY: z.string(),
});

// Valida process.env com o schema
export const env = envSchema.parse(process.env);

// Exporta variáveis individuais, já tipadas
export const PORT = env.PORT;
export const DATABASE_URL = env.DATABASE_URL;
export const GEMINI_API_KEY = env.GEMINI_API_KEY;
