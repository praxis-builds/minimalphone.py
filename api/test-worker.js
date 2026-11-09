// Plain Worker wrapper so the Vitest Workers pool can call the same handler.
import { handle } from "./app.js";

export default { fetch: (request, env) => handle(request, env) };
