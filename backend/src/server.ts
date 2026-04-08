import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`TaskFlow backend listening at ${address}`);
});
