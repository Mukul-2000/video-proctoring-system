import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import uploadRouter from './routes/upload';
import reportRouter from './routes/report';
import path from 'path';
import LogModel from './models/Log.model';

import dotenv from "dotenv";
dotenv.config();

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) =>
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
);

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const PORT = parseInt(process.env.PORT || '4000', 10);
const MONGO_URI = String(process.env.MONGO_URI);


const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/upload', uploadRouter);
app.use('/report', reportRouter);

// simple health
app.get('/health', (_, res) => res.status(200).json({ ok: true }));

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
  });
  socket.on('proctor-event', async(data) => {
    // Broadcast to clients in session; in production save to DB
    io.to(data.sessionId).emit('event', data);
    console.log('event', data);

    try {
      const log = new LogModel({
        type: data.type,
        detail: data.detail,
        ts: data.ts || new Date(),
        sessionId: data.sessionId,
        candidateId: data.candidateId || null,
      });

      await log.save();
      console.log("Log saved:", log._id);
    } catch (err) {
      console.error("Error saving log:", err);
    }
  });
});


mongoose.connect(MONGO_URI).then(() => {
  console.log('MongoDB connected');
}).catch(err => console.warn('MongoDB connection error', err));

server.listen(PORT, '0.0.0.0', () => console.log('Server listening on', PORT));
