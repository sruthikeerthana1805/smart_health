import { Request, Response } from "express";
import { Visit, IVisit } from "../models/Visit";
import { hashAadhaar } from "../lib/hash";
import { redisClient, pharmacyQueueKey } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { emitInventoryUpdate, emitQueueUpdate } from "../lib/websocket";

async function findActiveVisit(aadhaarHash: string): Promise<IVisit | null> {
  return Visit.findOne({ aadhaarHash, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } }).sort({ createdAt: -1 });
}

async function runDispense(visit: IVisit) {
  if (visit.currentStatus !== "PHARMACY_QUEUE") {
    throw Object.assign(new Error(`Visit is not in PHARMACY_QUEUE (current status: ${visit.currentStatus}).`), { status: 409 });
  }
  if (visit.prescriptionArray.length === 0) {
    throw Object.assign(new Error("No prescription found for this visit."), { status: 400 });
  }

  const updatedDrugs = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const item of visit.prescriptionArray) {
      const drug = await tx.inventory.findUnique({ where: { drugId: item.drugId } });
      if (!drug) throw new Error(`Drug ${item.drugId} (${item.drugName}) not found in inventory.`);
      if (drug.currentStock < item.quantity) {
        throw new Error(`Insufficient stock for ${item.drugName}: have ${drug.currentStock}, need ${item.quantity}.`);
      }
      results.push(
        await tx.inventory.update({ where: { drugId: item.drugId }, data: { currentStock: { decrement: item.quantity } } })
      );
      await tx.dispenseLog.create({
        data: {
          drugId: item.drugId,
          facilityId: visit.facilityId,
          quantity: item.quantity,
          aadhaarHash: visit.aadhaarHash,
          visitId: visit.id.toString(),
        },
      });
    }
    return results;
  });

  visit.currentStatus = "COMPLETED";
  await visit.save();

  await redisClient.lRem(pharmacyQueueKey(visit.facilityId), 0, visit.id.toString());
  const pharmacyQueueLen = await redisClient.lLen(pharmacyQueueKey(visit.facilityId));
  emitQueueUpdate(visit.facilityId, { queue: "PHARMACY_QUEUE", facilityId: visit.facilityId, length: pharmacyQueueLen });
  emitInventoryUpdate(visit.facilityId, { facilityId: visit.facilityId, updatedDrugs });

  return { visit, updatedDrugs };
}

/** POST /api/visits/:id/dispense — original ID-based route, kept for compatibility. */
export async function dispenseVisit(req: Request, res: Response) {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ error: "Visit not found." });
    const result = await runDispense(visit);
    return res.status(200).json({ message: "Prescription dispensed and visit completed.", ...result });
  } catch (err: any) {
    console.error("[dispenseVisit] error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Internal server error." });
  }
}

/**
 * POST /api/visits/by-aadhaar/:aadhaar_number/dispense
 * Auto-resolves the patient's current active visit — no Visit ID needed.
 */
export async function dispenseByAadhaar(req: Request, res: Response) {
  try {
    const aadhaarHash = hashAadhaar(req.params.aadhaar_number);
    const visit = await findActiveVisit(aadhaarHash);
    if (!visit) return res.status(404).json({ error: "No active visit found for this Aadhaar number." });

    const result = await runDispense(visit);
    return res.status(200).json({ message: "Prescription dispensed and visit completed.", ...result });
  } catch (err: any) {
    console.error("[dispenseByAadhaar] error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Internal server error." });
  }
}
