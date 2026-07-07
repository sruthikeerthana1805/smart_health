import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { generateForecastInsight } from "../lib/gemini";

/** GET /api/forecast/:facilityId/:drugId — AI demand forecast (admin view) */
export async function getForecast(req: Request, res: Response) {
  const { facilityId, drugId } = req.params;

  const drug = await prisma.inventory.findUnique({ where: { drugId } });
  if (!drug) return res.status(404).json({ error: "Drug not found." });

  const since = new Date();
  since.setDate(since.getDate() - 14);
  const logs = await prisma.dispenseLog.findMany({
    where: { drugId, facilityId, dispensedAt: { gte: since } },
  });

  const byDay: Record<string, number> = {};
  for (const log of logs) {
    const day = log.dispensedAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + log.quantity;
  }
  const dailyUsage = Object.values(byDay);
  const avgDailyUsage = dailyUsage.length ? dailyUsage.reduce((a, b) => a + b, 0) / dailyUsage.length : 0;

  const aiInsight = await generateForecastInsight(drug.drugName, dailyUsage, avgDailyUsage, drug.currentStock);

  return res.json({
    drugId,
    drugName: drug.drugName,
    currentStock: drug.currentStock,
    avgDailyUsage: Number(avgDailyUsage.toFixed(2)),
    daysOfDataUsed: dailyUsage.length,
    aiInsight,
  });
}
