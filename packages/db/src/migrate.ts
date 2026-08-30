import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { closeDatabase, sql } from "./client";

const migrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

await sql`
  create table if not exists openaeo_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

const applied = new Set(
  (await sql<{ name: string }[]>`select name from openaeo_migrations`).map(
    (row) => row.name,
  ),
);

for (const name of (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort()) {
  if (applied.has(name)) continue;
  const migration = await readFile(join(migrationDirectory, name), "utf8");
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration);
    await transaction`insert into openaeo_migrations (name) values (${name})`;
  });
  console.log(`Applied ${name}`);
}

await closeDatabase();
