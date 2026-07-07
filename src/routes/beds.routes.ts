import { Router } from "express";
import { assignBed, releaseBed, findBedByAadhaar } from "../controllers/beds.controller";

const router = Router();
router.get("/by-aadhaar/:aadhaar_number", findBedByAadhaar);
router.post("/:qrCodeHash/assign", assignBed);
router.post("/:qrCodeHash/release", releaseBed);

export default router;
