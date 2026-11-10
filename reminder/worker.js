// minimal-reminder: a small Worker whose only job is the evening reminder.
// Pages Functions cannot run on a schedule, so this Worker shares the same D1
// database and runs every 15 minutes. See api/reminder.js for the rule.
import { runReminder } from "../api/reminder.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminder(env, new Date(controller.scheduledTime)));
  },
  // No public HTTP surface.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
