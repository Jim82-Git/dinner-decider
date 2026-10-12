(() => {
  const config = window.DINNER_DECIDER_CONFIG || {};
  const apiBaseUrl = typeof config.apiBaseUrl === "string"
    ? config.apiBaseUrl.replace(/\/+$/, "")
    : "";

  function isConfigured() {
    return apiBaseUrl.startsWith("https://") || apiBaseUrl.startsWith("http://localhost:");
  }

  async function request(path, { token, method = "GET", body } = {}) {
    if (!isConfigured()) {
      throw new Error("Shared lists are not configured. Follow SETUP.md to connect the family list.");
    }

    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Family-Key"] = token;

    let response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw new Error("Could not reach shared storage. Check your internet connection and try again.");
    }

    let result = null;
    try {
      result = await response.json();
    } catch {
      if (response.ok) throw new Error("Shared storage returned an invalid response.");
    }

    if (!response.ok && response.status !== 409) {
      throw new Error(result && typeof result.error === "string"
        ? result.error
        : `Shared storage returned an error (${response.status}).`);
    }
    return { status: response.status, data: result };
  }

  async function createList(restaurants) {
    const response = await request("/api/lists", {
      method: "POST",
      body: { restaurants },
    });
    const created = response.data;
    if (!created || typeof created.id !== "string" || typeof created.token !== "string"
      || !Array.isArray(created.restaurants) || !Number.isSafeInteger(created.revision)) {
      throw new Error("Shared storage returned invalid family-list details.");
    }
    return created;
  }

  async function loadList(id, token) {
    const response = await request(`/api/lists/${encodeURIComponent(id)}`, { token });
    return response.data;
  }

  async function saveList(id, token, restaurants, expectedRevision) {
    const response = await request(`/api/lists/${encodeURIComponent(id)}`, {
      token,
      method: "PUT",
      body: { restaurants, expectedRevision },
    });
    return response.data;
  }

  function createShareId() {
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      throw new Error("This browser cannot create a secure family link. Open the app over HTTPS in a modern browser.");
    }
    return window.crypto.randomUUID();
  }

  function makeShareUrl(id, token) {
    const credential = `${encodeURIComponent(id)}.${encodeURIComponent(token)}`;
    return `${window.location.origin}${window.location.pathname}#family=${credential}`;
  }

  function readShareCredential() {
    const match = /^#family=([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,60})$/i.exec(window.location.hash);
    return match ? { id: match[1], token: match[2] } : null;
  }

  window.DinnerDeciderSharedStore = Object.freeze({
    isConfigured,
    createList,
    loadList,
    saveList,
    createShareId,
    makeShareUrl,
    readShareCredential,
  });
})();
