import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Archive,
  ArchiveRestore,
  BookOpenText,
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronsUpDown,
  Clock3,
  ExternalLink,
  FileQuestion,
  Gauge,
  Inbox,
  FlaskConical,
  LayoutGrid,
  Link2,
  MessageCircle,
  MousePointerClick,
  Plus,
  Search,
  Settings,
  UserRound,
  UsersRound,
  Swords,
  X,
} from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type { Project } from "../types";
import { appPath } from "../app-routing";
import { AiChatSidebarPanel } from "./AiChatSidebarPanel";
import { BrandLogo } from "./BrandLogo";
import { Modal } from "./Modal";
import { ErrorState } from "./ui";
import { DOCUMENTATION_URL } from "../public-links";

const groups = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: Gauge },
      { to: "/opportunities", label: "Opportunities", icon: Inbox },
      { to: "/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    label: "Tracking",
    items: [
      { to: "/visibility", label: "Visibility", icon: ChartNoAxesCombined },
      { to: "/prompts", label: "Prompts", icon: FileQuestion },
      { to: "/share-of-voice", label: "Share of Voice", icon: BarChart3 },
      { to: "/citations", label: "Citations", icon: Link2 },
      {
        to: "/ai-referrals",
        label: "AI Outcomes",
        icon: MousePointerClick,
      },
      { to: "/crawler-traffic", label: "Crawler Traffic", icon: Bot },
      { to: "/runs", label: "Run History", icon: Clock3 },
    ],
  },
  {
    label: "Configure",
    items: [{ to: "/competitors", label: "Competitors", icon: Swords }],
  },
] as const;

const PROJECT_SEARCH_THRESHOLD = 8;

function projectDomain(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function ProjectSwitcher({
  project,
  projects,
  archivedProjects,
  settingsPath,
  onProjectChange,
  onNavigate,
  onAdd,
  onViewArchived,
}: {
  project: Project;
  projects: Project[];
  archivedProjects: Project[];
  settingsPath: string;
  onProjectChange: (projectId: string) => void;
  onNavigate?: (() => void) | undefined;
  onAdd: () => void;
  onViewArchived: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = projects.length >= PROJECT_SEARCH_THRESHOLD;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = normalizedQuery
    ? projects.filter((item) => {
        const domain = projectDomain(item.website).toLowerCase();
        return (
          item.name.toLowerCase().includes(normalizedQuery) ||
          domain.includes(normalizedQuery)
        );
      })
    : projects;

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  };

  const selectProject = (projectId: string) => {
    close();
    if (projectId !== project.id) onProjectChange(projectId);
    onNavigate?.();
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        close();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !showSearch) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    searchRef.current?.focus();
  }, [open, showSearch]);

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) =>
        Math.max(0, Math.min(filteredProjects.length - 1, current + delta)),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredProjects[highlightedIndex];
      if (selected) selectProject(selected.id);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex items-stretch rounded-lg border border-base-300 bg-base-100">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Switch brand"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
            setHighlightedIndex(0);
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg px-3 py-1.5 text-left transition-colors hover:bg-base-200"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-base-content">
              {project.name}
            </span>
            <span className="truncate text-xs font-normal text-base-content/50">
              {projectDomain(project.website)}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-base-content/40" />
        </button>
        <NavLink
          to={settingsPath}
          aria-label="Brand settings"
          title="Brand settings"
          onClick={() => {
            close();
            onNavigate?.();
          }}
          className="flex shrink-0 items-center justify-center rounded-r-lg border-l border-base-300 px-2.5 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
        >
          <Settings className="size-4" />
        </NavLink>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg">
          {showSearch ? (
            <div className="border-b border-base-300 p-2">
              <label className="input input-sm w-full">
                <Search className="size-3.5 shrink-0 text-base-content/40" />
                <input
                  ref={searchRef}
                  value={query}
                  aria-label="Filter brands"
                  aria-controls="brand-switcher-listbox"
                  placeholder="Find brand…"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleListKeyDown}
                />
              </label>
            </div>
          ) : null}
          <ul
            id="brand-switcher-listbox"
            role="listbox"
            aria-label="Brands"
            className="menu max-h-[min(60vh,21rem)] w-full flex-nowrap overflow-y-auto p-2"
            onKeyDown={handleListKeyDown}
          >
            {filteredProjects.map((item, index) => {
              const active = item.id === project.id;
              const highlighted = showSearch && index === highlightedIndex;
              return (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={
                      active ? "active" : highlighted ? "bg-base-200" : ""
                    }
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectProject(item.id)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.name}</span>
                      <span className="truncate text-xs text-base-content/50">
                        {projectDomain(item.website)}
                      </span>
                    </span>
                    {active ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
            {filteredProjects.length === 0 ? (
              <li className="menu-disabled">
                <span className="text-base-content/50">
                  No brands match “{query.trim()}”
                </span>
              </li>
            ) : null}
          </ul>
          <ul className="menu w-full border-t border-base-300 p-2">
            <li>
              <button
                type="button"
                aria-label="Add brand project"
                onClick={() => {
                  close();
                  onAdd();
                }}
              >
                <Plus className="size-4" />
                New brand
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  close();
                  onViewArchived();
                }}
              >
                <Archive className="size-4" />
                Archived brands
                {archivedProjects.length > 0 ? (
                  <span className="ml-auto text-xs text-base-content/50">
                    {archivedProjects.length}
                  </span>
                ) : null}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
  end = false,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onNavigate?: (() => void) | undefined;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-base-100 font-medium text-base-content shadow-sm"
            : "text-base-content/70 hover:bg-base-300/30 hover:text-base-content"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r-full bg-primary" />
          ) : null}
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({
  project,
  projects,
  archivedProjects = [],
  onProjectChange,
  onNavigate,
  onClose,
  onSearchOpen,
  accountControls,
  projectBasePath,
  appBasePath = "",
  hosted = false,
}: {
  project: Project;
  projects: Project[];
  archivedProjects?: Project[];
  onProjectChange: (projectId: string) => void;
  onNavigate?: () => void;
  onClose?: () => void;
  onSearchOpen?: () => void;
  accountControls?: ReactNode;
  projectBasePath?: string;
  appBasePath?: string;
  hosted?: boolean;
}) {
  const prefix = projectBasePath ?? (hosted ? appBasePath : "");
  const location = useLocation();
  const navigate = useNavigate();
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [archivedProjectsOpen, setArchivedProjectsOpen] = useState(false);
  const chatPath = appPath(prefix, "/chat");
  const chatActive = location.pathname === chatPath;

  const openBrowse = () => {
    navigate(appPath(prefix));
    onNavigate?.();
  };

  const openChat = () => {
    navigate(chatPath);
    onNavigate?.();
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-base-200">
      <div className="flex min-h-14 items-center justify-between px-4 py-3">
        <NavLink
          to={appPath(prefix)}
          className="flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="aeokit home"
        >
          <BrandLogo className="h-6" priority />
        </NavLink>
        {onClose ? (
          <button
            type="button"
            className="btn btn-ghost btn-circle min-h-11 min-w-11"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <div className="px-3 pb-1">
        <ProjectSwitcher
          project={project}
          projects={projects}
          archivedProjects={archivedProjects}
          settingsPath={appPath(prefix, "/settings")}
          onProjectChange={onProjectChange}
          onNavigate={onNavigate}
          onAdd={() => setAddProjectOpen(true)}
          onViewArchived={() => setArchivedProjectsOpen(true)}
        />
      </div>

      <div className="px-3 pb-1 pt-1">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-base-content/55 hover:border-base-content/20 hover:text-base-content"
          aria-label="Search navigation"
          onClick={onSearchOpen}
        >
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto text-xs text-base-content/35">⌘K</kbd>
        </button>
      </div>

      <div className="px-3 pb-1">
        <div role="tablist" className="tabs tabs-border w-full">
          <SidebarViewTab
            icon={LayoutGrid}
            label="Browse"
            active={!chatActive}
            onClick={openBrowse}
          />
          <SidebarViewTab
            icon={MessageCircle}
            label="AI Chat"
            active={chatActive}
            onClick={openChat}
          />
        </div>
      </div>

      {chatActive ? (
        <AiChatSidebarPanel
          project={project}
          appBasePath={prefix}
          onNavigate={onNavigate}
        />
      ) : (
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="mb-1">
            <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-base-content/40">
              Workspace
            </div>
            <NavItem
              to={appPath(appBasePath, "/run-monitor")}
              label="Run Monitor"
              icon={Clock3}
              onNavigate={onNavigate}
            />
          </div>
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-base-content/40">
                {group.label}
              </div>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  to={`${prefix}${item.to === "/" ? "" : item.to}` || "/"}
                  end={item.to === "/"}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
          {hosted ? (
            <div className="mb-1">
              <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-base-content/40">
                Workspace
              </div>
              <NavItem
                to={appPath(appBasePath, "/workspace")}
                label="Workspace"
                icon={UsersRound}
                onNavigate={onNavigate}
              />
              <NavItem
                to={appPath(appBasePath, "/account")}
                label="Account"
                icon={UserRound}
                onNavigate={onNavigate}
              />
            </div>
          ) : null}
        </nav>
      )}

      <div className="shrink-0 border-t border-base-300 px-2 py-2 pb-safe">
        {accountControls}
        <a
          href={DOCUMENTATION_URL}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-base-content/70 transition-colors hover:bg-base-300/30 hover:text-base-content"
        >
          <BookOpenText className="size-4" />
          Documentation
          <ExternalLink className="ml-auto size-3" />
        </a>
      </div>
      {addProjectOpen ? (
        <AddProjectModal
          open
          onClose={() => setAddProjectOpen(false)}
          onCreated={(createdProject) => {
            setAddProjectOpen(false);
            onProjectChange(createdProject.id);
            onNavigate?.();
          }}
        />
      ) : null}
      {archivedProjectsOpen ? (
        <ArchivedBrandsModal
          open
          projects={archivedProjects}
          onClose={() => setArchivedProjectsOpen(false)}
          onRestored={(projectId) => {
            setArchivedProjectsOpen(false);
            onProjectChange(projectId);
            onNavigate?.();
          }}
        />
      ) : null}
    </aside>
  );
}

export function ArchivedBrandsModal({
  open,
  projects,
  onClose,
  onRestored,
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onRestored: (projectId: string) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (projectId: string) =>
      api<{ project: Project }>(`/projects/${projectId}/unarchive`, {
        method: "POST",
      }),
    onSuccess: async ({ project }) => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryKey("projects"),
      });
      onRestored(project.id);
    },
  });

  return (
    <Modal
      open={open}
      title="Archived brands"
      description="Archived brands keep their history and can be restored at any time."
      onClose={onClose}
    >
      <div className="space-y-3 p-5">
        {projects.length ? (
          projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-base-300 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="truncate text-xs text-base-content/50">
                  {project.website}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(project.id)}
              >
                <ArchiveRestore className="size-4" />
                Restore brand
              </button>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-base-content/55">
            No archived brands.
          </p>
        )}
        {mutation.isError ? (
          <ErrorState message={(mutation.error as Error).message} />
        ) : null}
      </div>
    </Modal>
  );
}

function AddProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api<{ project: Project }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim(),
          aliases: [],
          additionalDomains: [],
        }),
      }),
    onSuccess: ({ project }) => {
      queryClient.setQueryData<{ projects: Project[] }>(
        tenantQueryKey("projects"),
        (current) => ({
          projects: [
            project,
            ...(current?.projects.filter((item) => item.id !== project.id) ??
              []),
          ],
        }),
      );
      setName("");
      setWebsite("");
      onCreated(project);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      title="Add brand"
      description="Create another project in this workspace. Its tracking data and settings stay separate."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Brand name</legend>
          <input
            autoFocus
            className="input w-full border-base-300"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme"
            required
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Website</legend>
          <input
            className="input w-full border-base-300"
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://acme.com"
            required
          />
        </fieldset>
        {mutation.isError ? (
          <ErrorState message={(mutation.error as Error).message} />
        ) : null}
        <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!name.trim() || !website.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create brand"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SidebarViewTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`tab flex-1 gap-1.5 ${active ? "tab-active" : ""}`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
