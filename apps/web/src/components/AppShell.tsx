import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import type { Project } from "../types";
import { Sidebar } from "./Sidebar";
import { BrandLogo } from "./BrandLogo";
import { AiChatPopup } from "./AiChatPopup";
import { CommandPalette } from "./CommandPalette";
import { registerAeokitWebMcpTools } from "../webmcp";

export function AppShell({
  children,
  project,
  projects,
  archivedProjects,
  onProjectChange,
  accountControls,
  projectBasePath,
  appBasePath = "",
  hosted = false,
}: {
  children: ReactNode;
  project: Project;
  projects: Project[];
  archivedProjects: Project[];
  onProjectChange: (projectId: string) => void;
  accountControls?: ReactNode;
  projectBasePath: string;
  appBasePath?: string;
  hosted?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(
    () => registerAeokitWebMcpTools(undefined, project.id),
    [project.id],
  );
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  return (
    <div className="flex h-[100dvh] bg-base-200">
      <div className="hidden shrink-0 md:block">
        <Sidebar
          project={project}
          projects={projects}
          archivedProjects={archivedProjects}
          onProjectChange={onProjectChange}
          accountControls={accountControls}
          projectBasePath={projectBasePath}
          appBasePath={appBasePath}
          hosted={hosted}
          onSearchOpen={() => setSearchOpen(true)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 md:hidden">
          <button
            type="button"
            className="btn btn-square btn-ghost min-h-11 min-w-11"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="size-5" />
          </button>
          <BrandLogo className="ml-1 h-6" priority />
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:pt-2">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-100 md:rounded-tl-lg md:border-l md:border-t md:border-base-300">
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </main>
        </div>
      </div>
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full shadow-xl">
            <Sidebar
              project={project}
              projects={projects}
              archivedProjects={archivedProjects}
              onProjectChange={onProjectChange}
              accountControls={accountControls}
              projectBasePath={projectBasePath}
              appBasePath={appBasePath}
              hosted={hosted}
              onSearchOpen={() => setSearchOpen(true)}
              onNavigate={() => setDrawerOpen(false)}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}
      <AiChatPopup project={project} appBasePath={projectBasePath} />
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projectBasePath={projectBasePath}
      />
    </div>
  );
}
