import { Request, Response } from "express";
import { hashAadhaar } from "../lib/hash";
import { Patient } from "../models/Patient";
import { Visit } from "../models/Visit";
import { redisClient, doctorQueueKey } from "../lib/redis";
import { emitQueueUpdate } from "../lib/websocket";

/**
 * POST /api/visits/register
 * Body: { aadhaar_number, facility_id, name, age, gender, phone?, village?, mandal? }
 *
 * - Hashes the Aadhaar number (never store raw PII).
 * - Creates the Patient profile if new, else fetches existing.
 * - Creates a new Visit document with status REGISTRATION -> DOCTOR_QUEUE.
 * - Pushes the visit onto the facility's Redis doctor queue.
 */
export async function registerVisit(req: Request, res: Response) {
  try {
    const { aadhaar_number, facility_id, name, age, gender, phone, village, mandal } = req.body;

    if (!aadhaar_number || !facility_id || !name || !age || !gender) {
      return res.status(400).json({
        error: "aadhaar_number, facility_id, name, age, and gender are required.",
      });
    }

    // Hash Aadhaar — never persist the raw number.
    const aadhaarHash = hashAadhaar(aadhaar_number);

    // Find-or-create Patient profile.
    let patient = await Patient.findOne({ aadhaarHash });
    if (!patient) {
      patient = await Patient.create({
        aadhaarHash,
        name,
        age,
        gender,
        phone,
        demographics: { village, mandal, district: "NTR District", state: "Andhra Pradesh" },
        historicalAllergies: [],
      });
    }

    // Create the Visit record.
    const visit = await Visit.create({
      aadhaarHash,
      facilityId: facility_id,
      currentStatus: "DOCTOR_QUEUE",
      symptomsVector: [],
      prescriptionArray: [],
    });

    // Push onto Redis doctor queue for this facility (FIFO via RPUSH).
    await redisClient.rPush(doctorQueueKey(facility_id), visit.id);

    // Notify dashboard of the new queue size in real time.
    const queueLength = await redisClient.lLen(doctorQueueKey(facility_id));
    emitQueueUpdate(facility_id, { queue: "DOCTOR_QUEUE", facilityId: facility_id, length: queueLength });

    return res.status(201).json({
      message: "Patient registered and added to doctor queue.",
      patient,
      visit,
    });
  } catch (err) {
    console.error("[registerVisit] error:", err);
    return res.status(500).json({ error: "Internal server error during registration." });
  }
}
