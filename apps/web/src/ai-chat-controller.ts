import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, tenantQueryKey } from "./api";
import type {
  AiChatSendResponse,
  AiChatSession,
  AiChatUiAction,
  Project,
} from "./types";
import type { UiContext } from "./webmcp";

export function useAiChatController({
  project,
  sessionId,
  enabled = true,
  onSessionChange,
}: {
  project: Project;
  sessionId: string | null;
  enabled?: boolean;
  onSessionChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const sessionsKey = tenantQueryKey("ai-chat-sessions", project.id);
  const sessionsQuery = useQuery({
    queryKey: sessionsKey,
    queryFn: () =>
      api<{ sessions: AiChatSession[] }>(
        `/projects/${project.id}/ai-chat/sessions`,
      ),
    enabled,
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSessionId = sessionId ?? sessions[0]?.id ?? null;
  const messagesKey = tenantQueryKey("ai-chat-messages", activeSessionId);
  const messagesQuery = useQuery({
    queryKey: messagesKey,
    queryFn: () =>
      api<{ messages: import("./types").AiChatMessage[] }>(
        `/ai-chat/sessions/${activeSessionId}/messages`,
      ),
    enabled: enabled && Boolean(activeSessionId),
  });
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
      onSessionChange(session.id);
    },
  });
  const sendMessage = useMutation({
    mutationFn: ({
      targetSessionId,
      message,
      backend,
      uiContext,
      signal,
    }: {
      targetSessionId: string;
      message: string;
      backend?: "local" | "openrouter";
      uiContext?: UiContext;
      signal?: AbortSignal;
    }) =>
      api<AiChatSendResponse>(`/ai-chat/sessions/${targetSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: message,
          ...(backend ? { backend } : {}),
          ...(uiContext ? { uiContext } : {}),
        }),
        ...(signal ? { signal } : {}),
      }),
    onSuccess: (response, variables) => {
      queryClient.setQueryData<{ messages: import("./types").AiChatMessage[] }>(
        tenantQueryKey("ai-chat-messages", variables.targetSessionId),
        (current) => ({
          messages: appendAiChatTurn(current?.messages, response),
        }),
      );
      queryClient.setQueryData<Record<string, AiChatUiAction[]>>(
        tenantQueryKey("ai-chat-actions", project.id),
        (current) => ({
          ...current,
          [response.assistantMessage.id]: response.uiActions ?? [],
        }),
      );
      void queryClient.invalidateQueries({ queryKey: sessionsKey });
    },
  });
  const actionsQuery = useQuery<Record<string, AiChatUiAction[]>>({
    queryKey: tenantQueryKey("ai-chat-actions", project.id),
    queryFn: async () => ({}),
    initialData: {},
    staleTime: Infinity,
  });
  const actions = actionsQuery.data;
  return {
    sessionsKey,
    sessionsQuery,
    sessions,
    activeSessionId,
    messagesQuery,
    messages: messagesQuery.data?.messages ?? [],
    createSession,
    sendMessage,
    actions,
  };
}
export function appendAiChatTurn(
  current: import("./types").AiChatMessage[] | undefined,
  response: AiChatSendResponse,
) {
  return [...(current ?? []), response.userMessage, response.assistantMessage];
}
