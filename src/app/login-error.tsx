"use client";

import { useSearchParams } from "next/navigation";

/** Shows ?error=… from a failed connect or login, which redirects home. */
export function LoginError() {
  const error = useSearchParams().get("error");
  if (!error) return null;
  return (
    <p className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-left text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      {error}
    </p>
  );
}
