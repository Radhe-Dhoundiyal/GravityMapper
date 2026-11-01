let token = "";
export const ACCESS_CHANGED_EVENT = "gadv:access-changed";

function setToken(value: string) {
  token = value;
  window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
}

export function requestWriteToken() {
  setToken(window.prompt("Administrative access token", token) || "");
  return token;
}

export function currentWriteToken() { return token; }

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Administrative API requests must stay on this dashboard's origin");
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD"].includes((init.method || "GET").toUpperCase())) {
    if (!token && !requestWriteToken()) throw new Error("Write access token is required");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401 && token) setToken("");
  return response;
}

export async function downloadOriginalCsv(runId: string) {
  if (!token && !requestWriteToken()) throw new Error("Administrative access is required to download original files");
  const response = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/original.csv`, { cache: "no-store" });
  if (!response.ok) throw new Error("Original download was denied or unavailable. Check administrative access.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${runId}-original.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
