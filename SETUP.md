# Enable a shared family list

Dinner Decider can keep a shared restaurant list in Supabase and serve it from GitHub Pages. The Pages site is static; Supabase provides the small hosted database used by family links.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com/) and wait for it to finish provisioning.
2. In the project, open **SQL Editor**, create a query, paste in [`supabase-setup.sql`](./supabase-setup.sql), and run it.
3. Open **Project Settings → API**. Copy the **Project URL** and the public **anon** key.

Do not use or publish the `service_role` key. The anon key is designed to be public; row-level security in the SQL setup protects list data.

## 2. Configure and publish the app

Edit [`config.js`](./config.js) and fill in the project URL and anon key:

```js
window.DINNER_DECIDER_CONFIG = Object.freeze({
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-public-anon-key",
});
```

Commit and push `config.js` to `main`. GitHub Actions deploys the configured app to GitHub Pages.

## 3. Create and share your family list

1. Open the deployed Dinner Decider site.
2. Select **Share family list**. The app creates a private list and copies its invitation link.
3. Share that link with your family. Anyone with it can read and edit the list.

The invitation uses a randomly generated secret in the URL fragment. Keep the link private. To revoke it, delete that list's row from the `family_lists` table in Supabase. A new invitation creates a new list; it does not automatically copy the old list.

### Data and synchronization

- The shared restaurant list is stored in your Supabase project. It is not sent to GitHub.
- Each family member must open the same private invitation link. Opening the main site without that link continues to use that browser's separate local list.
- Shared list updates are checked approximately every 12 seconds. Saves are sent immediately.
- If two people save at the same time, the app asks which version to keep rather than silently overwriting one.
- Anyone with the private link can edit or clear the list. GitHub Pages does not provide account-based access control.
