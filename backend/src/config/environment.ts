import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  NODE_ENV: process.env.NODE_ENV || 'development',
  BIN_DIR: process.env.BIN_DIR || path.resolve(process.cwd(), 'bin'),
  DOWNLOADS_DIR: process.env.DOWNLOADS_DIR || path.resolve(process.cwd(), 'temp_downloads'),
};
