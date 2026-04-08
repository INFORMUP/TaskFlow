import { createApp } from "../../app.js";

export async function buildApp() {
  const app = createApp();
  await app.ready();
  return app;
}
