// src/config/index.ts

import "dotenv/config";

const getConfig = () => {
  const PORT = parseInt(process.env.PORT || "3001", 10);
  const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
  const SOCKET_SECRET_KEY = process.env.SOCKET_SECRET_KEY;
  const REDIS_URL = process.env.REDIS_URL;

  if (!SOCKET_SECRET_KEY) {
    console.error("❌ FATAL ERROR: SOCKET_SECRET_KEY is not defined.");
    process.exit(1);
  }
  if (!REDIS_URL) {
    console.error("❌ FATAL ERROR: REDIS_URL is not defined.");
    process.exit(1);
  }

  return {
    PORT,
    CLIENT_URL,
    SOCKET_SECRET_KEY,
    REDIS_URL,
    IS_PROD: process.env.NODE_ENV === "production",
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
  };
};

export const config = getConfig();
