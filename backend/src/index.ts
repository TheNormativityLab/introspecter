import 'dotenv/config'
import { logger } from './services/logger';
import http from 'http';
import { app } from './app'
import dotenv from 'dotenv';
dotenv.config();

const start = async () => {
  const server = http.createServer(app);
  if (!process.env.PORT) {
    throw new Error("PORT must be defined");
  }
   try {
    logger.info("Connected to PostgreSQL Database");
  } catch (e) {
    logger.error(e);
    console.log(e);
  }

  const port = Number(process.env.PORT) || 8000;
  server.listen(port, '0.0.0.0', () => {
    logger.info(`Services running on port ${port}`);
  })
}

process.on('SIGINT', () => { logger.info("Bye bye!"); process.exit(); });
start();