// src/api/index.ts

import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  OrderStatus,
} from "../types";
import { config } from "../config";
import { redisClient } from "../services/redis";
import lag from "event-loop-lag";

// 👇 FIX: Initialize the lag function once with a measurement interval (e.g., 1000ms)
const getEventLoopLag = lag(1000);

const ORDERS_ROOM = "delivery_orders_feed";
const orderLocationKey = (orderId: string) => `order:${orderId}:location`;

export const createApp = (
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >
) => {
  const app = express();

  const corsOptions = {
    origin: config.IS_PROD ? config.CLIENT_URL : "*",
    methods: ["GET", "POST"],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());

  // --- HTTP ROUTES ---
  app.get("/health", (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // Add detailed memory usage (values are in bytes)
      memory: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`, // Resident Set Size
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      },
      // 👇 FIX: Call the initialized function to get the number, then use .toFixed()
      eventLoopLag: getEventLoopLag().toFixed(2) + " ms",
    });
  });

  app.get("/keep-alive", (req, res) => {
    res.status(200).json({
      message: "Server is alive",
      timestamp: new Date().toISOString(),
    });
  });

  // Secure endpoint to push events into the socket server
  app.post("/emit", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${config.SOCKET_SECRET_KEY}`) {
      return res.status(401).send("Unauthorized");
    }

    const { event, data } = req.body;

    switch (event) {
      case "new_order":
        io.to(ORDERS_ROOM).emit("new_order", data);
        console.log(`🚀 Emitted new order ${data.orderId} to ${ORDERS_ROOM}`);
        break;
      case "order_accepted":
        io.to(ORDERS_ROOM).emit("order_accepted", data);
        console.log(
          `✅ Emitted order_accepted for ${data.orderId} to ${ORDERS_ROOM}`
        );
        break;
      case "order_status_update":
        if (!data.riderId || !data.payload) {
          return res
            .status(400)
            .send("Missing riderId or payload for status update");
        }
        const { orderId, status } = data.payload;
        io.to(data.riderId).emit("order_status_updated", data.payload);
        console.log(
          `🔔 Emitted order_status_updated for order ${orderId} to rider ${data.riderId}`
        );

        // If order is finished, remove its location from Redis
        if (
          status === OrderStatus.DELIVERED ||
          status === OrderStatus.CANCELED
        ) {
          redisClient.del(orderLocationKey(orderId));
          console.log(`🧹 Cleaned up location for completed order: ${orderId}`);
        }
        break;
      default:
        return res.status(400).send("Invalid event name");
    }

    res.status(200).send(`Event '${event}' emitted successfully.`);
  });

  return app;
};
