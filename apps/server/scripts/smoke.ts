// After `bun run build`: the compiled binary starts with an empty database and answers /health
import { startServer } from "../src/testing/start-server.ts";

const { child, response } = await startServer(["dist/kennwort-server"], 28700);
child.kill();
if (response.status !== 200) {
  console.error(`health answered ${response.status}`);
  process.exit(1);
}
console.log("kennwort-server: /health ok");
