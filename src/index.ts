import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { createHandler } from "graphql-http/lib/use/express";
import { schema, root } from "./graphql/schema";
import visitsRoutes from "./routes/visits.routes";
import staffRoutes from "./routes/staff.routes";
import bedsRoutes from "./routes/beds.routes";
import queueRoutes from "./routes/queue.routes";
import inventoryRoutes from "./routes/inventory.routes";
import forecastRoutes from "./routes/forecast.routes";
import summaryRoutes from "./routes/summary.routes";
import { connectMongo } from "./lib/mongo";
import { connectRedis } from "./lib/redis";
import { initWebSocket } from "./lib/websocket";

const PORT = process.env.PORT || 4000;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // --- REST: Patient Loop ---
  app.use("/api/visits", visitsRoutes);
  app.use("/api/staff", staffRoutes);
  app.use("/api/beds", bedsRoutes);
  app.use("/api/queue", queueRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/forecast", forecastRoutes);
  app.use("/api/summary", summaryRoutes);

  // --- GraphQL: District Admin Dashboard ---
  app.all(
    "/api/graphql",
    createHandler({
      schema,
      rootValue: root,
    })
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // --- Demo frontend (Nurse / Doctor / Admin console) ---
  app.use(express.static(path.join(__dirname, "..", "public")));

  const httpServer = http.createServer(app);

  // --- WebSockets: live dashboard updates ---
  initWebSocket(httpServer);

  // --- Connect data stores ---
  await connectMongo();
  await connectRedis();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    console.log(`🩺 REST patient loop:   http://localhost:${PORT}/api/visits`);
    console.log(`📊 GraphQL dashboard:  http://localhost:${PORT}/api/graphql`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
