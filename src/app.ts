import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profiles.routes.js';
import businessRoutes from './routes/businesses.routes.js';
import postRoutes from './routes/posts.routes.js';
import messageRoutes from './routes/messages.routes.js';
import reviewRoutes from './routes/reviews.routes.js';
import bookmarkRoutes from './routes/bookmarks.routes.js';
import dealRoutes from './routes/deals.routes.js';
import aiRoutes from './routes/ai.routes.js';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', messageRoutes);
app.use('/api', reviewRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api', dealRoutes);
app.use('/api/ai', aiRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;
