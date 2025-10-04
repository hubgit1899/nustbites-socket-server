// src/index.ts

import http from "http";
import { Server } from "socket.io";
import { config } from "./config";
import { createApp } from "./api";
import { setupSocketServer } from "./socket";
import { redisAdapter, redisClient } from "./services/redis";

// --- INITIALIZATION ---
const io = new Server({
  cors: {
    origin: config.IS_PROD ? config.CLIENT_URL : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Use the Redis adapter for scalability
io.adapter(redisAdapter);

const app = createApp(io);
const httpServer = http.createServer(app);

// Attach the main server to the HTTP server BEFORE listening
io.attach(httpServer);

// Configure all socket.io event handlers
setupSocketServer(io);

// Listen only on the PORT Heroku provides, omitting the hostname
httpServer.listen(config.PORT, () => {
  console.log(`🚀 Server running on port ${config.PORT}`);
  console.log(`🔒 Accepting connections from: ${config.CLIENT_URL}`);
  if (config.IS_PROD) {
    console.log("🔄 Keep-alive enabled for free tier hosting");
  }
});

// --- KEEP-ALIVE MECHANISM ---
if (config.IS_PROD) {
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000;
  const keepAlive = async () => {
    try {
      const response = await fetch(
        `http://localhost:${config.PORT}/keep-alive`
      );
      if (response.ok) console.log("🔄 Keep-alive ping successful");
    } catch (error) {
      console.log("🔄 Keep-alive ping failed (expected during startup)");
    }
  };
  setTimeout(() => {
    keepAlive();
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
  }, 60000);
}

// --- GRACEFUL SHUTDOWN ---
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    // Closing the Socket.IO server also closes the underlying HTTP server
    await new Promise<void>((resolve) =>
      io.close(() => {
        console.log("Socket.IO and HTTP server closed.");
        resolve();
      })
    );

    await redisClient.quit();
    console.log("Redis client connection closed.");

    console.log("Graceful shutdown completed.");
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
