-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('PHC', 'CHC');

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL,
    "location" TEXT NOT NULL,
    "population" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "drugId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minBuffer" INTEGER NOT NULL DEFAULT 10,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("drugId")
);

-- CreateTable
CREATE TABLE "expiry_batches" (
    "id" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiry_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "bedId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "qrCodeHash" TEXT NOT NULL,
    "occupantAadhaarHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beds_pkey" PRIMARY KEY ("bedId")
);

-- CreateTable
CREATE TABLE "staff" (
    "doctorId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPresent" BOOLEAN NOT NULL DEFAULT false,
    "lastGeofencePing" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("doctorId")
);

-- CreateTable
CREATE TABLE "dispense_logs" (
    "id" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "aadhaarHash" TEXT,
    "visitId" TEXT,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispense_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_facilityId_idx" ON "inventory"("facilityId");

-- CreateIndex
CREATE INDEX "expiry_batches_drugId_idx" ON "expiry_batches"("drugId");

-- CreateIndex
CREATE INDEX "expiry_batches_expiryDate_idx" ON "expiry_batches"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "beds_qrCodeHash_key" ON "beds"("qrCodeHash");

-- CreateIndex
CREATE INDEX "beds_facilityId_idx" ON "beds"("facilityId");

-- CreateIndex
CREATE INDEX "staff_facilityId_idx" ON "staff"("facilityId");

-- CreateIndex
CREATE INDEX "dispense_logs_drugId_dispensedAt_idx" ON "dispense_logs"("drugId", "dispensedAt");

-- CreateIndex
CREATE INDEX "dispense_logs_facilityId_idx" ON "dispense_logs"("facilityId");

-- CreateIndex
CREATE INDEX "dispense_logs_aadhaarHash_idx" ON "dispense_logs"("aadhaarHash");

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_batches" ADD CONSTRAINT "expiry_batches_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "inventory"("drugId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
