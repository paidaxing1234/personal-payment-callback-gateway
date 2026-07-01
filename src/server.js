import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter } from "./api/routes.js";
import { loadDotEnv } from "./config/dotenv.js";
import { loadConfig } from "./config/index.js";
import { sendError } from "./lib/http.js";
import { OrderService } from "./domain/orders.js";
import { JsonStore } from "./storage/jsonStore.js";
import { WebhookDispatcher } from "./webhook/dispatcher.js";

export async function createApp(env = process.env) {
  const config = loadConfig(env);
  const store = new JsonStore(config.dataFile);
  await store.init();
  const dispatcher = new WebhookDispatcher({ config, store });
  const orderService = new OrderService({ store, config, dispatcher });
  const router = createRouter({ config, orderService });

  return http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (error) {
      sendError(res, error);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadDotEnv();
  const app = await createApp();
  const port = Number.parseInt(process.env.PORT || "8787", 10);
  app.listen(port, "127.0.0.1", () => {
    console.log(`personal-payment-callback-gateway listening on http://127.0.0.1:${port}`);
  });
}
