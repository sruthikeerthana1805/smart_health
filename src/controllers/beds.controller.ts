import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashAadhaar } from "../lib/hash";
import { emitBedUpdate } from "../lib/websocket";

/** POST /api/beds/:qrCodeHash/assign — nurse scans bed QR + patient's Aadhaar to occupy it */
export async function assignBed(req: Request, res: Response) {
  const { qrCodeHash } = req.params;
  const { aadhaar_number } = req.body;

  const bed = await prisma.bed.update({
    where: { qrCodeHash },
    data: {
      isOccupied: true,
      occupantAadhaarHash: aadhaar_number ? hashAadhaar(aadhaar_number) : null,
    },
  });
  emitBedUpdate(bed.facilityId, bed);
  return res.json({ message: "Bed assigned.", bed });
}

/** POST /api/beds/:qrCodeHash/release — nurse scans bed QR to free it */
export async function releaseBed(req: Request, res: Response) {
  const { qrCodeHash } = req.params;
  const bed = await prisma.bed.update({
    where: { qrCodeHash },
    data: { isOccupied: false, occupantAadhaarHash: null },
  });
  emitBedUpdate(bed.facilityId, bed);
  return res.json({ message: "Bed released.", bed });
}

/** GET /api/beds/by-aadhaar/:aadhaar_number — find which bed (if any) a patient currently occupies */
export async function findBedByAadhaar(req: Request, res: Response) {
  const aadhaarHash = hashAadhaar(req.params.aadhaar_number);
  const bed = await prisma.bed.findFirst({ where: { occupantAadhaarHash: aadhaarHash, isOccupied: true } });
  if (!bed) return res.status(404).json({ message: "No bed currently assigned to this Aadhaar number." });
  return res.json({ bed });
}
