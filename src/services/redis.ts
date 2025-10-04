// src/services/redis.ts

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { config } from "../config";

// Create a primary Redis client for general use (get, set, etc.)
export const redisClient = new Redis(config.REDIS_URL);

// Create separate clients for pub/sub, as recommended by Redis documentation
const pubClient = new Redis(config.REDIS_URL);
const subClient = pubClient.duplicate();

// Create the Redis adapter for Socket.IO
export const redisAdapter = createAdapter(pubClient, subClient);

redisClient.on("connect", () => console.log("✅ Redis client connected"));
redisClient.on("error", (err) => console.error("❌ Redis client error:", err));
