export async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  try {
    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
