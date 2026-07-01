import fs from "node:fs/promises";
import path from "node:path";

const EMPTY_STORE = {
  orders: [],
  paymentEvents: [],
  webhookDeliveries: [],
  auditLogs: []
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.write(EMPTY_STORE);
    }
  }

  async read() {
    await this.init();
    const raw = await fs.readFile(this.filePath, "utf8");
    return { ...EMPTY_STORE, ...JSON.parse(raw) };
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }

  async update(mutator) {
    const next = this.queue.then(async () => {
      const data = await this.read();
      const result = await mutator(data);
      await this.write(data);
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
