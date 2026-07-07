import { Router } from "express";
import { registerVisit } from "../controllers/registration.controller";
import { diagnoseVisit, diagnoseByAadhaar } from "../controllers/diagnosis.controller";
import { dispenseVisit, dispenseByAadhaar } from "../controllers/dispense.controller";
import { getPatientStatus, listActiveVisits } from "../controllers/status.controller";

const router = Router();

router.post("/register", registerVisit);

// Aadhaar-based (primary flow — no Visit ID needed)
router.get("/status/:aadhaar_number", getPatientStatus);
router.get("/active/:facilityId", listActiveVisits);
router.put("/by-aadhaar/:aadhaar_number/diagnose", diagnoseByAadhaar);
router.post("/by-aadhaar/:aadhaar_number/dispense", dispenseByAadhaar);

// Legacy Visit-ID based routes (still work, kept for compatibility)
router.put("/:id/diagnose", diagnoseVisit);
router.post("/:id/dispense", dispenseVisit);

export default router;
