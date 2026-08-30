# Repository Instructions

## Definition of done

- Do not describe work as fixed, finished, or production-ready until verification is complete.
- Add a regression test that reproduces the observed failure before implementing its fix.
- For external APIs, base fixtures on the actual observed production response shape, including wrappers and encoded fields.
- Before deployment, run the relevant targeted tests, the full test suite, type checks, formatting checks, and the production build.
- After deployment, verify service health and the affected user-visible behavior. A successful deploy alone is not verification.
- If live verification would spend money or mutate production data, state that explicitly and obtain approval. Until then, report the change as deployed but not end-to-end verified.
- Keep the task open when any required check fails. Report the failing check and continue until it passes or a real blocker requires user input.

## Local development

- Run the local application with Docker Compose so it reuses the persistent PostgreSQL dataset in the `openaeo_openaeo_postgres` volume.
- Use `docker compose -p openaeo up -d --build app` to rebuild the current app and apply migrations without restarting the provider worker unless worker changes specifically need verification.
- Review runtime metadata at `http://localhost:3000/`, OpenAPI docs at `http://localhost:3000/docs`, and health at `http://localhost:3000/api/health`.
- Docker Compose publishes the unauthenticated app and PostgreSQL ports on `127.0.0.1` only. Do not broaden those bindings without adding an authenticated access boundary.

## Hosted deployment boundary

- Hosted UI, identity, API-key issuance, multitenancy, and Cloudflare deployment code belong in the private `aeokit-dev/aeokit-cloud` repository.
- Do not add hosted credentials, private production configuration, or control-plane UI code to this repository.
