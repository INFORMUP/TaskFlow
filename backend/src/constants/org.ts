// Temporary single-org constant used during the multi-tenant rollout.
// Phase 1 populates orgId everywhere but services still ignore it at runtime;
// later phases replace reads of this constant with request.org.id.
export const DEFAULT_ORG_ID = "2ee0765c-6028-54a4-a201-a639ff748972";
