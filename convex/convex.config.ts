import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
app.use(rateLimiter);
app.use(migrations);
app.use(aggregate, { name: "accountCounts" });
app.use(aggregate, { name: "peopleCounts" });
app.use(aggregate, { name: "leadCounts" });

export default app;
