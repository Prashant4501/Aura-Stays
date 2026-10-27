import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/hotel_reservation'),
  JWT_SECRET: z.string().min(16).default('super_secret_jwt_access_key_dh_hotel_2026_xyz'),
  JWT_REFRESH_SECRET: z.string().min(16).default('super_secret_jwt_refresh_key_dh_hotel_2026_xyz'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.format(), null, 2)
  );
  process.exit(1);
}

export const env = parsed.data;
export default env;
