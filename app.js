(() => {
  const STORAGE_KEY = "dinner-decider.v1";
  const SCHEMA_VERSION = 1;
  const MAX_NAME_LENGTH = 100;
  const MAX_NOTE_LENGTH = 500;
  const sharedStore = window.DinnerDeciderSharedStore;

  const elements = {
    storageMessage: document.querySelector("#storage-message"),
    topbarNote: document.querySelector("#topbar-note"),
    shareButton: document.querySelector("#share-button"),
    privacyNote: document.querySelector("#privacy-note"),
    pickResult: document.querySelector("#pick-result"),
    pickerHeading: document.querySelector("#picker-heading"),
    pickButton: document.querySelector("#pick-button"),
    pickCaption: document.querySelector("#pick-caption"),
    total: document.querySelector("#restaurant-total"),
    eligible: document.querySelector("#eligible-count"),
    list: document.querySelector("#restaurant-list"),
    empty: document.querySelector("#empty-state"),
    addButton: document.querySelector("#add-button"),
    emptyAddButton: document.querySelector("#empty-add-button"),
    includeAll: document.querySelector("#include-all-button"),
    excludeAll: document.querySelector("#exclude-all-button"),
    clearAll: document.querySelector("#clear-all-button"),
    dialog: document.querySelector("#restaurant-dialog"),
    form: document.querySelector("#restaurant-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    name: document.querySelector("#restaurant-name"),
    note: document.querySelector("#restaurant-note"),
    nameError: document.querySelector("#name-error"),
    noteError: document.querySelector("#note-error"),
    duplicate: document.querySelector("#duplicate-message"),
    keepExisting: document.querySelector("#keep-existing-button"),
    closeDialog: document.querySelector("#dialog-close"),
    cancelDialog: document.querySelector("#dialog-cancel"),
    saveButton: document.querySelector("#save-button"),
  };

  let restaurants = [];
  let editingId = null;
  let lastPickId = null;
  let shareId = sharedStore.readShareId();
  let sharedMode = Boolean(shareId);
  let sharedReady = false;
  let sharedRevision = 0;
  let sharedSaveQueue = Promise.resolve();
  let localConflict = null;
  let pendingLocalSave = null;
  let sharedPendingWrites = 0;
  let familyRefreshInProgress = false;

  function isRestaurant(value) {
    return value !== null
      && typeof value === "object"
      && typeof value.id === "string"
      && value.id.length > 0
      && typeof value.name === "string"
      && value.name.trim().length > 0
      && value.name.trim().length <= MAX_NAME_LENGTH
      && typeof value.note === "string"
      && value.note.length <= MAX_NOTE_LENGTH
      && typeof value.included === "boolean"
      && typeof value.createdAt === "string"
      && typeof value.updatedAt === "string";
  }

  function isFamilyList(value) {
    return value !== null
      && typeof value === "object"
      && Array.isArray(value.restaurants)
      && value.restaurants.every(isRestaurant)
      && Number.isSafeInteger(value.revision)
      && value.revision >= 0;
  }

  function showStorageMessage(message, kind = "warning", actions = []) {
    const text = document.createElement("span");
    text.textContent = message;
    const content = [text];
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "message-action";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      content.push(button);
    }
    elements.storageMessage.replaceChildren(...content);
    elements.storageMessage.dataset.kind = kind;
    elements.storageMessage.hidden = false;
  }

  function clearStorageMessage() {
    elements.storageMessage.textContent = "";
    elements.storageMessage.hidden = true;
  }

  function loadRestaurants() {
    let saved;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      showStorageMessage("Browser storage is unavailable. Your list will work for this session, but changes may not persist.");
      return [];
    }

    if (saved === null) return [];

    try {
      const data = JSON.parse(saved);
      if (data === null || data.version !== SCHEMA_VERSION || !Array.isArray(data.restaurants)) {
        throw new Error("Unsupported or malformed saved list");
      }
      const validRestaurants = data.restaurants.filter(isRestaurant);
      if (validRestaurants.length !== data.restaurants.length) {
        showStorageMessage("Some saved entries could not be read and were left out. The rest of your list is available.");
      }
      return validRestaurants;
    } catch {
      showStorageMessage("Your saved list could not be read. You can start a new list; the damaged saved data was not changed.", "error");
      return [];
    }
  }

  function saveLocalRestaurants(nextRestaurants) {
    restaurants = nextRestaurants;
    render();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: SCHEMA_VERSION,
        restaurants,
      }));
      clearStorageMessage();
      return true;
    } catch {
      showStorageMessage("Could not save to this device. Your changes are available until you close this page, but may not persist.", "error");
      return false;
    }
  }

  function persistSharedRestaurants(nextRestaurants) {
    pendingLocalSave = nextRestaurants;
    sharedPendingWrites += 1;
    render();
    sharedSaveQueue = sharedSaveQueue.then(async () => {
      if (localConflict || !sharedReady) return;
      const result = await sharedStore.saveList(shareId, nextRestaurants, sharedRevision);
      if (!result.saved) {
        const latest = await sharedStore.loadList(shareId);
        if (!isFamilyList(latest)) {
          throw new Error("The family list could not be reloaded after a simultaneous update.");
        }
        localConflict = {
          local: restaurants,
          remote: latest.restaurants,
        };
        sharedRevision = latest.revision;
        showStorageMessage(
          "A family member changed the list at the same time. Choose which version to keep.",
          "error",
          [
            { label: "Use family version", onClick: useFamilyVersion },
            { label: "Keep my version", onClick: keepMyVersion },
          ],
        );
        return;
      }
      sharedRevision = result.revision;
      if (pendingLocalSave === nextRestaurants) pendingLocalSave = null;
      showStorageMessage("Family list saved and shared with everyone using this link.", "success");
    }).catch((error) => {
      showStorageMessage(
        `${error.message} Your changes are still on this page but haven't been shared.`,
        "error",
        [{ label: "Retry sync", onClick: () => persistSharedRestaurants(restaurants) }],
      );
    }).finally(() => {
      sharedPendingWrites = Math.max(0, sharedPendingWrites - 1);
      render();
    });
  }

  function saveRestaurants(nextRestaurants) {
    if (sharedMode) {
      restaurants = nextRestaurants;
      render();
      persistSharedRestaurants(nextRestaurants);
      return true;
    }
    return saveLocalRestaurants(nextRestaurants);
  }

  function createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function createSvgCheck() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m3.5 8 3 3 6-6");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }

  function makeRestaurantRow(restaurant) {
    const row = document.createElement("li");
    row.className = `restaurant-row${restaurant.included ? "" : " is-excluded"}`;
    row.dataset.id = restaurant.id;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "include-control";
    toggle.setAttribute("aria-pressed", String(restaurant.included));
    toggle.setAttribute("aria-label", `${restaurant.included ? "Exclude" : "Include"} ${restaurant.name} ${restaurant.included ? "from" : "in"} draws`);
    toggle.disabled = sharedMode && (!sharedReady || Boolean(localConflict));
    if (restaurant.included) toggle.append(createSvgCheck());
    toggle.addEventListener("click", () => {
      saveRestaurants(restaurants.map((item) => item.id === restaurant.id
        ? { ...item, included: !item.included, updatedAt: new Date().toISOString() }
        : item));
    });

    const info = document.createElement("div");
    info.className = "restaurant-info";
    const name = document.createElement("p");
    name.className = "restaurant-name";
    name.textContent = restaurant.name;
    info.append(name);
    if (restaurant.note) {
      const note = document.createElement("p");
      note.className = "restaurant-note";
      note.textContent = restaurant.note;
      info.append(note);
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const state = document.createElement("span");
    state.className = "state-label";
    state.textContent = restaurant.included ? "Included" : "Excluded";
    actions.append(state);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "row-action";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${restaurant.name}`);
    edit.disabled = sharedMode && (!sharedReady || Boolean(localConflict));
    edit.addEventListener("click", () => openDialog(restaurant));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-action remove-action";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${restaurant.name}`);
    remove.disabled = sharedMode && (!sharedReady || Boolean(localConflict));
    remove.addEventListener("click", () => {
      if (!window.confirm(`Remove ${restaurant.name} from your list?`)) return;
      saveRestaurants(restaurants.filter((item) => item.id !== restaurant.id));
      if (lastPickId === restaurant.id) showDefaultResult();
    });

    actions.append(edit, remove);
    row.append(toggle, info, actions);
    return row;
  }

  function render() {
    const eligibleCount = restaurants.filter((restaurant) => restaurant.included).length;
    const locked = sharedMode && (!sharedReady || Boolean(localConflict));
    elements.total.textContent = String(restaurants.length);
    elements.eligible.textContent = `${eligibleCount} included`;
    elements.pickButton.disabled = eligibleCount === 0;
    elements.pickCaption.textContent = eligibleCount === 0
      ? (restaurants.length === 0 ? "Add a restaurant to get started" : "Include a place to make it pickable")
      : `Picking from ${eligibleCount} ${eligibleCount === 1 ? "place" : "places"}`;
    elements.list.replaceChildren(...restaurants.map(makeRestaurantRow));
    elements.empty.hidden = restaurants.length > 0;
    elements.list.hidden = restaurants.length === 0;
    elements.includeAll.disabled = restaurants.length === 0 || restaurants.every((restaurant) => restaurant.included);
    elements.excludeAll.disabled = restaurants.length === 0 || restaurants.every((restaurant) => !restaurant.included);
    elements.clearAll.disabled = restaurants.length === 0;
    elements.addButton.disabled = locked;
    elements.emptyAddButton.disabled = locked;
    elements.includeAll.disabled ||= locked;
    elements.excludeAll.disabled ||= locked;
    elements.clearAll.disabled ||= locked;
    elements.shareButton.querySelector("span").textContent = sharedMode ? "Copy family link" : "Share family list";
    elements.shareButton.setAttribute("aria-label", sharedMode ? "Copy private family list link" : "Create a private family list link");
    setModeLabel(sharedMode ? (sharedReady ? "Shared family list" : "Connecting to family list") : "Your list stays on this device");
    elements.privacyNote.textContent = sharedMode
      ? "Shared with family through a private link."
      : "Your list stays in this browser.";
  }

  function setModeLabel(message) {
    const dot = document.createElement("span");
    dot.className = "privacy-dot";
    dot.setAttribute("aria-hidden", "true");
    elements.topbarNote.replaceChildren(dot, document.createTextNode(message));
  }

  function useFamilyVersion() {
    if (!localConflict) return;
    restaurants = localConflict.remote;
    localConflict = null;
    pendingLocalSave = null;
    render();
    showStorageMessage("Showing the latest family list.", "success");
  }

  function keepMyVersion() {
    if (!localConflict) return;
    const localVersion = localConflict.local;
    localConflict = null;
    pendingLocalSave = null;
    restaurants = localVersion;
    render();
    persistSharedRestaurants(localVersion);
  }

  function appendInviteLink(url) {
    const link = document.createElement("a");
    link.className = "invite-link";
    link.href = url;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    elements.storageMessage.append(document.createElement("br"), link);
  }

  async function copyFamilyLink() {
    const url = sharedStore.makeShareUrl(shareId);
    try {
      await navigator.clipboard.writeText(url);
      showStorageMessage("Private family link copied. Anyone with this link can view and edit the list.", "success");
    } catch {
      showStorageMessage("Copy wasn't available. Use this private link to invite your family:", "warning");
    }
    appendInviteLink(url);
  }

  async function createFamilyList() {
    if (!sharedStore.isConfigured()) {
      showStorageMessage("Shared lists need a Supabase project first. Follow SETUP.md to enable family sharing.", "error");
      return;
    }
    elements.shareButton.disabled = true;
    try {
      shareId = sharedStore.createShareId();
      await sharedStore.createList(shareId, restaurants);
      sharedRevision = 0;
      sharedMode = true;
      sharedReady = true;
      history.replaceState(null, "", `${location.pathname}${location.search}#family=${encodeURIComponent(shareId)}`);
      render();
      await copyFamilyLink();
    } catch (error) {
      shareId = null;
      showStorageMessage(error.message, "error");
    } finally {
      elements.shareButton.disabled = false;
    }
  }

  async function loadFamilyList() {
    if (!sharedStore.isConfigured()) {
      showStorageMessage("Shared lists aren't configured yet. The family link can't load until the Supabase setup in SETUP.md is complete.", "error");
      render();
      return;
    }

    try {
      const data = await sharedStore.loadList(shareId);
      if (!isFamilyList(data)) {
        throw new Error("This family link is invalid or its list could not be read.");
      }
      if (data.revision !== sharedRevision || !sharedReady) {
        restaurants = data.restaurants;
        sharedRevision = data.revision;
        render();
      }
      sharedReady = true;
      showStorageMessage("Family list is up to date and shared with everyone using this link.", "success");
      render();
    } catch (error) {
      sharedReady = false;
      showStorageMessage(error.message, "error");
      render();
    }
  }

  async function checkForFamilyUpdates() {
    if (!sharedMode || !sharedReady || familyRefreshInProgress || sharedPendingWrites > 0 || pendingLocalSave || localConflict || elements.dialog.open || document.hidden) return;
    familyRefreshInProgress = true;
    try {
      const latest = await sharedStore.loadList(shareId);
      if (sharedPendingWrites > 0 || pendingLocalSave || localConflict) return;
      if (isFamilyList(latest) && latest.revision > sharedRevision) {
        restaurants = latest.restaurants;
        sharedRevision = latest.revision;
        render();
        showStorageMessage("Family list updated with the latest changes.", "success");
      }
    } catch {
      showStorageMessage("Couldn't check for family updates. Showing the last saved list.", "warning");
    } finally {
      familyRefreshInProgress = false;
    }
  }

  function showDefaultResult() {
    lastPickId = null;
    elements.pickButton.querySelector("span").textContent = "Pick for me";
    elements.pickerHeading.replaceChildren(
      document.createTextNode("A good meal"),
      document.createElement("br"),
      document.createTextNode("is "),
      Object.assign(document.createElement("em"), { textContent: "calling." }),
    );
    const description = document.createElement("p");
    description.textContent = "Add the places you love. We’ll take it from here.";
    elements.pickResult.replaceChildren(elements.pickerHeading, description);
  }

  function pickRestaurant() {
    const eligible = restaurants.filter((restaurant) => restaurant.included);
    if (eligible.length === 0) return;
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    lastPickId = chosen.id;

    const heading = document.createElement("h2");
    heading.id = "picker-heading";
    heading.textContent = chosen.name;
    const description = document.createElement("p");
    description.textContent = chosen.note
      ? `${chosen.note} · Picked from your included places.`
      : "Picked at random from your included places.";
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "result-back-button";
    backButton.textContent = "Back to your list";
    backButton.addEventListener("click", showDefaultResult);
    elements.pickResult.replaceChildren(heading, description, backButton);
    elements.pickButton.querySelector("span").textContent = "Pick again";
  }

  function resetValidation() {
    elements.nameError.textContent = "";
    elements.noteError.textContent = "";
    elements.duplicate.hidden = true;
    elements.name.removeAttribute("aria-invalid");
    elements.note.removeAttribute("aria-invalid");
  }

  function openDialog(restaurant = null) {
    editingId = restaurant ? restaurant.id : null;
    elements.dialogTitle.textContent = restaurant ? "Edit your place" : "Add a place";
    elements.saveButton.textContent = restaurant ? "Save changes" : "Add to my list";
    elements.name.value = restaurant ? restaurant.name : "";
    elements.note.value = restaurant ? restaurant.note : "";
    resetValidation();
    elements.dialog.showModal();
    elements.name.focus();
  }

  function closeDialog() {
    elements.dialog.close();
    editingId = null;
    resetValidation();
  }

  function normalizedName(name) {
    return name.trim().toLocaleLowerCase();
  }

  function validateForm() {
    resetValidation();
    const name = elements.name.value.trim();
    const note = elements.note.value.trim();
    let valid = true;

    if (!name) {
      elements.nameError.textContent = "Enter a restaurant name.";
      elements.name.setAttribute("aria-invalid", "true");
      valid = false;
    } else if (name.length > MAX_NAME_LENGTH) {
      elements.nameError.textContent = `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`;
      elements.name.setAttribute("aria-invalid", "true");
      valid = false;
    }
    if (note.length > MAX_NOTE_LENGTH) {
      elements.noteError.textContent = `Keep the note to ${MAX_NOTE_LENGTH} characters or fewer.`;
      elements.note.setAttribute("aria-invalid", "true");
      valid = false;
    }

    if (!valid) {
      (elements.name.getAttribute("aria-invalid") ? elements.name : elements.note).focus();
      return null;
    }

    const duplicate = restaurants.find((restaurant) => restaurant.id !== editingId
      && normalizedName(restaurant.name) === normalizedName(name));
    if (duplicate) {
      elements.duplicate.hidden = false;
      elements.keepExisting.dataset.id = duplicate.id;
      elements.name.setAttribute("aria-invalid", "true");
      elements.name.focus();
      return null;
    }
    return { name, note };
  }

  function saveForm(event) {
    event.preventDefault();
    const value = validateForm();
    if (!value) return;

    const now = new Date().toISOString();
    if (editingId) {
      saveRestaurants(restaurants.map((restaurant) => restaurant.id === editingId
        ? { ...restaurant, name: value.name, note: value.note, updatedAt: now }
        : restaurant));
    } else {
      saveRestaurants([...restaurants, {
        id: createId(),
        name: value.name,
        note: value.note,
        included: true,
        createdAt: now,
        updatedAt: now,
      }]);
    }
    closeDialog();
  }

  elements.addButton.addEventListener("click", () => openDialog());
  elements.emptyAddButton.addEventListener("click", () => openDialog());
  elements.shareButton.addEventListener("click", () => {
    if (sharedMode) {
      copyFamilyLink();
    } else {
      createFamilyList();
    }
  });
  elements.pickButton.addEventListener("click", pickRestaurant);
  elements.includeAll.addEventListener("click", () => {
    saveRestaurants(restaurants.map((restaurant) => ({ ...restaurant, included: true, updatedAt: new Date().toISOString() })));
  });
  elements.excludeAll.addEventListener("click", () => {
    saveRestaurants(restaurants.map((restaurant) => ({ ...restaurant, included: false, updatedAt: new Date().toISOString() })));
  });
  elements.clearAll.addEventListener("click", () => {
    if (!window.confirm("Clear every restaurant from your list? This cannot be undone.")) return;
    saveRestaurants([]);
    showDefaultResult();
  });
  elements.form.addEventListener("submit", saveForm);
  elements.closeDialog.addEventListener("click", closeDialog);
  elements.cancelDialog.addEventListener("click", closeDialog);
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });
  elements.keepExisting.addEventListener("click", () => {
    const existing = elements.list.querySelector(`[data-id="${CSS.escape(elements.keepExisting.dataset.id)}"]`);
    closeDialog();
    if (existing) {
      existing.scrollIntoView({ behavior: "smooth", block: "nearest" });
      existing.querySelector(".restaurant-name").setAttribute("tabindex", "-1");
      existing.querySelector(".restaurant-name").focus();
    }
  });

  if (sharedMode) {
    elements.shareButton.querySelector("span").textContent = "Copy family link";
    elements.topbarNote.lastChild.textContent = "Shared family list";
    render();
    loadFamilyList();
    window.setInterval(checkForFamilyUpdates, 12000);
  } else if (window.location.hash.startsWith("#family=")) {
    showStorageMessage("This family link is malformed. Ask the list owner to send a fresh link.", "error");
    restaurants = [];
    render();
  } else {
    restaurants = loadRestaurants();
    render();
  }
})();
