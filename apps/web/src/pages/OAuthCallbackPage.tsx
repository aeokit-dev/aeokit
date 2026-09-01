import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Link2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import { appPath } from "../app-routing";
import { ErrorState, LoadingBlock, PageHeader } from "../components/ui";

export function OAuthCallbackPage({ appBasePath }: { appBasePath: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const parameters = new URLSearchParams(location.search);
  const code = parameters.get("code");
  const state = parameters.get("state");
  const providerError =
    parameters.get("error_description") ?? parameters.get("error");
  const mutation = useMutation({
    mutationFn: () =>
      api<{ provider: "posthog" | "cloudflare"; projectId: string }>(
        "/integrations/oauth/callback",
        {
          method: "POST",
          body: JSON.stringify({ code, state }),
        },
      ),
  });

  useEffect(() => {
    if (started.current || providerError || !code || !state) return;
    started.current = true;
    mutation.mutate();
  }, [code, mutation, providerError, state]);

  useEffect(() => {
    if (!mutation.data) return;
    void queryClient.invalidateQueries({
      queryKey: tenantQueryKey("integrations", mutation.data.projectId),
    });
    navigate(
      `${appPath(appBasePath, "/settings")}?connected=${mutation.data.provider}`,
      { replace: true },
    );
  }, [appBasePath, mutation.data, navigate, queryClient]);

  const invalidCallback = !providerError && (!code || !state);
  return (
    <div className="page-shell">
      <PageHeader
        title="Connecting integration"
        description="Completing the secure authorization handshake."
      />
      <section className="data-panel p-6">
        {providerError || invalidCallback || mutation.isError ? (
          <div className="space-y-4">
            <ErrorState
              message={
                providerError ??
                (invalidCallback
                  ? "The authorization response is incomplete."
                  : (mutation.error as Error).message)
              }
            />
            <Link className="btn btn-sm" to={appPath(appBasePath, "/settings")}>
              Back to Settings
            </Link>
          </div>
        ) : mutation.isSuccess ? (
          <div className="flex min-h-36 flex-col items-center justify-center text-center">
            <span className="rounded-full bg-success/15 p-3 text-success">
              <Check className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium">Connected successfully</p>
          </div>
        ) : (
          <div className="flex min-h-36 items-center gap-4">
            <span className="rounded-full bg-primary/10 p-3 text-primary">
              <Link2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Saving your connection…</p>
              <LoadingBlock className="mt-3 h-2" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
