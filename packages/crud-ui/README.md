# `@aeokit/crud-ui`

A framework-independent CRUD and API-operation UI generated at runtime from an
Aeokit OpenAPI document. The package contains no identity, tenant, billing, or
deployment logic; a host such as `aeokit-cloud` supplies those concerns.

```ts
import { mountCrudUi } from "@aeokit/crud-ui";
import "@aeokit/crud-ui/styles.css";

const unmount = await mountCrudUi(document.querySelector("#api")!, {
  apiBaseUrl: "https://cloud.aeokit.dev",
  openApiUrl: "https://cloud.aeokit.dev/openapi.json",
  // The hosted shell owns credentials and can refresh them for every request.
  headers: async () => ({ Authorization: `Bearer ${await getApiToken()}` }),
});
```

The UI discovers all OpenAPI operations whenever it mounts. Path and query
parameters become inputs. JSON object properties become typed fields when the
contract describes them; underspecified bodies remain usable through a JSON
editor. DELETE operations require confirmation by default.

For polished generated forms, API operations should publish complete request
and response schemas, including required properties, formats, enums, and
descriptions. Product-specific workflows can replace individual generated
screens in the host application.
