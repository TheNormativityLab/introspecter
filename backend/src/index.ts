import 'dotenv/config'
import { logger } from './services/logger';
import http from 'http';
import mongoose from "mongoose";
import { app } from './app'
import dotenv from 'dotenv';
dotenv.config();

const start = async () => {
  const server = http.createServer(app);
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be defined");
  }
  if (!process.env.PORT) {
    throw new Error("PORT must be defined");
  }
   try {
    mongoose.connect(process.env.MONGO_URI, {
      dbName: 'llm_debate'
    });
    logger.info("Connected to MongoDB")
  } catch (e) {
    logger.error(e);
    console.log(e);
  }

  server.listen(process.env.PORT || 8000, () => {
    logger.info(`Services running on port ${process.env.PORT || 8000}`);
  })
}

process.on('SIGINT', () => { logger.info("Bye bye!"); process.exit(); });
start();