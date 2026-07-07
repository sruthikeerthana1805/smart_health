import { Router } from "express";
import { nextDoctorPatient, nextPharmacyPatient, skipDoctorPatient, skipPharmacyPatient } from "../controllers/queue.controller";

const router = Router();
router.get("/doctor/:facilityId/next", nextDoctorPatient);
router.get("/pharmacy/:facilityId/next", nextPharmacyPatient);
router.post("/doctor/:facilityId/skip", skipDoctorPatient);
router.post("/pharmacy/:facilityId/skip", skipPharmacyPatient);

export default router;
