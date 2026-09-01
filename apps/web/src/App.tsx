import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { RuntimeConfig } from "./types";
import { FullPageLoading, ProductApplication } from "./ProductApplication";
import { ErrorState } from "./components/ui";

export function App() {
  const config = useQuery({
    queryKey: ["runtime-config"],
    queryFn: () => api<RuntimeConfig>("/config"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (config.isPending) return <FullPageLoading />;
  if (config.isError) {
    return (
      <div className="grid h-full place-items-center bg-base-200 p-6">
        <ErrorState
          message={`Could not reach the aeokit API. ${config.error.message}`}
        />
      </div>
    );
  }
  return <ProductApplication config={config.data} />;
}
