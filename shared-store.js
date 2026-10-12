(() => {
  const config = window.DINNER_DECIDER_CONFIG || {};
  const supabaseUrl = typeof config.supabaseUrl === "string"
    ? config.supabaseUrl.replace(/\/+$/, "")
    : "";
  const anonKey = typeof config.supabaseAnonKey === "string"
    ? config.supabaseAnonKey.trim()
    : "";

  function isConfigured() {
    return supabaseUrl.startsWith("https://") && anonKey.length > 0;
  }

  async function request(path, { token, method = "GET", body, prefer } = {}) {
    if (!isConfigured()) {
      throw new Error("Shared lists are not configured. Follow SETUP.md to connect the family list.");
    }

    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    };
    if (token) headers["x-family-key"] = token;
    if (prefer) headers.Prefer = prefer;

    let response;
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new Error("Could not reach shared storage. Check your internet connection and try again.");
    }

    if (!response.ok) {
      let detail = "";
      try {
        const error = await response.json();
        detail = typeof error.message === "string" ? error.message : "";
      } catch {
        detail = "";
      }
      throw new Error(detail || `Shared storage returned an error (${response.status}).`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function createList(token, restaurants) {
    await request("family_lists", {
      token,
      method: "POST",
      body: { share_id: token, restaurants, revision: 0 },
      prefer: "return=minimal",
    });
    return { revision: 0 };
  }

  async function loadList(token) {
    const query = new URLSearchParams({
      select: "restaurants,revision",
      share_id: `eq.${token}`,
      limit: "1",
    });
    const rows = await request(`family_lists?${query}`, { token });
    return rows[0] || null;
  }

  async function saveList(token, restaurants, expectedRevision) {
    const result = await request("rpc/save_family_list", {
      token,
      method: "POST",
      body: {
        p_share_id: token,
        p_restaurants: restaurants,
        p_expected_revision: expectedRevision,
      },
    });
    const row = Array.isArray(result) ? result[0] : result;
    if (row && row.saved === true && Number.isSafeInteger(row.revision) && row.revision >= 0) return row;
    if (row && row.saved === false) return row;
    throw new Error("Shared storage returned an invalid save confirmation.");
  }

  function createShareId() {
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      throw new Error("This browser cannot create a secure family link. Open the app over HTTPS in a modern browser.");
    }
    return window.crypto.randomUUID();
  }

  function makeShareUrl(token) {
    return `${window.location.origin}${window.location.pathname}#family=${encodeURIComponent(token)}`;
  }

  function readShareId() {
    const match = /^#family=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(window.location.hash);
    return match ? match[1] : null;
  }

  window.DinnerDeciderSharedStore = Object.freeze({
    isConfigured,
    createList,
    loadList,
    saveList,
    createShareId,
    makeShareUrl,
    readShareId,
  });
})();
