import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profiles.routes';
import businessRoutes from './routes/businesses.routes';
import postRoutes from './routes/posts.routes';
import messageRoutes from './routes/messages.routes';
import reviewRoutes from './routes/reviews.routes';
import bookmarkRoutes from './routes/bookmarks.routes';
import dealRoutes from './routes/deals.routes';
import aiRoutes from './routes/ai.routes';

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
