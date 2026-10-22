"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

function keyBytes(base64Url: string) {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function registration() {
  const found = await navigator.serviceWorker.getRegistration();
  if (!found)
    throw new Error("Push notifications need the installed app build");
  return found;
}

const noopSubscribe = () => () => undefined;

const hasPush = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function usePush() {
  const config = useQuery(api.push.config);
  const subscribeMutation = useMutation(api.push.subscribe);
  const unsubscribeMutation = useMutation(api.push.unsubscribe);
  const supported = useSyncExternalStore(noopSubscribe, hasPush, () => false);
  const [asked, setAsked] = useState<NotificationPermission>();
  const permission = asked ?? (supported ? Notification.permission : "default");
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => undefined);
  }, [supported]);

  async function enable() {
    if (!config?.publicKey || pending) return;
    setPending(true);
    try {
      const reg = await registration();
      const result = await Notification.requestPermission();
      setAsked(result);
      if (result !== "granted") return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(config.publicKey),
      });
      const { endpoint, keys } = sub.toJSON();
      if (!endpoint || !keys?.p256dh || !keys.auth) {
        await sub.unsubscribe();
        throw new Error("Subscription is missing its keys");
      }
      try {
        await subscribeMutation({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
      } catch (reason) {
        await sub.unsubscribe();
        throw reason;
      }
      setSubscribed(true);
      toast("Push notifications on");
    } catch (reason) {
      toast(readError(reason, "Couldn't turn on push notifications").message, {
        tone: "danger",
      });
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    if (pending) return;
    setPending(true);
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast("Push notifications off");
    } catch (reason) {
      toast(readError(reason, "Couldn't turn off push notifications").message, {
        tone: "danger",
      });
    } finally {
      setPending(false);
    }
  }

  return {
    supported,
    permission,
    subscribed,
    pending,
    publicKey: config?.publicKey,
    enable,
    disable,
  };
}
