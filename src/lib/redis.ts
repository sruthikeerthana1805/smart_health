import { createClient, RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient: RedisClientType = createClient({ url: REDIS_URL });

redisClient.on("error", (err) => console.error("[redis] error:", err));

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("[redis] connected to", REDIS_URL);
  }
}

// ---- Queue key helpers ----
// Each facility gets its own doctor queue: queue:doctor:<facilityId>
export const doctorQueueKey = (facilityId: string) => `queue:doctor:${facilityId}`;
export const pharmacyQueueKey = (facilityId: string) => `queue:pharmacy:${facilityId}`;

// OTP session keys: otp:<phone>
export const otpKey = (phone: string) => `otp:${phone}`;

// Geofence ping keys: geofence:<doctorId>
export const geofenceKey = (doctorId: string) => `geofence:${doctorId}`;
