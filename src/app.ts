import 'dotenv/config'; // Correct way to load dotenv in ES modules
import express, { Request, Response, NextFunction } from 'express';

declare global {
  var mongooseCache: { conn: any, promise: any } | undefined;
  namespace Express {
    interface Request {
      user?: any;
      roomId?: any;
    }
  }
}

import mongoose from 'mongoose';
import cors from 'cors';

// Safe environment variable checks
const checkEnv = () => {
  const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'FRONTEND_URL'];
  const missing = requiredEnv.filter((env) => !process.env[env]);
  if (missing.length > 0) {
    console.error(`WARNING: Missing critical environment variables: ${missing.join(', ')}`);
  }
};
checkEnv();

import authRoutes from './routes/authRoutes.js';
import researchCellRoutes from './routes/researchCellRoutes.js';
import proposalRoutes from './routes/proposalRoutes.js';
import userRoutes from './routes/userRoutes.js';
import noticeRoutes from './routes/noticeRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import committeeRoutes from './routes/committeeRoutes.js';
import supervisorRoutes from './routes/supervisorRoutes.js';
import defenseBoardRoutes from './routes/defenseBoardRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import scheduleSlotRoutes from './routes/scheduleSlotRoutes.js';
import defenseResultRoutes from './routes/defenseResultRoutes.js';
import evaluationRoutes from './routes/evaluationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import aiRoutes from './routes/aiRoutes.js';


const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// MongoDB Serverless Connection Handling
let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

app.use(async (req, res, next) => {
  if (cached!.conn) {
    return next();
  }

  if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI is missing in environment variables");
    return res.status(500).json({ message: 'Internal Server Error: DB configuration missing' });
  }

  if (!cached!.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    cached!.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongoose) => {
      console.log('MongoDB connected for serverless environment (cached)');
      return mongoose;
    }).catch(err => {
      cached!.promise = null;
      console.error('MongoDB connection error:', err);
      throw err;
    });
  }

  try {
    cached!.conn = await cached!.promise;
    next();
  } catch (err) {
    next(err);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/researchcells', researchCellRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/committee', committeeRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/defenseboards', defenseBoardRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/schedule-slots', scheduleSlotRoutes);
app.use('/api/defense-results', defenseResultRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ai', aiRoutes);

// Basic route
app.get('/', (req: Request, res: Response) => {
  res.send('API is running...');
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

export default app;
