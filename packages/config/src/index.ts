import { z } from 'zod';

export const serverEnvSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RAILRADAR_API_KEY: z.string().optional().default('mock_railradar_key'),
  MAPTILER_API_KEY: z.string().optional().default('mock_maptiler_key'),
  OPENWEATHER_API_KEY: z.string().optional().default('mock_openweather_key'),
  OPENTOPOGRAPHY_API_KEY: z.string().optional().default('mock_opentopography_key'),
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@localhost:5432/exprest'),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  AUTH_SECRET: z.string().optional().default('dev_secret_change_in_prod'),
  PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  NEXT_PUBLIC_MAPTILER_KEY: z.string().optional(),
  NEXT_PUBLIC_OPENWEATHER_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
