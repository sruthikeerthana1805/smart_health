import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redisClient, doctorQueueKey, pharmacyQueueKey } from "../lib/redis";
import { Visit } from "../models/Visit";

/**
 * District-level admin surface. There is no District table in the schema —
 * NTR district is currently the only district, so "district view" just
 * means "every Facility row, aggregated." If a second district is ever
 * added, add a districtId column to Facility and filter by it here instead
 * of loading every facility.
 *
 * GET /api/district/overview
 * Returns per-facility summaries (same shape as /api/summary/:facilityId)
 * plus district-wide totals, in one call — this is what the District Admin
 * dashboard's landing page needs without N+1 requests from the frontend.
 */
export async function getDistrictOverview(_req: Request, res: Response) {
  const facilities = await prisma.facility.findMany({ orderBy: { name: "asc" } });

  const facilitySummaries = await Promise.all(
    facilities.map(async (facility) => {
      const facilityId = facility.id;

      const [patientsInProcess, beds, staff, inventory, doctorQueueLength, pharmacyQueueLength] =
        await Promise.all([
          Visit.countDocuments({ facilityId, currentStatus: { $nin: ["COMPLETED", "DISCARDED"] } }),
          prisma.bed.findMany({ where: { facilityId } }),
          prisma.staff.findMany({ where: { facilityId } }),
          prisma.inventory.findMany({ where: { facilityId } }),
          redisClient.lLen(doctorQueueKey(facilityId)),
          redisClient.lLen(pharmacyQueueKey(facilityId)),
        ]);

      return {
        facilityId,
        facilityName: facility.name,
        facilityType: facility.type,
        location: facility.location,
        population: facility.population,
        patientsInProcess,
        bedsAvailable: beds.filter((b) => !b.isOccupied).length,
        bedsTotal: beds.length,
        doctorsPresent: staff.filter((s) => s.isPresent).length,
        doctorsTotal: staff.length,
        doctorQueueLength,
        pharmacyQueueLength,
        lowStockAlertCount: inventory.filter((i) => i.currentStock <= i.minBuffer).length,
      };
    })
  );

  const totals = facilitySummaries.reduce(
    (acc, f) => ({
      facilityCount: acc.facilityCount + 1,
      phcCount: acc.phcCount + (f.facilityType === "PHC" ? 1 : 0),
      chcCount: acc.chcCount + (f.facilityType === "CHC" ? 1 : 0),
      patientsInProcess: acc.patientsInProcess + f.patientsInProcess,
      bedsAvailable: acc.bedsAvailable + f.bedsAvailable,
      bedsTotal: acc.bedsTotal + f.bedsTotal,
      doctorsPresent: acc.doctorsPresent + f.doctorsPresent,
      doctorsTotal: acc.doctorsTotal + f.doctorsTotal,
      doctorQueueLength: acc.doctorQueueLength + f.doctorQueueLength,
      pharmacyQueueLength: acc.pharmacyQueueLength + f.pharmacyQueueLength,
      lowStockAlertCount: acc.lowStockAlertCount + f.lowStockAlertCount,
    }),
    {
      facilityCount: 0,
      phcCount: 0,
      chcCount: 0,
      patientsInProcess: 0,
      bedsAvailable: 0,
      bedsTotal: 0,
      doctorsPresent: 0,
      doctorsTotal: 0,
      doctorQueueLength: 0,
      pharmacyQueueLength: 0,
      lowStockAlertCount: 0,
    }
  );

  return res.json({
    districtName: "NTR District",
    totals,
    facilities: facilitySummaries,
  });
}

/**
 * GET /api/district/facilities
 * Lightweight list — id/name/type/location only. Used by the Role Select
 * screen and anywhere that just needs to know what facilities exist,
 * without paying for the full per-facility aggregation above.
 */
export async function listFacilities(_req: Request, res: Response) {
  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, location: true },
  });
  return res.json(facilities);
}