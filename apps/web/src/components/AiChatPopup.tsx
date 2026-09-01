import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Bot,
  ExternalLink,
  Loader2,
  LocateFixed,
  MessageCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { appPath } from "../app-routing";
import { api, tenantQueryKey } from "../api";
import { collectUiContext, showUiInsight } from "../webmcp";
import { useAiChatController } from "../ai-chat-controller";
import type { AiChatBackend, AiChatUiAction, Project } from "../types";
import type { AiChatCitation, AiChatSession } from "../types";
import { MarkdownAnswer } from "./MarkdownAnswer";

export function shouldShowChatPopupLoader(
  sessionsPending: boolean,
  activeSessionId: string | null,
  messagesPending: boolean,
): boolean {
  return sessionsPending || (Boolean(activeSessionId) && messagesPending);
}

export function automaticNavigationPage(
  actions: AiChatUiAction[],
): Extract<AiChatUiAction, { type: "open_app_page" }>["page"] | null {
  for (const action of actions) {
    if (action.type === "open_app_page" && action.executeImmediately)
      return action.page;
  }
  return null;
}

export function chatSuggestions(pathname: string): string[] {
  if (pathname.includes("/citations"))
    return [
      "Which citations should I improve first?",
      "Summarize the visible citation evidence",
    ];
  if (pathname.includes("/prompts"))
    return [
      "Which tracked prompts need attention?",
      "Suggest gaps in these prompts",
    ];
  if (pathname.includes("/competitors"))
    return ["Compare the visible competitors", "Where are competitors ahead?"];
  if (pathname.includes("/visibility"))
    return ["Explain my visible mention rate", "What changed in this period?"];
  return [
    "Summarize what is visible on this page",
    "What should I improve first?",
  ];
}

export function ChatPopupHistorySelect({
  sessions,
  activeSessionId,
  onChange,
}: {
  sessions: AiChatSession[];
  activeSessionId: string | null;
  onChange: (id: string) => void;
}) {
  if (sessions.length <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="subtle-label shrink-0">History</span>
      <select
        className="select select-bordered select-sm max-w-full min-w-0 flex-1 bg-base-100 text-sm"
        aria-label="Conversation history"
        value={activeSessionId ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.title}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ChatPopupEmptyState({
  pathname,
  onSelect,
}: {
  pathname: string;
  onSelect: (suggestion: string) => void;
}) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-2 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </span>
      <h2 className="mt-3 text-sm font-semibold">Ask about this page</h2>
      <p className="mt-1 max-w-64 text-xs leading-5 text-base-content/55">
        I’ll use the visible dashboard evidence and your project data.
      </p>
      <div className="mt-5 grid w-full gap-2">
        {chatSuggestions(pathname).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-xl border border-base-300 bg-base-100 px-3 py-2.5 text-left text-sm leading-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-base-200/40"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatUiActions({
  actions,
  onShow,
  onNavigate,
}: {
  actions: AiChatUiAction[];
  onShow: (id: string) => string;
  onNavigate: (
    page: Extract<AiChatUiAction, { type: "open_app_page" }>["page"],
  ) => void;
}) {
  const [unavailable, setUnavailable] = useState<string | null>(null);
  return actions.length ? (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <p className="subtle-label w-full">UI evidence</p>
      {actions
        .filter((action) => action.type === "show_ui_insight")
        .map((action) => (
          <button
            key={action.insightId}
            type="button"
            className="btn btn-outline btn-xs h-auto min-h-7 max-w-full gap-1.5 py-1"
            onClick={() => {
              const result = onShow(action.insightId);
              setUnavailable(result.startsWith("No visible") ? result : null);
            }}
          >
            <LocateFixed className="size-3 shrink-0" />
            <span className="truncate">Show {action.label}</span>
          </button>
        ))}
      {actions
        .filter((action) => action.type === "open_app_page")
        .map((action) => (
          <button
            key={action.page}
            type="button"
            className="btn btn-outline btn-xs h-auto min-h-7 max-w-full gap-1.5 py-1"
            onClick={() => onNavigate(action.page)}
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">Open {action.label}</span>
          </button>
        ))}
      {unavailable ? (
        <p role="status" className="w-full text-xs text-warning">
          That evidence is unavailable on this page. Return to the original view
          and try again.
        </p>
      ) : null}
    </div>
  ) : null;
}

export function PopupAssistantMessage({
  content,
  citations: _citations,
  actions,
  onShow,
  onNavigate,
}: {
  content: string;
  citations: AiChatCitation[];
  actions: AiChatUiAction[];
  onShow: (id: string) => string;
  onNavigate: (
    page: Extract<AiChatUiAction, { type: "open_app_page" }>["page"],
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 shadow-sm">
      <div className="markdown-answer">
        <MarkdownAnswer>{content}</MarkdownAnswer>
      </div>
      <ChatUiActions
        actions={actions}
        onShow={onShow}
        onNavigate={onNavigate}
      />
    </div>
  );
}

export function ChatPopupNewChatButton({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-circle btn-sm ml-auto"
      onClick={onCreate}
      disabled={pending}
      aria-label="New chat"
      title="New chat"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Plus className="size-4" />
      )}
    </button>
  );
}

export function AiChatPopup({
  project,
  appBasePath,
}: {
  project: Project;
  appBasePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [backendId, setBackendId] = useState<AiChatBackend["id"]>("local");
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const handledAutomaticAction = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const backendsQuery = useQuery({
    queryKey: tenantQueryKey("ai-chat-backends"),
    queryFn: () => api<{ backends: AiChatBackend[] }>("/ai-chat/backends"),
    enabled: open,
  });
  const backends = backendsQuery.data?.backends ?? [];
  const selectedBackend =
    backends.find((backend) => backend.id === backendId) ?? backends[0];
  const {
    sessionsQuery,
    sessions,
    activeSessionId,
    messagesQuery,
    messages,
    createSession,
    sendMessage,
    actions,
  } = useAiChatController({
    project,
    sessionId,
    enabled: open,
    onSessionChange: (id) => {
      setContent("");
      setSessionId(id);
    },
  });

  useEffect(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (
      !latestAssistant ||
      handledAutomaticAction.current === latestAssistant.id
    )
      return;
    const page = automaticNavigationPage(actions[latestAssistant.id] ?? []);
    if (!page) return;
    handledAutomaticAction.current = latestAssistant.id;
    setOpen(false);
    navigate(appPath(appBasePath, page === "dashboard" ? "/" : `/${page}`));
  }, [actions, appBasePath, messages, navigate]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sendMessage.isPending]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = content.trim();
    if (!message || !activeSessionId || sendMessage.isPending) return;
    setContent("");
    requestController.current = new AbortController();
    sendMessage.mutate({
      targetSessionId: activeSessionId,
      message,
      ...(selectedBackend ? { backend: selectedBackend.id } : {}),
      uiContext: collectUiContext(document, {
        route: `${location.pathname}${location.search}`,
        projectId: project.id,
      }),
      signal: requestController.current.signal,
    });
  };

  if (location.pathname === appPath(appBasePath, "/chat")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          aria-label="AI chat"
          className="flex h-[min(680px,calc(100dvh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-base-300 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Ask aeokit</p>
              <p className="truncate text-xs text-base-content/50">
                {project.name}
              </p>
            </div>
            <select
              className="select select-bordered select-xs ml-auto max-w-28"
              aria-label="AI provider"
              value={selectedBackend?.id ?? ""}
              onChange={(event) =>
                setBackendId(event.target.value as AiChatBackend["id"])
              }
            >
              {backends.map((backend) => (
                <option key={backend.id} value={backend.id}>
                  {backend.label}
                </option>
              ))}
            </select>
            {activeSessionId ? (
              <ChatPopupNewChatButton
                pending={createSession.isPending}
                onCreate={() => createSession.mutate()}
              />
            ) : null}
            <Link
              to={
                activeSessionId
                  ? `${appPath(appBasePath, "/chat")}?session=${encodeURIComponent(activeSessionId)}`
                  : appPath(appBasePath, "/chat")
              }
              className={`btn btn-ghost btn-circle btn-sm ${activeSessionId ? "" : "ml-auto"}`}
              aria-label="Open full chat"
            >
              <ExternalLink className="size-4" />
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-circle btn-sm"
              onClick={() => setOpen(false)}
              aria-label="Close AI chat"
            >
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <ChatPopupHistorySelect
              sessions={sessions}
              activeSessionId={activeSessionId}
              onChange={setSessionId}
            />
            {shouldShowChatPopupLoader(
              sessionsQuery.isPending,
              activeSessionId,
              messagesQuery.isPending,
            ) ? (
              <div className="grid h-full place-items-center">
                <Loader2 className="size-5 animate-spin text-base-content/40" />
              </div>
            ) : !activeSessionId ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <MessageCircle className="mx-auto size-7 text-primary" />
                  <p className="mt-3 text-sm font-medium">
                    Ask about this project
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-4"
                    onClick={() => createSession.mutate()}
                    disabled={createSession.isPending}
                  >
                    <Plus className="size-4" />
                    Start a chat
                  </button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <ChatPopupEmptyState
                pathname={location.pathname}
                onSelect={setContent}
              />
            ) : (
              messages.map((message) => {
                return (
                  <div
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-10 rounded-2xl rounded-br-md bg-base-200 px-3 py-2 text-sm"
                        : "text-sm leading-6"
                    }
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <PopupAssistantMessage
                        content={message.content}
                        citations={message.citations}
                        actions={actions[message.id] ?? []}
                        onShow={(id) => {
                          setOpen(false);
                          return showUiInsight(id);
                        }}
                        onNavigate={(page) => {
                          setOpen(false);
                          navigate(
                            appPath(
                              appBasePath,
                              page === "dashboard" ? "/" : `/${page}`,
                            ),
                          );
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
            {sendMessage.isPending ? (
              <div className="flex items-center gap-2 text-xs text-base-content/50">
                <Loader2 className="size-4 animate-spin" />
                Inspecting this page · Analyzing project data…
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => requestController.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
          {activeSessionId ? (
            <form onSubmit={submit} className="border-t border-base-300 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-base-300 p-2 focus-within:border-primary">
                <textarea
                  className="textarea min-h-10 flex-1 resize-none border-0 bg-transparent p-1 text-sm"
                  rows={1}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={`Ask about ${project.name}…`}
                  maxLength={8_000}
                  aria-label="Chat message"
                  disabled={!selectedBackend || sendMessage.isPending}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-square btn-sm"
                  disabled={
                    !selectedBackend || !content.trim() || sendMessage.isPending
                  }
                  aria-label="Send message"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
              {sendMessage.isError ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-error">
                  {(sendMessage.error as Error).message}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      const last = sendMessage.variables;
                      if (last) sendMessage.mutate(last);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-circle size-14 shadow-xl"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        aria-expanded={open}
      >
        <MessageCircle className="size-6" />
      </button>
    </div>
  );
}
