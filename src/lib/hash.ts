import crypto from "crypto";

export function hashAadhaar(aadhaarNumber: string): string {
  return crypto.createHash("sha256").update(String(aadhaarNumber)).digest("hex");
}
