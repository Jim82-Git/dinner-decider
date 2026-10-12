# Dinner Decider

A lightweight restaurant picker. Add your favorite places, choose which ones are included, and let Dinner Decider pick tonight's plan.

## Use it online

After deployment, open [Dinner Decider on GitHub Pages](https://jim82-git.github.io/dinner-decider/). You can share that link with your family.

The main site keeps a separate list in each browser. To store one list for the whole family, deploy the SQLite API and create a private family invitation link; see [SETUP.md](./SETUP.md).

## Publish updates

GitHub Actions deploys the site whenever changes are pushed to `main`. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.

## Run it locally

Open `index.html` in a modern browser. No install, build step, account, or server is required.

Without a family invitation link, your restaurant list is stored only in browser storage on this device.

GitHub Pages only hosts the frontend. Family sharing requires a separately hosted SQLite API with persistent disk storage; follow [SETUP.md](./SETUP.md) before enabling the share button.

See [SPEC.md](./SPEC.md) for the complete product requirements and acceptance criteria.
