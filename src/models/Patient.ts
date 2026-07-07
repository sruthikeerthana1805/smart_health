import { Schema, model, Document } from "mongoose";

export interface IPatient extends Document {
  aadhaarHash: string; // hashed, never store raw Aadhaar
  name: string;
  age: number;
  gender: "M" | "F" | "OTHER";
  phone?: string;
  demographics: {
    village?: string;
    mandal?: string;
    district: string;
    state: string;
  };
  historicalAllergies: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    aadhaarHash: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ["M", "F", "OTHER"], required: true },
    phone: { type: String },
    demographics: {
      village: { type: String },
      mandal: { type: String },
      district: { type: String, default: "NTR District" },
      state: { type: String, default: "Andhra Pradesh" },
    },
    historicalAllergies: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Patient = model<IPatient>("Patient", PatientSchema);
