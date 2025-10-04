// src/services/redis.ts

import { createAdapter } from "@socket.io/redis-adapter";
import Redis, { RedisOptions } from "ioredis"; // <-- FIX: Import RedisOptions here
import { config } from "../config";

const redisUrl = config.REDIS_URL;

// Configure Redis options to handle TLS for production (e.g., Heroku)
const redisOptions: RedisOptions = {
  // <-- FIX: Use the imported type directly
  // Add a TLS configuration if the URL scheme is 'rediss://'
  tls: redisUrl.startsWith("rediss://")
    ? { rejectUnauthorized: false }
    : undefined,
};

// Create the publisher client with our new options
const pubClient = new Redis(redisUrl, redisOptions);

// Duplicate the publisher client for the subscriber
const subClient = pubClient.duplicate();

// --- CRITICAL: Add error listeners to prevent crashes ---
pubClient.on("error", (err) =>
  console.error("❌ Redis Publisher Error:", err.message)
);
subClient.on("error", (err) =>
  console.error("❌ Redis Subscriber Error:", err.message)
);

// Optional: Log when clients connect successfully
pubClient.on("connect", () => console.log("✅ Redis Publisher connected"));
subClient.on("connect", () => console.log("✅ Redis Subscriber connected"));

// Create the Redis adapter for Socket.IO
export const redisAdapter = createAdapter(pubClient, subClient);

// Export the main publisher client as the default client for other uses
export const redisClient = pubClient;
