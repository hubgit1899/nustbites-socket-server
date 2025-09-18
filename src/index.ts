import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import "dotenv/config";
import { ClientToServerEvents, OrderData, ServerToClientEvents } from "./types";

const PORT = parseInt(process.env.PORT || "3001", 10);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const SOCKET_SECRET_KEY = process.env.SOCKET_SECRET_KEY;

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";

console.log("🔧 Environment Configuration:");
console.log(`   - Environment: ${dev ? "development" : "production"}`);
console.log(`   - Hostname: ${hostname}`);
console.log(`   - Port: ${PORT}`);
console.log(`   - Client URL: ${CLIENT_URL}`);

if (!SOCKET_SECRET_KEY) {
  console.error("❌ FATAL ERROR: SOCKET_SECRET_KEY is not defined.");
  process.exit(1);
}

const app = express();
const httpServer = http.createServer(app);

// Configure CORS
const corsOptions = {
  origin: dev ? "*" : CLIENT_URL,
  methods: ["GET", "POST"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Keep-alive endpoint for free tier
app.get("/keep-alive", (req, res) => {
  res.status(200).json({
    message: "Server is alive",
    timestamp: new Date().toISOString(),
  });
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: dev ? "*" : CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const ORDERS_ROOM = "delivery_orders_feed";

// --- Secure HTTP Endpoint to Trigger Events ---
app.post("/emit", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${SOCKET_SECRET_KEY}`) {
    return res.status(401).send("Unauthorized");
  }

  const { event, data } = req.body;

  switch (event) {
    case "new_order":
      emitNewOrderToRiders(data);
      break;
    case "order_accepted":
      emitOrderAccepted(data);
      break;
    default:
      return res.status(400).send("Invalid event name");
  }

  res.status(200).send(`Event '${event}' emitted successfully.`);
});

// --- Socket.IO Connection Logic ---
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("join_orders_feed", () => {
    socket.join(ORDERS_ROOM);
    console.log(`👨‍🚴 Rider ${socket.id} joined orders feed`);
  });

  socket.on("leave_orders_feed", () => {
    socket.leave(ORDERS_ROOM);
    console.log(`👨‍🚴 Rider ${socket.id} left orders feed`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on("error", (error) => {
    console.error(`🔌 Socket error for ${socket.id}:`, error);
  });
});

// --- Emitter Functions ---
function emitNewOrderToRiders(order: OrderData): void {
  io.to(ORDERS_ROOM).emit("new_order", order);
  console.log(`🚀 Emitted new order ${order.orderId} to ${ORDERS_ROOM} room`);
}

function emitOrderAccepted(payload: { orderId: string }): void {
  io.to(ORDERS_ROOM).emit("order_accepted", payload);
  console.log(
    `✅ Emitted order_accepted for ${payload.orderId} to ${ORDERS_ROOM} room`
  );
}

// --- Keep-Alive Mechanism for Free Tier ---
if (!dev) {
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

  const keepAlive = async () => {
    try {
      const response = await fetch(`http://localhost:${PORT}/keep-alive`);
      if (response.ok) {
        console.log("🔄 Keep-alive ping successful");
      }
    } catch (error) {
      console.log("🔄 Keep-alive ping failed (expected during startup)");
    }
  };

  // Start keep-alive after server is running
  setTimeout(() => {
    keepAlive();
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
    console.log("🔄 Keep-alive mechanism started (10min intervals)");
  }, 60000); // Start after 1 minute
}

httpServer.listen(PORT, hostname, () => {
  console.log(`🚀 Socket server running on ${hostname}:${PORT}`);
  console.log(`🔒 Accepting connections from: ${CLIENT_URL}`);
  if (!dev) {
    console.log("🔄 Keep-alive enabled for free tier hosting");
  }
});

// Track if shutdown is already in progress
let isShuttingDown = false;

// Graceful shutdown function
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log(`${signal} received again, force exiting...`);
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  try {
    // Close socket.io server first
    console.log("Closing Socket.IO server...");
    await new Promise<void>((resolve) => {
      io.close(() => {
        console.log("Socket.IO server closed");
        resolve();
      });
    });

    // Close HTTP server (check if it's still running first)
    if (httpServer.listening) {
      console.log("Closing HTTP server...");
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            console.error("Error closing HTTP server:", err);
            reject(err);
          } else {
            console.log("HTTP server closed");
            resolve();
          }
        });
      });
    } else {
      console.log("HTTP server was already closed");
    }

    console.log("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
}

// Register shutdown handlers (only once)
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});
