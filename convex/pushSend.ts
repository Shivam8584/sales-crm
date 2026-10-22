"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
// @ts-expect-error web-push ships no type declarations
import webpush from "web-push";

const env = (name: string) => process.env[name]?.trim() || undefined;

export const sendToMember = internalAction({
  args: {
    memberId: v.id("members"),
    title: v.string(),
    body: v.string(),
    href: v.string(),
  },
  handler: async (ctx, { memberId, ...payload }) => {
    const subject = env("VAPID_SUBJECT");
    const publicKey = env("VAPID_PUBLIC_KEY");
    const privateKey = env("VAPID_PRIVATE_KEY");
    if (!subject || !publicKey || !privateKey) return;

    const subscriptions = await ctx.runQuery(internal.push.forMember, {
      memberId,
    });
    if (subscriptions.length === 0) return;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { TTL: 60 * 60 },
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await ctx.runMutation(internal.push.drop, {
              endpoint: subscription.endpoint,
            });
            return;
          }
          console.error(
            "push failed:",
            status ?? (error instanceof Error ? error.message : error),
          );
        }
      }),
    );
  },
});
