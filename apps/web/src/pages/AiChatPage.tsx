import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import { useAiChatController } from "../ai-chat-controller";
import { appPath } from "../app-routing";
import { collectUiContext } from "../webmcp";
import { MarkdownAnswer } from "../components/MarkdownAnswer";
import type {
  AiChatMessage,
  AiChatBackend,
  AiChatSendResponse,
  AiChatSession,
  Project,
} from "../types";

export function AiChatPage({
  project,
  appBasePath = "",
}: {
  project: Project;
  appBasePath?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [content, setContent] = useState("");
  const [backendId, setBackendId] = useState<AiChatBackend["id"]>("local");
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const handledAutomaticAction = useRef<string | null>(null);
  const sessionId = new URLSearchParams(location.search).get("session");
  const chatPath = appPath(appBasePath, "/chat");
  const {
    sessionsQuery,
    sessions,
    messagesQuery,
    messages,
    createSession,
    sendMessage,
    actions,
  } = useAiChatController({
    project,
    sessionId,
    onSessionChange: (id) =>
      navigate(`${chatPath}?session=${encodeURIComponent(id)}`),
  });
  const activeSession = sessions.find((session) => session.id === sessionId);
  const backendsQuery = useQuery({
    queryKey: tenantQueryKey("ai-chat-backends"),
    queryFn: () => api<{ backends: AiChatBackend[] }>("/ai-chat/backends"),
  });
  const backends = backendsQuery.data?.backends ?? [];
  const selectedBackend =
    backends.find((backend) => backend.id === backendId) ?? backends[0];

  useEffect(() => {
    if (selectedBackend || !backends[0]) return;
    setBackendId(backends[0].id);
  }, [backends, selectedBackend]);

  useEffect(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (
      !latestAssistant ||
      handledAutomaticAction.current === latestAssistant.id
    )
      return;
    const automaticAction = (actions[latestAssistant.id] ?? []).find(
      (action) => action.type === "open_app_page" && action.executeImmediately,
    );
    if (!automaticAction || automaticAction.type !== "open_app_page") return;
    const page = automaticAction.page;
    handledAutomaticAction.current = latestAssistant.id;
    navigate(appPath(appBasePath, page === "dashboard" ? "/" : `/${page}`));
  }, [actions, appBasePath, messages, navigate]);

  useEffect(() => {
    if (!sessionsQuery.isSuccess) return;
    if (activeSession) return;
    const firstSession = sessions[0];
    if (firstSession) {
      navigate(`${chatPath}?session=${encodeURIComponent(firstSession.id)}`, {
        replace: true,
      });
    } else if (sessionId) {
      navigate(chatPath, { replace: true });
    }
  }, [
    activeSession,
    chatPath,
    navigate,
    sessionId,
    sessions,
    sessionsQuery.isSuccess,
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = content.trim();
    if (!message || !sessionId || sendMessage.isPending) return;
    setContent("");
    requestController.current = new AbortController();
    sendMessage.mutate({
      targetSessionId: sessionId,
      message,
      ...(selectedBackend ? { backend: selectedBackend.id } : {}),
      uiContext: collectUiContext(document, {
        route: `${location.pathname}${location.search}`,
        projectId: project.id,
      }),
      signal: requestController.current.signal,
    });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMessage.isPending]);

  if (sessionsQuery.isPending) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-base-content/40" />
      </div>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-medium">Could not load AI Chat</p>
          <p className="mt-1 text-sm text-base-content/55">
            {(sessionsQuery.error as Error).message}
          </p>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-medium">What should we work on?</h1>
          <p className="max-w-md text-sm leading-6 text-base-content/60">
            Ask about your AI visibility, citations, competitors, tracked
            prompts, or recent answer-engine results.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm gap-1"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
        >
          {createSession.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Start a chat
        </button>
        {createSession.isError ? (
          <p className="text-sm text-error">
            {(createSession.error as Error).message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-base-300 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h1 className="truncate text-sm font-semibold">
            {activeSession.title}
          </h1>
          <select
            className="select select-bordered select-xs ml-auto max-w-64"
            aria-label="AI provider"
            value={selectedBackend?.id ?? ""}
            onChange={(event) =>
              setBackendId(event.target.value as AiChatBackend["id"])
            }
          >
            {backends.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.label} · {backend.model}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered select-xs max-w-48"
            aria-label="Conversation history"
            value={sessionId ?? ""}
            onChange={(event) =>
              navigate(
                `${chatPath}?session=${encodeURIComponent(event.target.value)}`,
              )
            }
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messagesQuery.isPending ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-base-content/40" />
            </div>
          ) : messagesQuery.isError ? (
            <div className="py-10 text-center">
              <p className="font-medium">Could not load this conversation</p>
              <p className="mt-1 text-sm text-base-content/55">
                {(messagesQuery.error as Error).message}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-[10vh] text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-5" />
              </div>
              <h2 className="mt-4 text-lg font-medium">
                Ask aeokit about {project.name}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-base-content/55">
                I can use this project’s setup, competitors, tracked prompts,
                and recent runs as context, plus current web research when it
                helps.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          {sendMessage.isPending ? (
            <>
              <ChatMessage
                message={{
                  id: "pending-user",
                  sessionId: activeSession.id,
                  role: "user",
                  content: sendMessage.variables.message,
                  citations: [],
                  model: null,
                  createdAt: new Date().toISOString(),
                }}
              />
              <div className="flex items-center gap-3 text-sm text-base-content/55">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </span>
                <Loader2 className="size-4 animate-spin" />
                Analyzing project data…
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => requestController.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-base-300 bg-base-100 px-4 py-3 md:px-6">
        <div className="mx-auto max-w-3xl">
          {backendsQuery.isSuccess && !selectedBackend ? (
            <div className="alert alert-warning mb-3 text-sm">
              <span>
                Configure a local AI endpoint or <code>OPENROUTER_API_KEY</code>{" "}
                on the server to enable AI Chat.
              </span>
              <a
                className="btn btn-ghost btn-xs"
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noreferrer"
              >
                Get a key <ExternalLink className="size-3" />
              </a>
            </div>
          ) : null}
          {sendMessage.isError ? (
            <div className="mb-2 flex items-center gap-2 text-sm text-error">
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
          <form
            onSubmit={submit}
            className="flex items-end gap-2 rounded-xl border border-base-300 bg-base-100 p-2 shadow-sm focus-within:border-primary"
          >
            <textarea
              className="textarea min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-2 focus:bg-transparent"
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
              disabled={!selectedBackend || sendMessage.isPending}
              maxLength={8_000}
              aria-label="Chat message"
            />
            <button
              type="submit"
              className="btn btn-primary btn-square btn-sm mb-1"
              disabled={
                !selectedBackend || !content.trim() || sendMessage.isPending
              }
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-base-content/40">
            AI can make mistakes. Verify important recommendations and sources.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ChatMessage({ message }: { message: AiChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
      ) : null}
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-base-200 px-4 py-2.5 text-sm leading-6"
            : "min-w-0 max-w-[calc(100%-2.75rem)] flex-1 rounded-xl border border-base-300 bg-base-100 px-4 py-3.5 text-sm leading-6 shadow-sm"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="markdown-answer">
            <MarkdownAnswer>{message.content}</MarkdownAnswer>
          </div>
        )}
      </div>
      {isUser ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-base-300 text-base-content/60">
          <UserRound className="size-4" />
        </span>
      ) : null}
    </div>
  );
}
