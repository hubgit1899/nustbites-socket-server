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
const hostname = process.env.HOSTNAME || "0.0.0.0"; // Important for Render

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

// Configure CORS - more permissive for development
const corsOptions = {
  origin: dev ? "*" : CLIENT_URL, // Allow all origins in development
  methods: ["GET", "POST"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Add a health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: dev ? "*" : CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Add connection timeout settings
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

  // Add error handling
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

httpServer.listen(PORT, hostname, () => {
  console.log(`🚀 Socket server running on ${hostname}:${PORT}`);
  console.log(`🔒 Accepting connections from: ${CLIENT_URL}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  httpServer.close(() => {
    console.log("Server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  httpServer.close(() => {
    console.log("Server closed");
  });
});
