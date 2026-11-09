// Cloudflare Pages Function: every /api/* request goes to the sync API.
import { handle } from "../../api/app.js";

export const onRequest = ({ request, env }) => handle(request, env);
