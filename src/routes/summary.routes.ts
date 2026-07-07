import { Router } from "express";
import { getFacilitySummary } from "../controllers/summary.controller";
const router = Router();
router.get("/:facilityId", getFacilitySummary);
export default router;
