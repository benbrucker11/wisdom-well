"use client";

export type UploadPrefix = "entry-media" | "raw-audio" | "raw-video";

export interface UploadedFile {
  url: string;
  key: string;
}

function xhrSend(
  method: "PUT" | "POST",
  url: string,
  body: Blob | FormData,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(body);
  });
}

/**
 * Upload a file or recording. Goes straight to the bucket when the server has
 * S3/R2 configured (no size limit from the app host); otherwise posts through
 * the app (local development). Reports progress 0–1.
 */
export async function uploadFile(
  file: Blob,
  name: string,
  prefix: UploadPrefix,
  onProgress?: (fraction: number) => void,
): Promise<UploadedFile> {
  const type = file.type || "application/octet-stream";
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, type, prefix }),
  });
  if (!presign.ok) throw new Error("Couldn't start the upload. Try again in a moment.");
  const plan = (await presign.json()) as
    | { direct: false }
    | { direct: true; uploadUrl: string; url: string; key: string; contentType: string };

  if (plan.direct) {
    await xhrSend("PUT", plan.uploadUrl, file, { "content-type": plan.contentType }, onProgress);
    return { url: plan.url, key: plan.key };
  }

  const form = new FormData();
  form.set("file", file, name);
  form.set("prefix", prefix);
  const text = await xhrSend("POST", "/api/uploads", form, {}, onProgress);
  const data = JSON.parse(text) as { url: string; key: string };
  return { url: data.url, key: data.key };
}
