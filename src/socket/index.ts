// src/socket/index.ts

import { Server } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types";
import { registerSocketHandlers } from "./handlers";

export const setupSocketServer = (
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >
) => {
  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Register all event listeners for this socket
    registerSocketHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on("error", (error) => {
      console.error(`🔌 Socket error for ${socket.id}:`, error);
    });
  });

  console.log("✅ Socket.IO server handlers configured.");
};
