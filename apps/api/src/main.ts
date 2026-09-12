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
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { pushRouter, cronRouter } from "./modules/push/push.routes";
import { agentRouter } from "./modules/agent/agent.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { errorHandler } from "./common/middleware/error-handler";
import { authMiddleware, maintenanceGate } from "./common/middleware/auth";
import {
  writeLimiter,
  aiLimiter,
  exportLimiter,
  adminLimiter,
} from "./common/middleware/rate-limits";

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not set. Refusing to start in production.');
}
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set, using insecure development fallback. Never use this in production.');
}
if (!process.env.TURNSTILE_SECRET_KEY) {
  console.warn('WARNING: TURNSTILE_SECRET_KEY is not set, registration runs without CAPTCHA. Set it in production.');
}
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL is not set. Refusing to start in production.');
}

const app = express();

app.set('trust proxy', 1);

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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
  })
);

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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

app.use("/tasks", authMiddleware, maintenanceGate, writeLimiter, tasksRouter);
app.use("/projects", authMiddleware, maintenanceGate, writeLimiter, projectsRouter);
app.use("/tags", authMiddleware, maintenanceGate, writeLimiter, tagsRouter);
app.use("/habits", authMiddleware, maintenanceGate, writeLimiter, habitsRouter);
app.use("/goals", authMiddleware, maintenanceGate, writeLimiter, goalsRouter);
app.use("/focus", authMiddleware, maintenanceGate, writeLimiter, focusRouter);
app.use("/smart-lists", authMiddleware, maintenanceGate, writeLimiter, smartListsRouter);
app.use("/ai", authMiddleware, maintenanceGate, aiLimiter, aiRouter);
app.use("/agent", authMiddleware, maintenanceGate, aiLimiter, agentRouter);
app.use("/export", authMiddleware, maintenanceGate, exportLimiter, exportRouter);
app.use("/birthdays", authMiddleware, maintenanceGate, writeLimiter, birthdaysRouter);
app.use("/graph", authMiddleware, maintenanceGate, graphRouter);
app.use("/notes", authMiddleware, maintenanceGate, writeLimiter, notesRouter);
app.use("/notifications", authMiddleware, maintenanceGate, notificationsRouter);
app.use("/push", authMiddleware, maintenanceGate, writeLimiter, pushRouter);
// Server push dispatch for closed-tab/mobile delivery. Secret-gated (CRON_SECRET),
// no user auth — triggered by Vercel Cron or an external per-minute cron.
app.use("/cron", cronRouter);
app.use("/admin", adminLimiter, adminRouter);

app.use(errorHandler);

io.use(async (socket, next) => {
  try {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (typeof socket.handshake.headers.authorization === "string"
        ? socket.handshake.headers.authorization.replace(/^Bearer /, "")
        : undefined);
    if (!token) return next(new Error("Unauthorized"));

    const { verifyToken } = await import("./common/utils/jwt");
    const { prisma } = await import("./common/utils/prisma");
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isBlocked: true },
    });
    if (!user || user.isBlocked) return next(new Error("Unauthorized"));

    socket.data.userId = user.id;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  const ownId = socket.data.userId as string;

  socket.on("join:user", (userId: string) => {
    if (typeof userId !== "string" || userId !== ownId) return;
    socket.join(`user:${ownId}`);
  });

  socket.on("join:project", async (projectId: string) => {
    try {
      if (typeof projectId !== "string" || projectId.length > 64) return;
      const { prisma } = await import("./common/utils/prisma");
      const membership = await prisma.projectMember.findFirst({
        where: { projectId, userId: ownId },
      });
      if (!membership) return;
      socket.join(`project:${projectId}`);
    } catch {
      // ignore
    }
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
  // Long-lived hosts only (local/dev): per-minute server push dispatch.
  // On Vercel (serverless) this never persists — use Vercel Cron instead.
  const everyMin = 60_000;
  setInterval(() => {
    import('./modules/push/dispatch')
      .then((m) => m.dispatchDuePush().catch((e) => console.error('push dispatch failed', e)))
      .catch((e) => console.error('push dispatch failed', e));
  }, everyMin);
}

export { app, io };
