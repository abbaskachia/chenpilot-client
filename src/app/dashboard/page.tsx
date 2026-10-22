"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChatLayout } from "@/components/layout/ChatLayout";
import {
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import apiService from "@/services/api";
import { PromptVersion, PromptVersionRecord } from "@/types";

const DEFAULT_TEST_INPUT =
  "Help a user move idle USDC into the highest-yield low-risk strategy.";

const DEFAULT_VARIABLES = JSON.stringify(
  {
    agentName: "ChenPilot",
    userName: "Ada",
    network: "mainnet",
    riskLevel: "low",
    tone: "clear and confident",
  },
  null,
  2,
);

function isRecord(value: unknown): value is PromptVersionRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractVersionRecords(payload: unknown): PromptVersionRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const candidate of [
    payload.versions,
    payload.data,
    payload.items,
    payload.results,
  ]) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  if (isRecord(payload.data)) {
    for (const candidate of [
      payload.data.versions,
      payload.data.items,
      payload.data.results,
    ]) {
      if (Array.isArray(candidate)) {
        return candidate.filter(isRecord);
      }
    }
  }

  return [];
}

function getTemplate(record: PromptVersionRecord): string {
  return (
    getString(record.template) ??
    getString(record.prompt) ??
    getString(record.systemPrompt) ??
    getString(record.content) ??
    getString(record.body) ??
    getString(record.text) ??
    ""
  );
}

function getLabel(record: PromptVersionRecord, index: number): string {
  return (
    getString(record.name) ??
    getString(record.title) ??
    getString(record.label) ??
    getString(record.version) ??
    `Template ${index + 1}`
  );
}

function normalizeVersion(
  record: PromptVersionRecord,
  index: number,
): PromptVersion {
  const id =
    getString(record.id) ??
    getString(record._id) ??
    getString(record.uuid) ??
    `version-${index + 1}`;

  const tags = getArray(record.tags)
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);

  const activeFlag =
    getBoolean(record.isActive) ??
    getBoolean(record.active) ??
    getBoolean(record.is_active) ??
    getString(record.status)?.toLowerCase() === "active";

  return {
    id,
    label: getLabel(record, index),
    description:
      getString(record.description) ??
      getString(record.summary) ??
      getString(record.notes) ??
      "No description provided for this prompt version.",
    template: getTemplate(record),
    version: getString(record.version) ?? id,
    isActive: Boolean(activeFlag),
    createdAt:
      getString(record.createdAt) ??
      getString(record.created_at) ??
      getString(record.insertedAt) ??
      null,
    updatedAt:
      getString(record.updatedAt) ??
      getString(record.updated_at) ??
      getString(record.modifiedAt) ??
      null,
    tags,
    raw: record,
  };
}

function safelyFormatDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function parseVariables(rawValue: string): {
  parsed: Record<string, string>;
  error: string | null;
} {
  try {
    const value: unknown = JSON.parse(rawValue);

    if (!isRecord(value)) {
      return {
        parsed: {},
        error: "Variables must be a JSON object.",
      };
    }

    const parsed = Object.entries(value).reduce<Record<string, string>>(
      (result, [key, entry]) => {
        result[key] =
          entry === null || entry === undefined
            ? ""
            : typeof entry === "string"
              ? entry
              : JSON.stringify(entry);

        return result;
      },
      {},
    );

    return { parsed, error: null };
  } catch {
    return {
      parsed: {},
      error: "Variables JSON is invalid.",
    };
  }
}

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template
    .replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (match, key: string) => variables[key] ?? match,
    )
    .replace(
      /\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g,
      (match, key: string) => variables[key] ?? match,
    );
}

function getPlaceholders(template: string): string[] {
  const matches =
    template.match(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g,
    ) ?? [];

  const normalized = matches.map((placeholder) =>
    placeholder.replace(/^\{\{\s*|\s*\}\}$|^\$\{\s*|\s*\}$/g, ""),
  );

  return Array.from(new Set(normalized));
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState(DEFAULT_TEST_INPUT);
  const [variablesText, setVariablesText] = useState(DEFAULT_VARIABLES);

  const loadVersions = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setError(null);

      const response = await apiService.getPromptVersions();
      const normalizedVersions =
        extractVersionRecords(response).map(normalizeVersion);

      setVersions(normalizedVersions);

      setSelectedId((currentId) => {
        if (
          currentId &&
          normalizedVersions.some((version) => version.id === currentId)
        ) {
          return currentId;
        }

        return (
          normalizedVersions.find((version) => version.isActive)?.id ??
          normalizedVersions[0]?.id ??
          null
        );
      });
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load prompt versions.";

      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    void loadVersions();
  }, [isAuthenticated, router, loadVersions]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? null,
    [versions, selectedId],
  );

  const activeVersion = useMemo(
    () => versions.find((version) => version.isActive) ?? null,
    [versions],
  );

  const parsedVariables = useMemo(
    () => parseVariables(variablesText),
    [variablesText],
  );

  const templateVariables = useMemo(
    () => ({
      ...parsedVariables.parsed,
      input: testInput,
      userInput: testInput,
      user_query: testInput,
    }),
    [parsedVariables.parsed, testInput],
  );

  const renderedPrompt = useMemo(() => {
    if (!selectedVersion) {
      return "";
    }

    return renderTemplate(selectedVersion.template, templateVariables);
  }, [selectedVersion, templateVariables]);

  const unresolvedPlaceholders = useMemo(() => {
    if (!selectedVersion) {
      return [];
    }

    return getPlaceholders(selectedVersion.template).filter(
      (placeholder) => !(placeholder in templateVariables),
    );
  }, [selectedVersion, templateVariables]);

  const handleActivate = async () => {
    if (!selectedVersion || selectedVersion.isActive || isActivating) {
      return;
    }

    setIsActivating(true);

    try {
      await apiService.activatePromptVersion(selectedVersion.id);

      setVersions((currentVersions) =>
        currentVersions.map((version) => ({
          ...version,
          isActive: version.id === selectedVersion.id,
        })),
      );

      toast.success(`${selectedVersion.label} is now active`);
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to activate the selected version.";

      toast.error(message);
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Unable to copy. Check your browser permissions.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060816] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-400" />
          <p className="mt-4 text-sm text-slate-300">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <main className="relative h-full overflow-auto bg-[#060816] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_25%)]" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm text-cyan-300">
                  <ShieldCheck className="h-5 w-5" />
                  Prompt Version Control
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Agent prompt management
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Review prompt versions, test template variables, and activate
                  the version you want your agent to use.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadVersions(true)}
                disabled={isLoading || isRefreshing}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    isRefreshing ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </Button>
            </div>
          </Card>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void loadVersions()}
              >
                Try again
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="space-y-4 lg:col-span-1">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Available versions</h2>
                <span className="text-sm text-slate-400">
                  {versions.length} total
                </span>
              </div>

              {isLoading ? (
                <Card>
                  <div className="flex items-center gap-3 py-4 text-slate-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading prompt versions...
                  </div>
                </Card>
              ) : versions.length === 0 ? (
                <Card>
                  <p className="py-4 text-sm text-slate-300">
                    No prompt versions were returned by the API.
                  </p>
                </Card>
              ) : (
                versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    aria-pressed={selectedId === version.id}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === version.id
                        ? "border-cyan-400 bg-cyan-400/10"
                        : "border-white/10 bg-slate-950/60 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">
                          {version.label}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Version: {version.version}
                        </p>
                      </div>

                      {version.isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-sm leading-5 text-slate-300">
                      {version.description}
                    </p>

                    {version.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {version.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </section>

            <section className="space-y-6 lg:col-span-2">
              <Card>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-cyan-300" />
                      <h2 className="text-xl font-semibold">
                        {selectedVersion?.label ?? "Select a prompt version"}
                      </h2>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      {selectedVersion?.description ??
                        "Choose a version from the list to inspect its template."}
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => void handleActivate()}
                    disabled={
                      !selectedVersion ||
                      selectedVersion.isActive ||
                      isActivating
                    }
                  >
                    {isActivating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 h-4 w-4" />
                    )}
                    {selectedVersion?.isActive
                      ? "Currently active"
                      : "Activate version"}
                  </Button>
                </div>

                {selectedVersion && (
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-slate-400">Created</p>
                      <p className="mt-1 text-sm text-white">
                        {safelyFormatDate(selectedVersion.createdAt)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-slate-400">Last updated</p>
                      <p className="mt-1 text-sm text-white">
                        {safelyFormatDate(selectedVersion.updatedAt)}
                      </p>
                    </div>
                  </div>
                )}

                {activeVersion && (
                  <p className="mt-4 text-sm text-emerald-300">
                    Active version: {activeVersion.label}
                  </p>
                )}
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Template</h2>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!selectedVersion}
                    onClick={() =>
                      void handleCopy(
                        selectedVersion?.template ?? "",
                        "Template",
                      )
                    }
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copy template
                  </Button>
                </div>

                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-200">
                  {selectedVersion?.template ||
                    "No template content available."}
                </pre>
              </Card>

              <Card>
                <h2 className="text-lg font-semibold">Test prompt template</h2>

                <p className="mt-2 text-sm text-slate-400">
                  Change the sample input and JSON variables to preview
                  placeholder substitution. This preview does not execute the
                  agent or submit a transaction.
                </p>

                <label
                  htmlFor="test-input"
                  className="mt-5 block text-sm font-medium text-slate-200"
                >
                  Sample user input
                </label>

                <textarea
                  id="test-input"
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-cyan-400"
                />

                <label
                  htmlFor="template-variables"
                  className="mt-5 block text-sm font-medium text-slate-200"
                >
                  Template variables (JSON)
                </label>

                <textarea
                  id="template-variables"
                  value={variablesText}
                  onChange={(event) => setVariablesText(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
                />

                {parsedVariables.error && (
                  <p role="alert" className="mt-2 text-sm text-red-300">
                    {parsedVariables.error}
                  </p>
                )}

                {unresolvedPlaceholders.length > 0 && (
                  <p className="mt-3 text-sm text-amber-300">
                    Unresolved placeholders: {unresolvedPlaceholders.join(", ")}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-between gap-3">
                  <h3 className="font-medium text-white">Rendered preview</h3>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      !selectedVersion || Boolean(parsedVariables.error)
                    }
                    onClick={() =>
                      void handleCopy(renderedPrompt, "Rendered prompt")
                    }
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copy preview
                  </Button>
                </div>

                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-200">
                  {parsedVariables.error
                    ? "Correct the JSON variables to generate the preview."
                    : renderedPrompt ||
                      "Select a version with template content."}
                </pre>
              </Card>
            </section>
          </div>
        </div>
      </main>
    </ChatLayout>
  );
}
