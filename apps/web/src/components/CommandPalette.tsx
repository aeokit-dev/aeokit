import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { appPath } from "../app-routing";

const destinations = [
  ["Dashboard", ""],
  ["Opportunities", "/opportunities"],
  ["Visibility", "/visibility"],
  ["Prompts", "/prompts"],
  ["Share of Voice", "/share-of-voice"],
  ["Citations", "/citations"],
  ["AI Outcomes", "/ai-referrals"],
  ["Crawler Traffic", "/crawler-traffic"],
  ["Run History", "/runs"],
  ["Competitors", "/competitors"],
  ["Settings", "/settings"],
] as const;

export function CommandPalette({
  open,
  onClose,
  projectBasePath,
}: {
  open: boolean;
  onClose: () => void;
  projectBasePath: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? destinations.filter(([label]) =>
          label.toLowerCase().includes(normalized),
        )
      : destinations;
  }, [query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close navigation search"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search navigation"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-base-300 px-4">
          <Search className="size-4 text-base-content/45" />
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search pages…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && results[0]) {
                navigate(appPath(projectBasePath, results[0][1]));
                onClose();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm"
            aria-label="Close search"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {results.map(([label, path]) => (
            <button
              key={path}
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-base-200"
              onClick={() => {
                navigate(appPath(projectBasePath, path));
                onClose();
              }}
            >
              <span>{label}</span>
              <span className="text-xs text-base-content/35">Go to</span>
            </button>
          ))}
          {!results.length ? (
            <p className="px-3 py-8 text-center text-sm text-base-content/45">
              No matching pages
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
