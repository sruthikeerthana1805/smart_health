import { PrismaClient } from "@prisma/client";
import mongoose from "mongoose";
import { Patient } from "../src/models/Patient";
import { Visit } from "../src/models/Visit";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function seedPostgres() {
  const phc = await prisma.facility.upsert({
    where: { id: "PHC-GOVERNORPET" },
    update: {},
    create: {
      id: "PHC-GOVERNORPET", name: "PHC Governorpet", type: "PHC",
      location: "Vijayawada Urban", population: 42000,
      latitude: 16.5062, longitude: 80.648, geofenceRadiusMeters: 200,
    },
  });

  const chc = await prisma.facility.upsert({
    where: { id: "CHC-VIJAYAWADA" },
    update: {},
    create: {
      id: "CHC-VIJAYAWADA", name: "CHC Vijayawada Central", type: "CHC",
      location: "Vijayawada Urban", population: 110000,
      latitude: 16.5193, longitude: 80.6305, geofenceRadiusMeters: 250,
    },
  });

  const beds = [
    { id: "BED-001", facilityId: phc.id, qr: "BED-QR-001", occ: false },
    { id: "BED-002", facilityId: phc.id, qr: "BED-QR-002", occ: false },
    { id: "BED-003", facilityId: phc.id, qr: "BED-QR-003", occ: true },
    { id: "BED-004", facilityId: chc.id, qr: "BED-QR-004", occ: false },
    { id: "BED-005", facilityId: chc.id, qr: "BED-QR-005", occ: false },
  ];
  for (const b of beds) {
    await prisma.bed.upsert({
      where: { bedId: b.id }, update: { isOccupied: b.occ },
      create: { bedId: b.id, facilityId: b.facilityId, qrCodeHash: b.qr, isOccupied: b.occ },
    });
  }

  const staff = [
    { id: "DOC-001", facilityId: phc.id, name: "Dr. K. Reddy", present: false },
    { id: "DOC-002", facilityId: phc.id, name: "Dr. S. Priya", present: true },
    { id: "DOC-003", facilityId: chc.id, name: "Dr. M. Rao", present: false },
  ];
  for (const s of staff) {
    await prisma.staff.upsert({
      where: { doctorId: s.id }, update: {},
      create: { doctorId: s.id, facilityId: s.facilityId, name: s.name, isPresent: s.present },
    });
  }

  // Real, well-known Indian brand medicines with simple, memorable IDs.
  const drugs = [
    { id: "dolo_650",       facilityId: phc.id, name: "Dolo 650 (Paracetamol)",         stock: 500, buf: 100, unit: "tablets" },
    { id: "ors_powder",     facilityId: phc.id, name: "ORS Powder Sachets",             stock: 200, buf: 50,  unit: "sachets" },
    { id: "amoxyclav_625",  facilityId: phc.id, name: "Amoxyclav 625 (Amoxicillin)",    stock: 15,  buf: 50,  unit: "tablets" }, // low stock, on purpose
    { id: "cetrizine_10",   facilityId: phc.id, name: "Cetrizine 10mg",                 stock: 300, buf: 60,  unit: "tablets" },
    { id: "azee_500",       facilityId: chc.id, name: "Azee 500 (Azithromycin)",        stock: 60,  buf: 30,  unit: "tablets" },
    { id: "pantop_40",      facilityId: chc.id, name: "Pantop 40 (Pantoprazole)",       stock: 120, buf: 40,  unit: "tablets" },
    { id: "iv_ns_500",      facilityId: chc.id, name: "IV Normal Saline 500ml",         stock: 80,  buf: 20,  unit: "bottles" },
  ];
  for (const d of drugs) {
    await prisma.inventory.upsert({
      where: { drugId: d.id }, update: { currentStock: d.stock },
      create: { drugId: d.id, facilityId: d.facilityId, drugName: d.name, currentStock: d.stock, minBuffer: d.buf, unit: d.unit },
    });
  }

  // Expiry batches — mix of safe and near-expiry, per drug, for the expiry demo.
  const batches: { drugId: string; batchNumber: string; quantity: number; expiryDate: Date }[] = [
    { drugId: "dolo_650",      batchNumber: "DOLO-B1", quantity: 400, expiryDate: daysFromNow(240) },
    { drugId: "dolo_650",      batchNumber: "DOLO-B2", quantity: 100, expiryDate: daysFromNow(18) },  // near-expiry
    { drugId: "ors_powder",    batchNumber: "ORS-B1",  quantity: 200, expiryDate: daysFromNow(300) },
    { drugId: "amoxyclav_625", batchNumber: "AMX-B1",  quantity: 15,  expiryDate: daysFromNow(12) },  // low stock + near-expiry
    { drugId: "cetrizine_10",  batchNumber: "CTZ-B1",  quantity: 300, expiryDate: daysFromNow(400) },
    { drugId: "azee_500",      batchNumber: "AZE-B1",  quantity: 60,  expiryDate: daysFromNow(90) },
    { drugId: "pantop_40",     batchNumber: "PAN-B1",  quantity: 90,  expiryDate: daysFromNow(150) },
    { drugId: "pantop_40",     batchNumber: "PAN-B2",  quantity: 30,  expiryDate: daysFromNow(25) },   // near-expiry
    { drugId: "iv_ns_500",     batchNumber: "IVNS-B1", quantity: 80,  expiryDate: daysFromNow(500) },
  ];
  for (const b of batches) {
    const exists = await prisma.expiryBatch.findFirst({ where: { drugId: b.drugId, batchNumber: b.batchNumber } });
    if (!exists) {
      await prisma.expiryBatch.create({ data: b });
    }
  }

  return { phc, chc };
}

async function seedMongo(facilityId: string) {
  await mongoose.connect(process.env.MONGO_URI as string);

  const patient = await Patient.findOneAndUpdate(
    { aadhaarHash: "demo-hash-001" },
    {
      aadhaarHash: "demo-hash-001", name: "Lakshmi Devi", age: 58, gender: "F",
      demographics: { village: "Governorpet", district: "NTR District", state: "Andhra Pradesh" },
      historicalAllergies: ["Penicillin"],
    },
    { upsert: true, new: true }
  );

  await Visit.findOneAndUpdate(
    { aadhaarHash: patient.aadhaarHash, currentStatus: "DOCTOR_QUEUE" },
    { aadhaarHash: patient.aadhaarHash, facilityId, currentStatus: "DOCTOR_QUEUE" },
    { upsert: true, new: true }
  );

  await mongoose.disconnect();
}

async function main() {
  const { phc } = await seedPostgres();
  await seedMongo(phc.id);

  console.log(`
=== DEMO IDS — copy these into the console at http://localhost:4000 ===
Facility (PHC):           PHC-GOVERNORPET
Facility (CHC):           CHC-VIJAYAWADA
Doctor (checked out):     DOC-001
Doctor (already present): DOC-002
Doctor (CHC):             DOC-003
Drug — normal stock:      dolo_650
Drug — low stock demo:    amoxyclav_625 (also near-expiry!)
Drug — near-expiry demo:  pantop_40
Bed QR (free):            BED-QR-001
Bed QR (occupied):        BED-QR-003
Patient Aadhaar (seeded): 123456789012 (register a new one) or use Lakshmi Devi already in queue
=========================================================================
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
