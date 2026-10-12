(() => {
  const STORAGE_KEY = "dinner-decider.v1";
  const SCHEMA_VERSION = 1;
  const MAX_NAME_LENGTH = 100;
  const MAX_NOTE_LENGTH = 500;

  const elements = {
    storageMessage: document.querySelector("#storage-message"),
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

  function showStorageMessage(message, kind = "warning") {
    elements.storageMessage.textContent = message;
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

  function saveRestaurants(nextRestaurants) {
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
    edit.addEventListener("click", () => openDialog(restaurant));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "row-action remove-action";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${restaurant.name}`);
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

  restaurants = loadRestaurants();
  render();
})();
