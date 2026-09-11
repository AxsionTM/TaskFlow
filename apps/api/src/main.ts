import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

import { authRouter } from "./modules/auth/auth.routes";
import { tasksRouter } from "./modules/tasks/tasks.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { tagsRouter } from "./modules/tags/tags.routes";
import { habitsRouter } from "./modules/habits/habits.routes";
import { goalsRouter } from "./modules/goals/goals.routes";
import { focusRouter } from "./modules/focus/focus.routes";
import { smartListsRouter } from "./modules/smart-lists/smart-lists.routes";
import { aiRouter } from "./modules/ai/ai.routes";
import { exportRouter } from "./modules/export/export.routes";
import { birthdaysRouter } from "./modules/birthdays/birthdays.routes";
import { graphRouter } from "./modules/graph.routes";
import { notesRouter } from "./modules/notes/notes.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { errorHandler } from "./common/middleware/error-handler";
import { authMiddleware } from "./common/middleware/auth";

dotenv.config();

const app = express();

/**
 * Vercel работает как reverse proxy и ставит X-Forwarded-For.
 * Без trust proxy express-rate-limit не может определить реальный IP
 * и отвечает 429 (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) на каждый запрос.
 * Один хоп — Vercel proxy. Устанавливается ДО любых rate limiter middleware.
 */
app.set('trust proxy', 1);

/**
 * CORS
 *
 * Основной production frontend:
 * https://task-flow-axsion.vercel.app
 *
 * Также оставляем старые/локальные адреса для совместимости.
 */
const configuredOrigins = [
  ...(process.env.CORS_ORIGIN || "").split(","),
  ...(process.env.FRONTEND_URL || "").split(","),

  // Production
  "https://task-flow-axsion.vercel.app",
  "https://task-flow-axion.vercel.app",
  "https://task-flow-wheat-sigma.vercel.app",

  // Local development
  "http://localhost:3000",
  "http://localhost:5173",
]
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);

const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => {
  // Разрешаем запросы без Origin:
  // health checks, server-to-server и т.д.
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  callback(null, false);
};

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  },
});

const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors(corsOptions));

// Явно обрабатываем CORS preflight OPTIONS-запросы.
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);

app.use("/tasks", authMiddleware, tasksRouter);
app.use("/projects", authMiddleware, projectsRouter);
app.use("/tags", authMiddleware, tagsRouter);
app.use("/habits", authMiddleware, habitsRouter);
app.use("/goals", authMiddleware, goalsRouter);
app.use("/focus", authMiddleware, focusRouter);
app.use("/smart-lists", authMiddleware, smartListsRouter);
app.use("/ai", authMiddleware, aiRouter);
app.use("/export", authMiddleware, exportRouter);
app.use("/birthdays", authMiddleware, birthdaysRouter);
app.use("/graph", authMiddleware, graphRouter);
app.use("/notes", authMiddleware, notesRouter);
app.use("/admin", adminRouter);

app.use(errorHandler);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join:user", (userId: string) => {
    socket.join(`user:${userId}`);
  });

  socket.on("join:project", (projectId: string) => {
    socket.join(`project:${projectId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.set("io", io);

if (!process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
}

export { app, io };
