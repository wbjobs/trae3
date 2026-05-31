import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setupSocket } from "./socket.js";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types.js";

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    methods: ["GET", "POST"],
  },
});

setupSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received");
  io.close();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received");
  io.close();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

export default app;
