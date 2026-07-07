import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function initWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("[ws] client connected:", socket.id);

    // Dashboard clients join a room per facility to scope updates
    socket.on("join_facility", (facilityId: string) => {
      socket.join(`facility:${facilityId}`);
    });

    socket.on("disconnect", () => {
      console.log("[ws] client disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("WebSocket server not initialized. Call initWebSocket() first.");
  return io;
}

// Event emitted whenever inventory changes (e.g. after pharmacy dispense)
export function emitInventoryUpdate(facilityId: string, payload: unknown) {
  getIO().to(`facility:${facilityId}`).emit("inventory_update", payload);
}

// Event emitted whenever queue sizes change (registration, diagnosis, dispense)
export function emitQueueUpdate(facilityId: string, payload: unknown) {
  getIO().to(`facility:${facilityId}`).emit("queue_update", payload);
}

// Event emitted whenever bed occupancy changes
export function emitBedUpdate(facilityId: string, payload: unknown) {
  getIO().to(`facility:${facilityId}`).emit("bed_update", payload);
}
