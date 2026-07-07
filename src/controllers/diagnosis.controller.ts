import { Request, Response } from "express";
import { Visit, IVisit } from "../models/Visit";
import { hashAadhaar } from "../lib/hash";
import { redisClient, doctorQueueKey, pharmacyQueueKey } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { emitQueueUpdate } from "../lib/websocket";

/** Finds the patient's current in-progress visit (not COMPLETED), most recent first. */
async function findActiveVisit(aadhaarHash: string): Promise<IVisit | null> {
  return Visit.findOne({ aadhaarHash, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } }).sort({ createdAt: -1 });
}

async function runDiagnosis(visit: IVisit, body: any) {
  const {
    doctor_id,
    symptoms_vector = [],
    prescription_array = [],
    refer_to_facility_id,
    rapid_test_drug_id,
  } = body;

  if (visit.currentStatus !== "DOCTOR_QUEUE") {
    throw Object.assign(new Error(`Visit is not in DOCTOR_QUEUE (current status: ${visit.currentStatus}).`), { status: 409 });
  }

  await redisClient.lRem(doctorQueueKey(visit.facilityId), 0, visit.id.toString());

  if (rapid_test_drug_id) {
    await prisma.inventory.update({
      where: { drugId: rapid_test_drug_id },
      data: { currentStock: { decrement: 1 } },
    });
  }

  visit.doctorId = doctor_id;
  visit.symptomsVector = symptoms_vector;
  visit.prescriptionArray = prescription_array;

  if (refer_to_facility_id) {
    visit.currentStatus = "REFERRED";
    visit.referredToFacilityId = refer_to_facility_id;
  } else {
    visit.currentStatus = "PHARMACY_QUEUE";
    await redisClient.rPush(pharmacyQueueKey(visit.facilityId), visit.id.toString());
  }

  await visit.save();

  const doctorQueueLen = await redisClient.lLen(doctorQueueKey(visit.facilityId));
  emitQueueUpdate(visit.facilityId, { queue: "DOCTOR_QUEUE", facilityId: visit.facilityId, length: doctorQueueLen });

  if (visit.currentStatus === "PHARMACY_QUEUE") {
    const pharmacyQueueLen = await redisClient.lLen(pharmacyQueueKey(visit.facilityId));
    emitQueueUpdate(visit.facilityId, { queue: "PHARMACY_QUEUE", facilityId: visit.facilityId, length: pharmacyQueueLen });
  }

  return visit;
}

/** PUT /api/visits/:id/diagnose — original ID-based route, kept for compatibility. */
export async function diagnoseVisit(req: Request, res: Response) {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ error: "Visit not found." });
    const updated = await runDiagnosis(visit, req.body);
    return res.status(200).json({ message: "Diagnosis recorded.", visit: updated });
  } catch (err: any) {
    console.error("[diagnoseVisit] error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Internal server error." });
  }
}

/**
 * PUT /api/visits/by-aadhaar/:aadhaar_number/diagnose
 * Auto-resolves the patient's current active visit — no Visit ID needed.
 */
export async function diagnoseByAadhaar(req: Request, res: Response) {
  try {
    const aadhaarHash = hashAadhaar(req.params.aadhaar_number);
    const visit = await findActiveVisit(aadhaarHash);
    if (!visit) return res.status(404).json({ error: "No active visit found for this Aadhaar number." });

    const updated = await runDiagnosis(visit, req.body);
    return res.status(200).json({ message: "Diagnosis recorded.", visit: updated });
  } catch (err: any) {
    console.error("[diagnoseByAadhaar] error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Internal server error." });
  }
}
