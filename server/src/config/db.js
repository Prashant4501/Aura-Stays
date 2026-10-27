import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export const connectDB = async (uri = env.MONGODB_URI) => {
  if (isConnected) {
    logger.debug('Using existing MongoDB connection');
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      autoIndex: true, // Build indexes in development
    });
    isConnected = true;
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    logger.error({ err: error }, '❌ MongoDB connection error');
    throw error;
  }
};

export const disconnectDB = async () => {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected');
};

export default connectDB;
