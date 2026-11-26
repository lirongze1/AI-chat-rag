import { app } from "./app";
import { config } from "./config";
import { startIngestionScheduler } from "./services/ingestionScheduler";

async function main() {
  // Recover queued / stale running ingestion jobs before serving requests.
  await startIngestionScheduler();

  app.listen(config.port, () => {
    console.log(`Backend server listening on http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start backend server", error);
  process.exit(1);
});
