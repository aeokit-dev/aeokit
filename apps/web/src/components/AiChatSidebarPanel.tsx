import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import { appPath } from "../app-routing";
import type { AiChatSession, Project } from "../types";

function ageLabel(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AiChatSidebarPanel({
  project,
  appBasePath,
  onNavigate,
}: {
  project: Project;
  appBasePath: string;
  onNavigate?: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSessionId = new URLSearchParams(location.search).get("session");
  const chatPath = appPath(appBasePath, "/chat");
  const sessionsKey = tenantQueryKey("ai-chat-sessions", project.id);
  const sessionsQuery = useQuery({
    queryKey: sessionsKey,
    queryFn: () =>
      api<{ sessions: AiChatSession[] }>(
        `/projects/${project.id}/ai-chat/sessions`,
      ),
  });
  const sessions = sessionsQuery.data?.sessions ?? [];

  const goToSession = (sessionId?: string) => {
    navigate(
      sessionId
        ? `${chatPath}?session=${encodeURIComponent(sessionId)}`
        : chatPath,
    );
    onNavigate?.();
  };

  const createSession = useMutation({
    mutationFn: () =>
      api<{ session: AiChatSession }>(
        `/projects/${project.id}/ai-chat/sessions`,
        { method: "POST" },
      ),
    onSuccess: ({ session }) => {
      queryClient.setQueryData<{ sessions: AiChatSession[] }>(
        sessionsKey,
        (current) => ({
          sessions: [
            session,
            ...(current?.sessions ?? []).filter(
              (item) => item.id !== session.id,
            ),
          ],
        }),
      );
      void queryClient.invalidateQueries({ queryKey: sessionsKey });
      goToSession(session.id);
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: string) =>
      api(`/ai-chat/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: (_result, sessionId) => {
      queryClient.setQueryData<{ sessions: AiChatSession[] }>(
        sessionsKey,
        (current) => ({
          sessions: (current?.sessions ?? []).filter(
            (session) => session.id !== sessionId,
          ),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: sessionsKey });
      if (sessionId === activeSessionId) {
        goToSession(sessions.find((session) => session.id !== sessionId)?.id);
      }
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-block justify-start gap-2 font-normal text-base-content/70 hover:text-base-content"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
        >
          {createSession.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {sessionsQuery.isPending ? (
          <div className="flex justify-center py-6 text-base-content/50">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : sessionsQuery.isError ? (
          <p className="px-2 py-6 text-center text-xs text-error">
            Could not load chats.
          </p>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-base-content/50">
            No chats yet. Start a new one.
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`group flex items-center gap-1 rounded-md px-1 ${
                  isActive ? "bg-base-300/50" : "hover:bg-base-300/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToSession(session.id)}
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-base-content/80"
                >
                  {session.title}
                </button>
                <span className="shrink-0 text-xs text-base-content/40 group-hover:hidden">
                  {ageLabel(session.updatedAt)}
                </span>
                <button
                  type="button"
                  aria-label="Delete chat"
                  className="btn btn-ghost btn-xs btn-square hidden group-hover:inline-flex"
                  disabled={deleteSession.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${session.title}” and its message history?`,
                      )
                    ) {
                      deleteSession.mutate(session.id);
                    }
                  }}
                >
                  <Trash2 className="size-3.5 text-base-content/50" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="mx-2 mb-2 rounded-lg border border-base-300 bg-base-100 p-3">
        <span className="badge badge-primary badge-sm">Beta</span>
        <p className="mt-1.5 text-xs leading-5 text-base-content/65">
          AI Chat uses OpenRouter and the current project’s tracked prompts and
          recent run results.
        </p>
      </div>
    </div>
  );
}
