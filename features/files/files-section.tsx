"use client";

import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { DetailSection } from "@/components/record/detail";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_FILE_TYPES,
  MAX_FILE_BYTES,
  fileSize,
} from "@/lib/domain/files";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";

type Target =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

/** Documents attached to a record; they download, and are never rendered in the page. */
export default function FilesSection({
  target,
  className,
  divider,
}: {
  target: Target;
  className?: string;
  divider?: boolean;
}) {
  const files = useQuery(api.files.list, { target });
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const attach = useMutation(api.files.attach);
  const remove = useMutation(api.files.remove);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Id<"attachments"> | null>(null);

  async function upload(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast(`${file.name} is over ${MAX_FILE_BYTES / 1024 / 1024} MB`, {
        tone: "danger",
      });
      return;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast(`${file.name} isn't a supported file type`, { tone: "danger" });
      return;
    }
    setUploading(file.name);
    try {
      const response = await fetch(await generateUploadUrl(), {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      const result = await attach({ target, storageId, name: file.name });
      if (!result.ok) toast(result.message, { tone: "danger" });
    } catch (error) {
      toast(readError(error, `Couldn't upload ${file.name}`).message, {
        tone: "danger",
      });
    } finally {
      setUploading(null);
    }
  }

  async function uploadAll(list: FileList | null) {
    if (uploading || !list) return;
    for (const file of Array.from(list)) await upload(file);
  }

  async function confirmRemove(id: Id<"attachments">) {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    setConfirming(null);
    try {
      await remove({ id });
    } catch (error) {
      toast(readError(error, "Couldn't remove that file").message, {
        tone: "danger",
      });
    }
  }

  function onDrop(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    void uploadAll(event.dataTransfer.files);
  }

  return (
    <div
      className="contents"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <DetailSection
        collapsible
        title="Files"
        className={className}
        divider={divider}
        action={
          <Button
            variant="ghost"
            size="xs"
            disabled={uploading !== null}
            onClick={() => input.current?.click()}
          >
            <PlusIcon aria-hidden className="size-2.5" />
            Add file
          </Button>
        }
      >
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Add file"
          accept={ALLOWED_FILE_EXTENSIONS}
          onChange={(event) => {
            void uploadAll(event.target.files);
            event.target.value = "";
          }}
        />
        {uploading && (
          <p role="status" className="caption-style text-fg-secondary truncate">
            Uploading {uploading}…
          </p>
        )}
        {files === undefined ? (
          <div aria-busy className="flex flex-col gap-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : files.length === 0 ? (
          !uploading && (
            <p className="text-fg-tertiary text-sm">
              Drop files here or add one. PDF, images, Word, Excel, CSV or text,
              up to {MAX_FILE_BYTES / 1024 / 1024} MB.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {files.map((file) => (
              <li key={file._id} className="flex min-w-0 items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {file.url ? (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.name}
                      title={file.name}
                      className="hover:text-fg-secondary focus-visible:ring-ring w-fit max-w-full truncate rounded-sm text-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                    >
                      {file.name}
                    </a>
                  ) : (
                    <span title={file.name} className="truncate text-sm">
                      {file.name}
                    </span>
                  )}
                  <span className="caption-style text-fg-tertiary truncate">
                    {fileSize(file.size)}
                    {file.uploadedBy && ` · ${file.uploadedBy}`} ·{" "}
                    {relativeTime(file.uploadedAt)}
                  </span>
                </span>
                {file.removable &&
                  (confirming === file._id ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      autoFocus
                      className="text-danger"
                      onBlur={() => setConfirming(null)}
                      onClick={() => void confirmRemove(file._id)}
                    >
                      Remove?
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => void confirmRemove(file._id)}
                    >
                      <TrashIcon aria-hidden className="size-3" />
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );
}
