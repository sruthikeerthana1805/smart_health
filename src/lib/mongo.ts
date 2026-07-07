import mongoose from "mongoose";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://health_admin:health_pass@localhost:27017/health_clinical_db?authSource=admin";

export async function connectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("[mongo] connected to", MONGO_URI.replace(/\/\/.*@/, "//***@"));
}

mongoose.connection.on("error", (err) => {
  console.error("[mongo] connection error:", err);
});
