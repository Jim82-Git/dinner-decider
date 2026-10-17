# Dinner Decider — Product Specification

## 1. Overview

Dinner Decider helps an individual or group overcome decision fatigue by choosing a restaurant at random from a user-maintained list. Users can add restaurants, manage the list, and ask the app to pick one eligible option.

### Product goals

- Make choosing a place to eat fast and low effort.
- Let users control which restaurants are considered.
- Make the selection process understandable and feel fair.
- Keep the restaurant list available when the user returns.
- Work well on phones as well as desktop browsers.

### Success measures

- A first-time user can add a restaurant and get a pick without assistance.
- A returning user can get a pick in a few taps.
- A pick always corresponds to an eligible restaurant in the current list.
- The list remains available after the app is closed and reopened on the same device.

## 2. Scope and assumptions

### Initial release (MVP)

- A responsive web application for modern desktop and mobile browsers.
- No account or sign-in is required.
- Without a family invitation link, restaurant data is stored in the browser on the device where it was entered.
- A user may create a private family invitation link backed by a configured hosted SQLite API. Anyone with that link can use the same shared list from another device.
- A restaurant needs only a name; additional details are optional.
- The app selects uniformly at random from eligible restaurants.
- Users can add, edit, remove, and temporarily exclude restaurants from a draw.

### Out of scope for the MVP

- Restaurant search, map integrations, opening-hours checks, reviews, or live availability.
- Location-aware suggestions or automatic restaurant imports.
- User accounts, role-based access, and collaboration beyond one shared family list.
- Ordering, reservations, payments, or restaurant contact.
- Recommendation ranking, weighted picks, or AI-generated suggestions.

## 3. Users and primary use cases

### Target users

- A person deciding where to eat.
- A household or group using one device and one shared list.

### Primary use cases

1. Add restaurants that the user is willing to visit.
2. Randomly select one restaurant from the eligible list.
3. Exclude a restaurant temporarily without deleting it.
4. Correct or remove an entry when the list changes.
5. Keep the list for later visits to the app.

## 4. Core terminology

- **Restaurant:** A user-created list entry.
- **Eligible restaurant:** An active restaurant that is not excluded from the current draw.
- **Draw:** One random selection from the eligible restaurants.
- **Excluded:** A restaurant retained in the list but not currently eligible for draws.

## 5. Functional requirements

### 5.1 Restaurant list

- Show all saved restaurants, including excluded entries.
- Clearly distinguish included and excluded entries.
- Show a useful empty state when no restaurants have been added.
- Keep list order stable between app visits unless the user changes it.
- If the list is long, keep list controls usable on mobile and allow scrolling.

### 5.2 Add a restaurant

- Provide an obvious “Add restaurant” action.
- Require a non-empty restaurant name.
- Trim leading and trailing whitespace before saving.
- Reject names that are empty after trimming.
- Enforce a maximum name length of 100 characters.
- Allow an optional note of up to 500 characters (for example, cuisine or location).
- New restaurants are included in draws by default.
- Prevent accidental duplicate entries by comparing trimmed names without regard to case.
- If a duplicate is entered, explain the conflict and offer to keep the existing entry rather than silently creating another.
- On successful save, show the new entry in the list and make it eligible for the next draw.

### 5.3 Edit a restaurant

- Allow the user to change the name and optional note.
- Apply the same validation and duplicate rules used when adding.
- Preserve the restaurant’s included/excluded state when it is edited.
- Do not lose edits if validation fails; explain the issue beside the relevant field.

### 5.4 Remove a restaurant

- Allow the user to permanently remove an entry.
- Ask for confirmation before removal, or provide an equivalent undo action, to prevent accidental loss.
- Removing an entry updates the eligible count immediately.
- Removal is permanent for the current device unless restored through an undo action.

### 5.5 Include or exclude from draws

- Let the user toggle each restaurant between included and excluded.
- Exclusion is not deletion; excluded entries remain visible and can be included again.
- Provide a clear control to include all restaurants.
- Provide a clear control to exclude all restaurants.
- If no restaurants are eligible, disable the draw action and explain that at least one restaurant must be included.

### 5.6 Random selection

- Provide a prominent “Pick a restaurant” action.
- Select uniformly from the eligible restaurants, excluding the immediately previous pick when at least two restaurants are eligible.
- Use a standard pseudorandom source provided by the platform; no cryptographic randomness is required.
- Do not select an excluded entry.
- If exactly one restaurant is eligible, return it as the pick.
- Display the selected restaurant’s name prominently. Show its optional note when present.
- Do not change the list or exclusions as a side effect of a draw.
- Do not repeat the immediately previous restaurant when another restaurant is eligible. A restaurant may be selected again after a different pick; longer no-repeat history is not part of the MVP.
- If a user changes the list while a draw is in progress, the result must come from the eligible list at the moment the draw is performed.
- The pick should be presented as the result of a completed selection, not as a guarantee that the restaurant is open or available.

### 5.7 Persistence and reset

- Save the list and exclusion state in browser storage on the current device.
- Restore saved data when the app is reopened in the same browser profile.
- When opened from a private family invitation link, load and save the shared list in the configured SQLite-backed API instead of the local list.
- Allow the owner to create a shared family list from the current local list and copy an invitation link.
- Keep the invitation token in the URL fragment and send it to the data service in a request header; never put it in a server request URL.
- Check for remote list updates while a shared list is open and apply newer saved revisions.
- Detect concurrent changes and ask users to choose between the latest family version and their pending version; do not silently overwrite a newer list.
- Show a clear connection or save error if the shared service is unavailable.
- Show a clear error if data cannot be saved; do not imply that unsaved changes are persistent.
- Provide a “Clear all restaurants” action with explicit confirmation.
- Clearing data removes all restaurant entries and returns the app to its empty state.
- If stored data is missing or malformed, recover to a usable empty state and inform the user that the saved list could not be loaded. Do not crash or silently present corrupted entries as valid.

### 5.8 Result actions

- After a pick, allow the user to draw again.
- Allow the user to close or dismiss the result and return to the list.
- Do not require the user to accept the pick before drawing again.
- The result view must not hide the controls needed to manage the list.

## 6. User experience and screens

### Main screen

The main screen contains:

- App name and a short explanation of the purpose.
- A prominent “Pick a restaurant” button.
- An eligible restaurant count, such as “4 restaurants included.”
- The restaurant list and each entry’s include/exclude control.
- Add, edit, and remove actions.
- Include-all, exclude-all, and clear-all list actions, placed so destructive actions are not easily triggered accidentally.

### Add/edit form

- Name field (required) and note field (optional).
- Save and cancel actions.
- Inline, accessible validation messages.
- Preserve entered values when validation fails.

### Pick result

- The chosen restaurant name is the primary visual focus.
- Show the optional note if supplied.
- Provide “Pick again” and “Back to list” actions.
- Explain that selection is random from included restaurants if the context needs clarification.

### Empty and unavailable states

- **No restaurants saved:** Explain how to add the first restaurant; draw is disabled.
- **Restaurants saved, none included:** Explain how to include at least one; draw is disabled.
- **Storage unavailable:** Explain that changes may not persist and, where possible, allow the user to continue for the current session.

## 7. Data model

Each restaurant is represented by:

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | String | Yes | Unique and stable for the entry |
| `name` | String | Yes | Trimmed; 1–100 characters |
| `note` | String | No | Trimmed; up to 500 characters |
| `included` | Boolean | Yes | Defaults to `true` |
| `createdAt` | Timestamp | Yes | Set when created |
| `updatedAt` | Timestamp | Yes | Updated when the entry is edited |

The persisted list should include a schema/version marker so future releases can migrate stored data safely.

## 8. Business rules and edge cases

- The eligible count is the number of saved restaurants whose `included` value is `true`.
- Duplicate matching uses the normalized name (trimmed and case-insensitive); optional notes do not affect duplicate matching.
- The user may include or exclude any entry independently.
- Bulk include/exclude actions affect all saved entries and are safe to repeat.
- A draw is only possible when the eligible count is greater than zero.
- A draw chooses exactly one eligible entry, including when there is only one.
- No selection history or weighting is applied in the MVP.
- Invalid or unsupported persisted records must not break access to valid app controls.
- The UI must not claim to verify restaurant details, hours, distance, or availability.

## 9. Accessibility and usability

- All features must be usable with a keyboard.
- Controls must have descriptive accessible names; icon-only controls need an accessible label.
- Use semantic headings, buttons, form labels, and list markup.
- Provide visible keyboard focus indicators.
- Do not communicate included/excluded state by color alone; include text, an icon with a label, or another non-color cue.
- Validation and status messages must be programmatically associated with their fields or announced to assistive technology.
- Maintain readable contrast and support browser zoom/reflow on narrow screens.
- The result must be announced to assistive technology when a pick completes, without unexpectedly moving keyboard focus.
- Respect reduced-motion preferences; animation is optional and must not delay access to the result.

## 10. Privacy and security

- The app does not require personally identifying information or an account.
- A local list stays in browser storage on the user’s device. A family list is sent to the configured API and stored in its SQLite database.
- Anyone with a family invitation link can read and modify that shared list; the UI and setup instructions must say so.
- Store only a hash of the invitation secret in the database. Require the secret for list reads and writes, and never expose it in API query strings.
- Keep the invitation token in the URL fragment, which is not sent as part of the page request, and do not expose it in API query strings.
- Explain that clearing browser/site data can remove a local list and that local lists do not synchronize between devices.
- Render restaurant names and notes as text, not executable markup.
- Do not include analytics or third-party data collection in the MVP unless separately disclosed and approved.

## 11. Non-functional requirements

- Support current stable versions of major desktop and mobile browsers.
- Render a usable main screen promptly on a typical broadband or mobile connection.
- Keep list operations and picking responsive for at least 500 restaurants.
- A draw should complete without a network request.
- Maintain data integrity across normal app reloads and browser restarts.
- Handle storage errors and invalid stored data with a recoverable, user-visible message.
- Use responsive layouts that work from narrow phone screens to desktop widths.

## 12. Acceptance criteria

1. A first-time user sees instructions and can add a valid restaurant.
2. Blank and whitespace-only names are rejected with a clear validation message.
3. Names longer than 100 characters and notes longer than 500 characters are rejected.
4. Duplicate names that differ only by casing or surrounding whitespace are not silently added.
5. Adding an entry increases the eligible count by one and makes it available to the next draw.
6. Excluding an entry removes it from the eligible count and it cannot be selected.
7. Including an entry makes it eligible again.
8. A draw with at least one eligible restaurant returns exactly one eligible restaurant.
9. A draw with no eligible restaurants cannot run and explains how to resolve the state.
10. A draw with one eligible restaurant returns that restaurant.
11. Repeated draws with at least two eligible restaurants never return the immediately previous pick.
12. Editing a restaurant preserves its included/excluded state.
13. Removing a restaurant updates the list and count after the user confirms or can undo.
14. Saved local entries and inclusion states survive a normal reload in the same browser profile.
15. A configured private family link opens the same restaurant list on another device and saves changes to the shared database.
16. A concurrent update is detected and resolved with an explicit choice, not a silent overwrite.
17. A local or shared storage failure is surfaced to the user instead of being reported as a successful save.
18. The main flow (add, include/exclude, draw, edit, remove) works with keyboard-only input and assistive-technology labels.
19. The application remains usable at mobile widths and with browser zoom.

## 13. Future considerations (not MVP commitments)

- Named lists for different occasions or groups.
- Multiple named shared lists and account-based access.
- Optional cuisine, price range, distance, tags, and dietary filters.
- Recent-pick history and controls to avoid immediate repeats.
- Import/export and backup of the restaurant list.
- Map or restaurant-directory integrations, subject to privacy and data-provider requirements.
