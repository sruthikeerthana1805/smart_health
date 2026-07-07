import { Request, Response } from "express";
import { Visit } from "../models/Visit";
import { Patient } from "../models/Patient";
import { hashAadhaar } from "../lib/hash";

/**
 * GET /api/visits/status/:aadhaar_number
 * Tells the nurse whether this patient is currently "in process" (has an
 * active, non-completed visit) or is free to register fresh.
 */
export async function getPatientStatus(req: Request, res: Response) {
  const aadhaarHash = hashAadhaar(req.params.aadhaar_number);
  const patient = await Patient.findOne({ aadhaarHash });
  const activeVisit = await Visit.findOne({ aadhaarHash, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } }).sort({ createdAt: -1 });

  if (!patient) {
    return res.json({ known: false, inProcess: false, message: "No record for this Aadhaar number yet." });
  }

  if (!activeVisit) {
    return res.json({ known: true, inProcess: false, patient, message: "Patient has no active visit — safe to register a new one." });
  }

  return res.json({
    known: true,
    inProcess: true,
    patient,
    visit: activeVisit,
    message: `Patient already has an active visit (status: ${activeVisit.currentStatus}).`,
  });
}

/**
 * GET /api/visits/active/:facilityId
 * Nurse/admin view: everyone currently in-process at this facility (not yet COMPLETED).
 */
export async function listActiveVisits(req: Request, res: Response) {
  const { facilityId } = req.params;
  const visits = await Visit.find({ facilityId, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } }).sort({ createdAt: 1 });

  const withNames = await Promise.all(
    visits.map(async (v) => {
      const patient = await Patient.findOne({ aadhaarHash: v.aadhaarHash });
      return {
        visitId: v.id,
        status: v.currentStatus,
        patientName: patient ? patient.name : "unknown",
        createdAt: v.createdAt,
      };
    })
  );

  return res.json({ facilityId, count: withNames.length, patients: withNames });
}
