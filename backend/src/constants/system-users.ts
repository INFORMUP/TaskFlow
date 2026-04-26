import { v5 as uuidv5 } from "uuid";

const SEED_NAMESPACE = "taskflow:seed";

function seedUserId(key: string): string {
  return uuidv5(`${SEED_NAMESPACE}:user:${key}`, uuidv5.URL);
}

export const FEEDBACK_BOT_USER_ID = seedUserId("agent:feedback-bot");
export const FEEDBACK_BOT_DISPLAY_NAME = "Feedback Bot";
