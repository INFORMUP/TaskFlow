import { v5 as uuidv5 } from "uuid";

const SEED_NAMESPACE = "taskflow:seed";

export function seedUuid(entity: string, key: string): string {
  return uuidv5(`${SEED_NAMESPACE}:${entity}:${key}`, uuidv5.URL);
}

export interface SeederResult {
  name: string;
  created: number;
  skipped: number;
}

export function makeResult(name: string): SeederResult {
  return { name, created: 0, skipped: 0 };
}
