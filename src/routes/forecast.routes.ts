import { Router } from "express";
import { getForecast } from "../controllers/forecast.controller";
const router = Router();
router.get("/:facilityId/:drugId", getForecast);
export default router;
