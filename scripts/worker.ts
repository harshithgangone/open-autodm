import { processTransportJobs } from "../src/lib/transport/worker";
import { processDueJobs } from "../src/lib/automation/engine";
import { POST as maintenance } from "../src/app/api/cron/process-jobs/route";
import { getEnv } from "../src/lib/env";

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function transportLoop() {
  while (!stopping) {
    let claimed = 0;
    try {
      claimed = await processTransportJobs(16);
    } catch {
      console.error(
        JSON.stringify({ scope: "worker", error: "transport_unavailable" }),
      );
    }
    if (!stopping) await sleep(claimed ? 100 : 2000);
  }
}
async function legacyLoop() {
  let nextMaintenance = 0;
  while (!stopping) {
    try {
      await processDueJobs(1);
      if (Date.now() >= nextMaintenance) {
        await maintenance(
          new Request("http://worker/api/cron/process-jobs", {
            method: "POST",
            headers: { Authorization: `Bearer ${getEnv().CRON_SECRET}` },
          }),
        );
        nextMaintenance = Date.now() + 3600_000;
      }
    } catch {
      console.error(
        JSON.stringify({ scope: "worker", error: "maintenance_unavailable" }),
      );
    }
    if (!stopping) await sleep(2000);
  }
}
async function main() {
  getEnv();
  await Promise.all([transportLoop(), legacyLoop()]);
}
main().catch(() => {
  console.error("Worker configuration invalid");
  process.exitCode = 1;
});
