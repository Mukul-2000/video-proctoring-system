import mongoose from "mongoose";

const logSchema = new mongoose.Schema({
  type: { type: String, required: true },
  detail: { type: String },
  ts: { type: Date, default: Date.now },
  sessionId: { type: String, required: true },
  candidateId: { type: String }, // optional
});

export default mongoose.model("Log", logSchema);
