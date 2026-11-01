let token = "";

export function requestWriteToken() {
  token = window.prompt("Write access token", token) || "";
  return token;
}

export function currentWriteToken() { return token; }

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD"].includes((init.method || "GET").toUpperCase())) {
    if (!token && !requestWriteToken()) throw new Error("Write access token is required");
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401) token = "";
  return response;
}
