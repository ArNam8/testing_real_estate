/**
 * Small, dependency-free storage retry helper for generated DOCX files.
 * A single transient Storage response should not turn a successfully built
 * document into an unavailable output. The caller owns logging and decides
 * how to surface a final failure in the property manifest.
 */

export interface StorageUploadResult {
  error?: { message?: string } | null;
}

export interface UploadAttemptResult {
  ok: boolean;
  attempts: number;
  error?: string;
}

type Wait = (milliseconds: number) => Promise<void>;

const wait: Wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Attempt a document upload once, then retry exactly once for a transient error. */
export async function uploadDocumentWithRetry(
  upload: () => Promise<StorageUploadResult>,
  pause: Wait = wait,
): Promise<UploadAttemptResult> {
  let finalError = "Storage returned an unknown error.";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await upload();
      if (!result.error) return { ok: true, attempts: attempt };
      finalError = result.error.message?.trim() || finalError;
    } catch (error) {
      finalError = error instanceof Error ? error.message : finalError;
    }

    if (attempt === 1) await pause(250);
  }

  return { ok: false, attempts: 2, error: finalError };
}
