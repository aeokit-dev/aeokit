import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api, tenantQueryKey } from "./api";
import type { Project, RuntimeConfig } from "./types";
import { AppShell } from "./components/AppShell";
import { BrandMark } from "./components/BrandLogo";
import { ErrorState } from "./components/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { VisibilityPage } from "./pages/VisibilityPage";
import { PromptsPage } from "./pages/PromptsPage";
import { ShareOfVoicePage } from "./pages/ShareOfVoicePage";
import { CitationsPage } from "./pages/CitationsPage";
import { AiReferralsPage } from "./pages/AiReferralsPage";
import { AiChatPage } from "./pages/AiChatPage";
import { CrawlerTrafficPage } from "./pages/CrawlerTrafficPage";
import { RunsPage } from "./pages/RunsPage";
import { RunMonitorPage } from "./pages/RunMonitorPage";
import { CompetitorsPage } from "./pages/CompetitorsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import {
  brandAppPath,
  brandIdFromPath,
  brandPagePath,
  promptOnboardingPath,
} from "./app-routing";

const ACTIVE_PROJECT_KEY = "aeokit.activeProject";

export function ProductApplication({
  config,
  organizationId,
  appBasePath = "",
  hosted = false,
  accountControls,
  showProviderCosts = config.showProviderCosts ?? true,
  renderSettings,
  additionalRoutes,
}: {
  config: RuntimeConfig;
  organizationId?: string;
  appBasePath?: string;
  hosted?: boolean;
  accountControls?: ReactNode;
  showProviderCosts?: boolean;
  renderSettings?: (project: Project) => ReactNode;
  additionalRoutes?: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const projectsQuery = useQuery({
    queryKey: tenantQueryKey("projects"),
    queryFn: () => api<{ projects: Project[] }>("/projects"),
  });
  const allProjects = projectsQuery.data?.projects ?? [];
  const projects = allProjects.filter((item) => !item.archivedAt);
  const archivedProjects = allProjects.filter((item) => item.archivedAt);
  const storageKey = organizationId
    ? `${ACTIVE_PROJECT_KEY}.${organizationId}`
    : ACTIVE_PROJECT_KEY;
  const [activeId, setActiveId] = useState(() =>
    localStorage.getItem(storageKey),
  );
  const routeProjectId = brandIdFromPath(appBasePath, location.pathname);
  const project =
    projects.find((item) => item.id === routeProjectId) ??
    projects.find((item) => item.id === activeId) ??
    projects[0];

  useEffect(() => {
    if (!project) return;
    setActiveId(project.id);
    localStorage.setItem(storageKey, project.id);
    const relativePath = location.pathname.slice(appBasePath.length) || "/";
    if (
      !routeProjectId &&
      !relativePath.startsWith("/run-monitor") &&
      !relativePath.startsWith("/account") &&
      !relativePath.startsWith("/workspace") &&
      !relativePath.startsWith("/oauth/callback")
    ) {
      navigate(brandAppPath(appBasePath, project.id), { replace: true });
    }
  }, [
    appBasePath,
    location.pathname,
    navigate,
    project,
    routeProjectId,
    storageKey,
  ]);

  if (projectsQuery.isPending) return <FullPageLoading />;
  if (projectsQuery.isError) return <FatalError error={projectsQuery.error} />;
  if (!project)
    return (
      <SetupPage
        archivedProjects={archivedProjects}
        appBasePath={appBasePath}
        accountControls={accountControls}
      />
    );
  const base = brandAppPath(appBasePath, project.id);
  return (
    <AppShell
      project={project}
      projects={projects}
      archivedProjects={archivedProjects}
      projectBasePath={base}
      appBasePath={appBasePath}
      hosted={hosted}
      accountControls={accountControls}
      onProjectChange={(projectId) => {
        setActiveId(projectId);
        localStorage.setItem(storageKey, projectId);
        navigate(
          brandAppPath(
            appBasePath,
            projectId,
            brandPagePath(appBasePath, location.pathname),
          ),
        );
      }}
    >
      <Routes>
        <Route
          path="run-monitor"
          element={
            <RunMonitorPage
              projects={projects}
              appBasePath={appBasePath}
              showProviderCosts={showProviderCosts}
            />
          }
        />
        <Route
          path="brands/:brandId"
          element={
            <DashboardPage
              project={project}
              showProviderCosts={showProviderCosts}
            />
          }
        />
        <Route
          path="brands/:brandId/visibility"
          element={<VisibilityPage project={project} />}
        />
        <Route
          path="brands/:brandId/opportunities"
          element={<OpportunitiesPage project={project} />}
        />
        <Route
          path="brands/:brandId/experiments"
          element={<ExperimentsPage project={project} />}
        />
        <Route
          path="brands/:brandId/prompts"
          element={<PromptsPage project={project} />}
        />
        <Route
          path="brands/:brandId/share-of-voice"
          element={<ShareOfVoicePage project={project} />}
        />
        <Route
          path="brands/:brandId/citations"
          element={<CitationsPage project={project} />}
        />
        <Route
          path="brands/:brandId/ai-referrals"
          element={<AiReferralsPage project={project} />}
        />
        <Route
          path="brands/:brandId/chat"
          element={<AiChatPage project={project} appBasePath={base} />}
        />
        <Route
          path="brands/:brandId/crawler-traffic"
          element={<CrawlerTrafficPage project={project} />}
        />
        <Route
          path="brands/:brandId/runs"
          element={
            <RunsPage project={project} showProviderCosts={showProviderCosts} />
          }
        />
        <Route
          path="brands/:brandId/competitors"
          element={<CompetitorsPage project={project} projectBasePath={base} />}
        />
        <Route
          path="brands/:brandId/settings"
          element={
            renderSettings?.(project) ?? <SettingsPage project={project} />
          }
        />
        {additionalRoutes}
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </AppShell>
  );
}

function SetupPage({
  archivedProjects,
  appBasePath,
  accountControls,
}: {
  archivedProjects: Project[];
  appBasePath: string;
  accountControls?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<{ project: Project }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          website,
          aliases: [],
          additionalDomains: [],
        }),
      }),
    onSuccess: async ({ project }) => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryKey("projects"),
      });
      navigate(promptOnboardingPath(appBasePath, project.id));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <main className="grid min-h-full place-items-center bg-base-200 p-6">
      {accountControls ? (
        <div className="fixed right-4 top-3 z-10">{accountControls}</div>
      ) : null}
      <form
        className="w-full max-w-lg rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm"
        onSubmit={submit}
      >
        <BrandMark className="mb-4 size-12" />
        <h1 className="text-2xl font-semibold">Create your first brand</h1>
        <p className="mt-2 text-sm text-base-content/55">
          Start measuring how answer engines mention and cite your website.
        </p>
        <label className="fieldset mt-5">
          <span className="fieldset-legend">Brand name</span>
          <input
            className="input w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="fieldset mt-3">
          <span className="fieldset-legend">Website</span>
          <input
            className="input w-full"
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            required
          />
        </label>
        {create.isError ? (
          <ErrorState message={(create.error as Error).message} />
        ) : null}
        <button
          className="btn btn-primary mt-5 w-full"
          disabled={create.isPending}
        >
          {create.isPending ? (
            "Creating…"
          ) : (
            <>
              Create project <ArrowRight className="size-4" />
            </>
          )}
        </button>
        {archivedProjects.length ? (
          <p className="mt-4 text-xs text-base-content/45">
            {archivedProjects.length} archived project(s) remain available
            through the API.
          </p>
        ) : null}
      </form>
    </main>
  );
}

export function FullPageLoading() {
  return (
    <div className="grid h-full place-items-center bg-base-200" role="status">
      <BrandMark className="size-12 animate-pulse" />
      <span className="sr-only">Loading aeokit</span>
    </div>
  );
}

function FatalError({ error }: { error: Error }) {
  return (
    <div className="grid h-full place-items-center bg-base-200 p-6">
      <div className="w-full max-w-lg">
        <ErrorState
          message={`Could not reach the aeokit API. ${error.message}`}
        />
      </div>
    </div>
  );
}
