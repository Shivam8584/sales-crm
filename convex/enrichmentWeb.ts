"use node";

import { lookup as resolve } from "node:dns";
import type { LookupFunction } from "node:net";
import https from "node:https";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { pageMeta } from "./lib/enrichment/html";
import {
  MAX_BODY_BYTES,
  Refused,
  fetchPage,
  isPublicIp,
  type Requester,
} from "./lib/enrichment/safeFetch";
import type { PageReply } from "./lib/enrichment/waterfall";

// Checked at connect time so a public name can't be pointed at an internal address.
const publicOnly: LookupFunction = (hostname, options, callback) => {
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    if (!addresses.every((item) => isPublicIp(item.address))) {
      const blocked = new Error("Blocked a non-public address");
      return callback(blocked as NodeJS.ErrnoException, "", 4);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const request: Requester = (url, timeoutMs) =>
  new Promise((done, fail) => {
    const req = https.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: publicOnly,
        timeout: timeoutMs,
        headers: {
          "user-agent": "SalesCRM-Enrichment/1.0",
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        const html = /html/i.test(String(res.headers["content-type"] ?? ""));
        if (status < 200 || status > 299 || !html) {
          res.resume();
          return done({ status, location, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          done({ status, body: Buffer.concat(chunks).toString("utf8") });
        };
        res.on("data", (chunk: Buffer) => {
          const room = MAX_BODY_BYTES - size;
          chunks.push(chunk.subarray(0, room));
          size += Math.min(chunk.length, room);
          if (chunk.length >= room) {
            res.destroy();
            finish();
          }
        });
        res.on("end", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", fail);
    req.end();
  });

/** Reads a company homepage's title, meta tags and printed GSTINs. */
export const homepage = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<PageReply> => {
    try {
      const page = await fetchPage(url, request);
      return { ok: true, page: pageMeta(page.html, page.url) };
    } catch (error) {
      if (error instanceof Refused) return { ok: false, error: error.message };
      console.error("Website lookup failed", error);
      return { ok: false, error: "Couldn't reach the website" };
    }
  },
});
