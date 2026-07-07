import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redisClient, doctorQueueKey, pharmacyQueueKey } from "../lib/redis";
import { Visit } from "../models/Visit";

/**
 * GET /api/summary/:facilityId — nurse-level snapshot.
 * Deliberately limited to counts (no drug names, no expiry batches, no
 * per-item detail) — that level of drill-down is reserved for the admin
 * dashboard / inventory + forecast endpoints.
 */
export async function getFacilitySummary(req: Request, res: Response) {
  const { facilityId } = req.params;

  const patientsInProcess = await Visit.countDocuments({ facilityId, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } });
  const beds = await prisma.bed.findMany({ where: { facilityId } });
  const staff = await prisma.staff.findMany({ where: { facilityId } });
  const inventory = await prisma.inventory.findMany({ where: { facilityId } });

  const doctorQueueLength = await redisClient.lLen(doctorQueueKey(facilityId));
  const pharmacyQueueLength = await redisClient.lLen(pharmacyQueueKey(facilityId));

  return res.json({
    facilityId,
    patientsInProcess,
    bedsAvailable: beds.filter((b) => !b.isOccupied).length,
    bedsTotal: beds.length,
    doctorsPresent: staff.filter((s) => s.isPresent).length,
    doctorsTotal: staff.length,
    doctorQueueLength,
    pharmacyQueueLength,
    lowStockAlertCount: inventory.filter((i) => i.currentStock <= i.minBuffer).length,
  });
}
