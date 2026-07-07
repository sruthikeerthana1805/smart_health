import { Router } from "express";
import { listInventory, listBatches, addBatch, getDrugStock, getDispenseHistory } from "../controllers/inventory.controller";

const router = Router();
router.get("/drug/:drugId/batches", listBatches);
router.post("/drug/:drugId/batches", addBatch);
router.get("/drug/:drugId", getDrugStock);
router.get("/history/:aadhaar_number", getDispenseHistory);
router.get("/:facilityId", listInventory);

export default router;
