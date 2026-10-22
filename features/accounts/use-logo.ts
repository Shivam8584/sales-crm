"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { logoProblem } from "@/lib/domain/logo";
import { toast } from "@/stores/toast-store";

/** A logo file chosen but not yet saved, with an object URL to preview it. */
export function useLogoPick() {
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) {
      toast(problem, { tone: "danger" });
      return;
    }
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  return { picked, pick, clear: () => setPicked(null) };
}

/** Uploads `file` as the account's logo. Resolves to the server's refusal message, or null on success. */
export function useLogoUpload() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const setLogo = useMutation(api.accounts.setLogo);
  return async (id: Id<"accounts">, file: File) => {
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">;
    };
    const result = await setLogo({ id, storageId });
    return result.ok ? null : result.message;
  };
}
