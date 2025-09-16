import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import uploadRouter from './routes/upload';
import reportRouter from './routes/report';
import LogModel from './models/Log.model';


// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) =>
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
);

const PORT = parseInt(process.env.PORT!, 10);
const MONGO_URI = String(process.env.MONGO_URI);

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });

// Middlewares
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/upload', uploadRouter);
app.use('/report', reportRouter);

// Healthcheck endpoint
app.get('/health', (_, res) => res.sendStatus(200));

// Socket.io
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
  });

  socket.on('proctor-event', async (data) => {
    io.to(data.sessionId).emit('event', data);
    console.log('Proctor event received:', data);

    try {
      const log = new LogModel({
        type: data.type,
        detail: data.detail,
        ts: data.ts || new Date(),
        sessionId: data.sessionId,
        candidateId: data.candidateId || null,
      });
      await log.save();
      console.log('Log saved:', log._id);
    } catch (err) {
      console.error('Error saving log:', err);
    }
  });
});

// Start server safely
async function startServer() {
  try {
    console.log('Starting server...');

    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    // Optionally keep retrying or exit gracefully
  }
}

startServer();

// --- Graceful shutdown handlers ---
process.on('SIGTERM', () => {
  console.log('SIGTERM received: container is being stopped');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.disconnect().then(() => {
      console.log('MongoDB disconnected');
      process.exit(0);
    });
  });
});
