import { Schema, model, Document, Types } from "mongoose";

export type VisitStatus =
  | "REGISTRATION"
  | "DOCTOR_QUEUE"
  | "DIAGNOSTICS"
  | "PHARMACY_QUEUE"
  | "REFERRED"
  | "COMPLETED"
  | "DISCARDED";

export interface IPrescriptionItem {
  drugId: string; // FK reference to Postgres Inventory.drugId
  drugName: string;
  quantity: number;
  dosageInstructions?: string;
}

export interface IVisit extends Document {
  aadhaarHash: string;
  facilityId: string; // FK reference to Postgres Facility.id
  currentStatus: VisitStatus;
  symptomsVector: string[]; // e.g. ["fever", "cough", "headache"]
  prescriptionArray: IPrescriptionItem[];
  doctorId?: string; // FK reference to Postgres Staff.doctorId
  doctorSkipCount: number;
  pharmacySkipCount: number;
  referredToFacilityId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionItemSchema = new Schema<IPrescriptionItem>(
  {
    drugId: { type: String, required: true },
    drugName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    dosageInstructions: { type: String },
  },
  { _id: false }
);

const VisitSchema = new Schema<IVisit>(
  {
    aadhaarHash: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true },
    currentStatus: {
      type: String,
      enum: ["REGISTRATION", "DOCTOR_QUEUE", "DIAGNOSTICS", "PHARMACY_QUEUE", "REFERRED", "COMPLETED", "DISCARDED"],
      default: "REGISTRATION",
      index: true,
    },
    symptomsVector: { type: [String], default: [] },
    prescriptionArray: { type: [PrescriptionItemSchema], default: [] },
    doctorId: { type: String },
    doctorSkipCount: { type: Number, default: 0 },
    pharmacySkipCount: { type: Number, default: 0 },
    referredToFacilityId: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export const Visit = model<IVisit>("Visit", VisitSchema);
