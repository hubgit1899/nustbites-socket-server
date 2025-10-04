// src/socket/handlers.ts

import { Server, Socket } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  LocationPayload,
} from "../types";
import { redisClient } from "../services/redis";

// Define a type for our Socket.IO server and socket instances
type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Helper to define a key for storing order location in Redis
const orderLocationKey = (orderId: string) => `order:${orderId}:location`;
// Set location to expire after 1 hour of inactivity
const LOCATION_EXPIRATION_SECONDS = 3600;

export const registerSocketHandlers = (io: IoServer, socket: IoSocket) => {
  // --- HANDLER: RIDER AUTHENTICATION ---
  const handleAuthenticateRider = (riderId: string) => {
    if (riderId) {
      socket.data.riderId = riderId;
      socket.join(riderId); // Private room for targeted events
      console.log(
        `✅ Rider with ID ${riderId} authenticated and joined their private room.`
      );
    }
  };

  // --- HANDLER: JOINING AN ORDER ROOM ---
  const handleJoinOrderRoom = async (orderId: string) => {
    socket.join(orderId);
    console.log(`🤝 Client ${socket.id} joined room for order: ${orderId}`);

    // Fetch the last known location from Redis and send to the new client
    const locationJson = await redisClient.get(orderLocationKey(orderId));
    if (locationJson) {
      const location: LocationPayload = JSON.parse(locationJson);
      socket.emit("rider_location_update", location);
      console.log(
        `✅ Sent last known location for order ${orderId} to client ${socket.id}`
      );
    }
  };

  // --- HANDLER: RIDER LOCATION BATCH UPDATE ---
  const handleRiderSendsBatchLocation = async (data: {
    orderIds: string[];
    location: LocationPayload;
  }) => {
    const { orderIds, location } = data;
    const riderId = socket.data.riderId;

    if (!riderId) {
      console.warn(
        `⚠️ Location received from unauthenticated socket: ${socket.id}`
      );
      return;
    }

    if (!orderIds || orderIds.length === 0) {
      return; // Nothing to do
    }

    const pipeline = redisClient.pipeline();
    const locationJson = JSON.stringify(location);

    orderIds.forEach((orderId) => {
      // Queue the Redis command to set the location with an expiration time
      pipeline.setex(
        orderLocationKey(orderId),
        LOCATION_EXPIRATION_SECONDS,
        locationJson
      );
    });

    // ▼▼▼ THE FIX IS HERE ▼▼▼
    // Instead of emitting in a loop, we broadcast to all rooms in a single operation.
    // io.to() accepts an array of room names, which is perfect for this use case.
    io.to(orderIds).emit("rider_location_update", location);
    // ▲▲▲ THE FIX IS HERE ▲▲▲

    // Execute all queued Redis commands
    await pipeline.exec();

    console.log(
      `📍 Rider ${riderId} location for orders [${orderIds.join(
        ", "
      )}] updated in Redis and broadcasted.`
    );
  };

  // --- HANDLER: JOINING/LEAVING THE MAIN ORDERS FEED ---
  const handleJoinOrdersFeed = () => {
    socket.join("delivery_orders_feed");
    console.log(`👨‍🚴 Rider ${socket.id} joined orders feed`);
  };

  const handleLeaveOrdersFeed = () => {
    socket.leave("delivery_orders_feed");
    console.log(`👨‍🚴 Rider ${socket.id} left orders feed`);
  };

  // --- REGISTER ALL HANDLERS FOR THE SOCKET ---
  socket.on("authenticate_rider", handleAuthenticateRider);
  socket.on("join_order_room", handleJoinOrderRoom);
  socket.on("rider_sends_batch_location", handleRiderSendsBatchLocation);
  socket.on("join_orders_feed", handleJoinOrdersFeed);
  socket.on("leave_orders_feed", handleLeaveOrdersFeed);
};
