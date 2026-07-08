import { Router } from "express";
import { getDistrictOverview, listFacilities } from "../controllers/district.controller";

const router = Router();

// GET /api/district/overview — every facility's summary + district totals
router.get("/overview", getDistrictOverview);

// GET /api/district/facilities — lightweight facility list
router.get("/facilities", listFacilities);

export default router;