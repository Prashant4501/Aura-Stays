import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    audit_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    user_id: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entity_type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entity_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

auditLogSchema.index({ entity_type: 1, entity_id: 1 });
auditLogSchema.index({ created_at: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
