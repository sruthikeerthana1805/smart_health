import { Request, Response } from "express";
import { redisClient, doctorQueueKey, pharmacyQueueKey } from "../lib/redis";
import { Visit } from "../models/Visit";
import { Patient } from "../models/Patient";
import { emitQueueUpdate } from "../lib/websocket";

const MAX_SKIPS = 3;

/** Re-insert a skipped visit so it's called again after ~3 other patients (or at the back if the queue is short). */
async function requeueAfterThree(key: string, visitId: string) {
  const pivot = await redisClient.lIndex(key, 2); // element currently 3rd in line
  if (pivot) {
    await redisClient.lInsert(key, "BEFORE", pivot, visitId);
  } else {
    await redisClient.rPush(key, visitId);
  }
}

async function pullNext(key: string) {
  const visitId = await redisClient.lPop(key);
  if (!visitId) return null;
  const visit = await Visit.findById(visitId);
  const patient = visit ? await Patient.findOne({ aadhaarHash: visit.aadhaarHash }) : null;
  return { visit, patient };
}

/** GET /api/queue/doctor/:facilityId/next */
export async function nextDoctorPatient(req: Request, res: Response) {
  const { facilityId } = req.params;
  const result = await pullNext(doctorQueueKey(facilityId));
  if (!result) return res.status(404).json({ message: "Doctor queue is empty." });

  const remaining = await redisClient.lLen(doctorQueueKey(facilityId));
  emitQueueUpdate(facilityId, { queue: "DOCTOR_QUEUE", facilityId, length: remaining });
  return res.json(result);
}

/** GET /api/queue/pharmacy/:facilityId/next */
export async function nextPharmacyPatient(req: Request, res: Response) {
  const { facilityId } = req.params;
  const result = await pullNext(pharmacyQueueKey(facilityId));
  if (!result) return res.status(404).json({ message: "Pharmacy queue is empty." });

  const remaining = await redisClient.lLen(pharmacyQueueKey(facilityId));
  emitQueueUpdate(facilityId, { queue: "PHARMACY_QUEUE", facilityId, length: remaining });
  return res.json(result);
}

/** POST /api/queue/doctor/:facilityId/skip — body: { visitId } — patient wasn't there */
export async function skipDoctorPatient(req: Request, res: Response) {
  const { facilityId } = req.params;
  const { visitId } = req.body;
  const visit = await Visit.findById(visitId);
  if (!visit) return res.status(404).json({ error: "Visit not found." });

  visit.doctorSkipCount = (visit.doctorSkipCount || 0) + 1;

  if (visit.doctorSkipCount >= MAX_SKIPS) {
    visit.currentStatus = "DISCARDED";
    await visit.save();
    return res.json({ discarded: true, message: "Missed 3 times — visit discarded. Patient must register again." });
  }

  await visit.save();
  await requeueAfterThree(doctorQueueKey(facilityId), visit.id.toString());
  const remaining = await redisClient.lLen(doctorQueueKey(facilityId));
  emitQueueUpdate(facilityId, { queue: "DOCTOR_QUEUE", facilityId, length: remaining });

  return res.json({ discarded: false, skipCount: visit.doctorSkipCount, message: `Requeued — will come up again after ~3 patients. (${visit.doctorSkipCount}/${MAX_SKIPS} misses)` });
}

/** POST /api/queue/pharmacy/:facilityId/skip — body: { visitId } */
export async function skipPharmacyPatient(req: Request, res: Response) {
  const { facilityId } = req.params;
  const { visitId } = req.body;
  const visit = await Visit.findById(visitId);
  if (!visit) return res.status(404).json({ error: "Visit not found." });

  visit.pharmacySkipCount = (visit.pharmacySkipCount || 0) + 1;

  if (visit.pharmacySkipCount >= MAX_SKIPS) {
    visit.currentStatus = "DISCARDED";
    await visit.save();
    return res.json({ discarded: true, message: "Missed 3 times — visit discarded. Patient must register again." });
  }

  await visit.save();
  await requeueAfterThree(pharmacyQueueKey(facilityId), visit.id.toString());
  const remaining = await redisClient.lLen(pharmacyQueueKey(facilityId));
  emitQueueUpdate(facilityId, { queue: "PHARMACY_QUEUE", facilityId, length: remaining });

  return res.json({ discarded: false, skipCount: visit.pharmacySkipCount, message: `Requeued — will come up again after ~3 patients. (${visit.pharmacySkipCount}/${MAX_SKIPS} misses)` });
}
