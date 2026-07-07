import { Router } from "express";
import { loginStaff, logoutStaff, geofencePing } from "../controllers/staff.controller";

const router = Router();
router.post("/:id/login", loginStaff);
router.post("/:id/logout", logoutStaff);
router.post("/:id/geofence-ping", geofencePing);

export default router;
