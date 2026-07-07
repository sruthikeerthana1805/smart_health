import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redisClient, geofenceKey } from "../lib/redis";
import { distanceMeters } from "../lib/geo";
import { getIO } from "../lib/websocket";

const OUTSIDE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

/** POST /api/staff/:id/login — QR scan check-in */
export async function loginStaff(req: Request, res: Response) {
  const { id } = req.params;
  const staff = await prisma.staff.update({
    where: { doctorId: id },
    data: { isPresent: true, lastGeofencePing: new Date() },
  });
  await redisClient.del(geofenceKey(id));
  getIO().to(`facility:${staff.facilityId}`).emit("staff_update", staff);
  return res.json({ message: "Checked in.", staff });
}

/** POST /api/staff/:id/logout — QR scan check-out */
export async function logoutStaff(req: Request, res: Response) {
  const { id } = req.params;
  const staff = await prisma.staff.update({
    where: { doctorId: id },
    data: { isPresent: false },
  });
  await redisClient.del(geofenceKey(id));
  getIO().to(`facility:${staff.facilityId}`).emit("staff_update", staff);
  return res.json({ message: "Checked out.", staff });
}

/**
 * POST /api/staff/:id/geofence-ping
 * Body: { lat, lng }
 * Mobile app pings periodically. If doctor drifts outside the facility's
 * geofence for >30 continuous minutes, auto-mark absent and alert the dashboard.
 */
export async function geofencePing(req: Request, res: Response) {
  const { id } = req.params;
  const { lat, lng } = req.body;

  const staff = await prisma.staff.findUnique({ where: { doctorId: id } });
  if (!staff) return res.status(404).json({ error: "Doctor not found." });

  const facility = await prisma.facility.findUnique({ where: { id: staff.facilityId } });
  if (!facility) return res.status(404).json({ error: "Facility not found." });

  const dist = distanceMeters(lat, lng, facility.latitude, facility.longitude);
  const isInside = dist <= facility.geofenceRadiusMeters;
  const key = geofenceKey(id);

  if (isInside) {
    await redisClient.del(key);
    await prisma.staff.update({
      where: { doctorId: id },
      data: { lastGeofencePing: new Date(), lastLat: lat, lastLng: lng },
    });
    return res.json({ status: "inside_geofence", distance: dist });
  }

  // Outside geofence: track how long, using a Redis key set on first drift-out.
  let outsideSince = await redisClient.get(key);
  if (!outsideSince) {
    outsideSince = Date.now().toString();
    await redisClient.set(key, outsideSince, { EX: 60 * 60 }); // safety TTL 1hr
  }

  const elapsed = Date.now() - parseInt(outsideSince, 10);
  await prisma.staff.update({
    where: { doctorId: id },
    data: { lastLat: lat, lastLng: lng },
  });

  if (elapsed >= OUTSIDE_LIMIT_MS && staff.isPresent) {
    const updated = await prisma.staff.update({
      where: { doctorId: id },
      data: { isPresent: false },
    });
    await redisClient.del(key);
    getIO().to(`facility:${staff.facilityId}`).emit("staff_absent_alert", {
      doctorId: id,
      facilityId: staff.facilityId,
      message: "Doctor outside geofence for 30+ minutes — marked absent.",
    });
    return res.json({ status: "marked_absent", staff: updated });
  }

  return res.json({ status: "outside_geofence", elapsedMs: elapsed, distance: dist });
}
