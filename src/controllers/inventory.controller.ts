import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashAadhaar } from "../lib/hash";

/** GET /api/inventory/drug/:drugId — quick stock lookup for one drug (used while filling a prescription) */
export async function getDrugStock(req: Request, res: Response) {
  const { drugId } = req.params;
  const drug = await prisma.inventory.findUnique({ where: { drugId } });
  if (!drug) return res.status(404).json({ error: "Drug not found." });
  return res.json({
    drugId: drug.drugId,
    drugName: drug.drugName,
    currentStock: drug.currentStock,
    unit: drug.unit,
    isLowStock: drug.currentStock <= drug.minBuffer,
  });
}

/** GET /api/inventory/history/:aadhaar_number — every drug ever dispensed to this patient */
export async function getDispenseHistory(req: Request, res: Response) {
  const aadhaarHash = hashAadhaar(req.params.aadhaar_number);
  const logs = await prisma.dispenseLog.findMany({
    where: { aadhaarHash },
    orderBy: { dispensedAt: "desc" },
  });

  const drugIds = [...new Set(logs.map((l) => l.drugId))];
  const drugs = await prisma.inventory.findMany({ where: { drugId: { in: drugIds } } });
  const nameById = new Map(drugs.map((d) => [d.drugId, d.drugName]));

  return res.json({
    count: logs.length,
    history: logs.map((l) => ({
      drugId: l.drugId,
      drugName: nameById.get(l.drugId) || l.drugId,
      quantity: l.quantity,
      dispensedAt: l.dispensedAt,
    })),
  });
}

/** GET /api/inventory/:facilityId — every drug at a facility, with stock + nearest expiry */
export async function listInventory(req: Request, res: Response) {
  const { facilityId } = req.params;
  const items = await prisma.inventory.findMany({
    where: { facilityId },
    include: { expiryBatches: { orderBy: { expiryDate: "asc" } } },
  });

  const now = Date.now();
  const drugs = items.map((i) => {
    const nearest = i.expiryBatches[0];
    const daysToExpiry = nearest ? Math.ceil((nearest.expiryDate.getTime() - now) / 86400000) : null;
    return {
      drugId: i.drugId,
      drugName: i.drugName,
      currentStock: i.currentStock,
      minBuffer: i.minBuffer,
      unit: i.unit,
      isLowStock: i.currentStock <= i.minBuffer,
      nearestExpiry: nearest ? nearest.expiryDate : null,
      daysToExpiry,
      expiryAlert: daysToExpiry !== null && daysToExpiry <= 30,
      batches: i.expiryBatches,
    };
  });

  return res.json({ facilityId, drugs });
}

/** GET /api/inventory/drug/:drugId/batches — all batches for one drug */
export async function listBatches(req: Request, res: Response) {
  const { drugId } = req.params;
  const batches = await prisma.expiryBatch.findMany({ where: { drugId }, orderBy: { expiryDate: "asc" } });
  return res.json({ drugId, batches });
}

/** POST /api/inventory/drug/:drugId/batches — receive a new stock batch (also bumps total stock) */
export async function addBatch(req: Request, res: Response) {
  const { drugId } = req.params;
  const { batchNumber, quantity, expiryDate } = req.body;

  const batch = await prisma.expiryBatch.create({
    data: { drugId, batchNumber, quantity: Number(quantity), expiryDate: new Date(expiryDate) },
  });
  await prisma.inventory.update({
    where: { drugId },
    data: { currentStock: { increment: Number(quantity) } },
  });

  return res.status(201).json({ message: "Batch added and stock updated.", batch });
}
