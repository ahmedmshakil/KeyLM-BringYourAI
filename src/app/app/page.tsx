'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiJson } from '@/lib/client/api';
import { readSseStream } from '@/lib/client/sse';

const KEY_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', detail: 'GPT models, strong reasoning' },
  { id: 'gemini', name: 'Gemini', detail: 'Google multimodal family' },
  { id: 'anthropic', name: 'Anthropic', detail: 'Claude models, safe defaults' }
] as const;

type KeyProviderId = (typeof KEY_PROVIDERS)[number]['id'];
type RuntimeProviderId = KeyProviderId | 'groq';

type User = { id: string; email: string };

type KeyInfo = {
  id: string;
  provider: KeyProviderId;
  keyMask: string;
  status: string;
  createdAt: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
};

type ModelInfo = {
  id: string;
  displayName: string;
  provider: KeyProviderId;
  capabilities: { streaming: boolean; vision: boolean; tools: boolean; json: boolean };
  contextWindow?: number;
  category?: string;
};

type UsageInfo = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type ThreadInfo = {
  id: string;
  provider: RuntimeProviderId;
  model: string;
  title?: string | null;
  status: string;
  updatedAt: string;
  lastMessage?: string | null;
};

type MessageInfo = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  usage?: UsageInfo;
};

type ThreadDetail = {
  id: string;
  provider: RuntimeProviderId;
  model: string;
  systemPrompt?: string | null;
  settings?: Record<string, unknown> | null;
  messages: MessageInfo[];
};

type FreeUsageInfo = {
  provider: 'groq';
  model: string;
  user: {
    limit: number;
    used: number;
    remaining: number;
    exhausted: boolean;
  };
  global: {
    limit: number;
    used: number;
    remaining: number;
    exhausted: boolean;
  };
  status: 'available' | 'user_exhausted' | 'global_exhausted' | 'disabled';
  resetAt: string;
};

const FREE_NOTICE_THRESHOLDS = [5, 10];

const truncateWords = (value: string, limit: number) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  const words = cleaned.split(' ');
  const snippet = words.slice(0, limit).join(' ');
  return words.length > limit ? `${snippet}...` : snippet;
};

const formatResetTime = (value?: string) => {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
};

const formatUsageParts = (usage?: UsageInfo) => {
  if (!usage) {
    return [];
  }

  const parts: string[] = [];
  if (typeof usage.promptTokens === 'number') {
    parts.push(`Input Tokens: ${usage.promptTokens}`);
  }
  if (typeof usage.completionTokens === 'number') {
    parts.push(`Output Tokens: ${usage.completionTokens}`);
  }
  if (typeof usage.totalTokens === 'number') {
    parts.push(`Total Tokens used: ${usage.totalTokens}`);
  }
  return parts;
};

export default function AppPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register' | 'reset'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authNoticeTone, setAuthNoticeTone] = useState<'error' | 'success'>('error');
  const [providers, setProviders] = useState<Record<KeyProviderId, KeyInfo[]>>({
    openai: [],
    gemini: [],
    anthropic: []
  });
  const [keyInputs, setKeyInputs] = useState<Record<KeyProviderId, string>>({
    openai: '',
    gemini: '',
    anthropic: ''
  });
  const [models, setModels] = useState<Record<KeyProviderId, ModelInfo[]>>({
    openai: [],
    gemini: [],
    anthropic: []
  });
  const [modelsMeta, setModelsMeta] = useState<Record<KeyProviderId, { stale: boolean; fetchedAt?: string }>>({
    openai: { stale: false },
    gemini: { stale: false },
    anthropic: { stale: false }
  });
  const [currentProvider, setCurrentProvider] = useState<KeyProviderId>('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ThreadInfo | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [notice, setNotice] = useState('');
  const [freeThresholdNotice, setFreeThresholdNotice] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [freeUsage, setFreeUsage] = useState<FreeUsageInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const freeNoticeTimeoutRef = useRef<number | null>(null);
  const previousFreeUsedRef = useRef<number | null>(null);

  const connectedProviders = useMemo(() => {
    return KEY_PROVIDERS.filter((provider) => providers[provider.id].some((key) => key.status === 'active'))
      .map((provider) => provider.id);
  }, [providers]);

  const activeThreadIsFree = activeThread?.provider === 'groq';
  const freeModeAvailable = freeUsage?.status === 'available';
  const shouldShowFreeSource = activeThreadIsFree || (connectedProviders.length === 0 && freeModeAvailable);

  const loadFreeUsage = async (): Promise<FreeUsageInfo | null> => {
    if (!user) {
      setFreeUsage(null);
      return null;
    }
    try {
      const res = await apiJson<FreeUsageInfo>('/api/usage/free');
      setFreeUsage(res);
      return res;
    } catch {
      setFreeUsage(null);
      return null;
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await apiJson<{ user: User }>('/api/auth/me');
        setUser(res.user);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('theme-dark');
    } else {
      root.classList.remove('theme-dark');
    }
    window.localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (!user) {
      setFreeUsage(null);
      return;
    }
    const load = async () => {
      const nextProviders: Record<KeyProviderId, KeyInfo[]> = {
        openai: [],
        gemini: [],
        anthropic: []
      };
      await Promise.all(
        KEY_PROVIDERS.map(async (provider) => {
          try {
            const res = await apiJson<{ keys: KeyInfo[] }>(`/api/providers/${provider.id}/keys`);
            nextProviders[provider.id] = res.keys;
          } catch (error) {
            nextProviders[provider.id] = [];
          }
        })
      );
      setProviders(nextProviders);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFreeUsage(null);
      return;
    }
    loadFreeUsage();
  }, [user]);

  useEffect(() => {
    if (!user || !freeUsage || freeUsage.status !== 'available') {
      previousFreeUsedRef.current = freeUsage?.user.used ?? null;
      return;
    }

    const currentUsed = freeUsage.user.used;
    const previousUsed = previousFreeUsedRef.current;
    const reachedThreshold = FREE_NOTICE_THRESHOLDS.find(
      (threshold) =>
        currentUsed === threshold &&
        previousUsed !== null &&
        previousUsed < threshold
    );

    if (reachedThreshold) {
      const noticeKey = `keylm:free-threshold-notice:${user.id}:${freeUsage.resetAt}:${reachedThreshold}`;
      const alreadyShown = window.localStorage.getItem(noticeKey) === '1';
      if (alreadyShown) {
        previousFreeUsedRef.current = currentUsed;
        return;
      }
      const nextMessage =
        `You have reached ${reachedThreshold} free KeyLM requests today. For better output and deeper thinking, connect your own Gemini, OpenAI, or Anthropic key.`;
      setFreeThresholdNotice(nextMessage);
      window.localStorage.setItem(noticeKey, '1');
      if (freeNoticeTimeoutRef.current) {
        window.clearTimeout(freeNoticeTimeoutRef.current);
      }
      freeNoticeTimeoutRef.current = window.setTimeout(() => {
        setFreeThresholdNotice('');
        freeNoticeTimeoutRef.current = null;
      }, 6000);
    }

    previousFreeUsedRef.current = currentUsed;
  }, [freeUsage, user]);

  useEffect(() => {
    return () => {
      if (freeNoticeTimeoutRef.current) {
        window.clearTimeout(freeNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    const loadThreads = async () => {
      try {
        const res = await apiJson<{ threads: ThreadInfo[] }>('/api/threads');
        setThreads(res.threads);
      } catch (error) {
        setThreads([]);
      }
    };
    loadThreads();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (!connectedProviders.includes(currentProvider)) {
      const fallback = connectedProviders[0] ?? 'openai';
      setCurrentProvider(fallback);
      return;
    }
    loadModels(currentProvider);
  }, [user, currentProvider, connectedProviders]);

  const loadModels = async (provider: KeyProviderId, refresh = false) => {
    if (!connectedProviders.includes(provider)) {
      setModels((prev) => ({ ...prev, [provider]: [] }));
      setSelectedModel('');
      return;
    }
    try {
      const res = await apiJson<{ models: ModelInfo[]; stale: boolean; fetchedAt?: string }>(
        `/api/providers/${provider}/models${refresh ? '?refresh=true' : ''}`
      );
      setModels((prev) => ({ ...prev, [provider]: res.models }));
      setModelsMeta((prev) => ({
        ...prev,
        [provider]: { stale: res.stale, fetchedAt: res.fetchedAt }
      }));
      const exists = res.models.some((model) => model.id === selectedModel);
      if (!exists) {
        setSelectedModel(res.models[0]?.id ?? '');
      }
    } catch (error) {
      setNotice('Failed to load models.');
    }
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (authView === 'reset') {
      return;
    }
    setAuthNotice('');
    setAuthNoticeTone('error');
    try {
      const res = await apiJson<{ user: User }>(`/api/auth/${authView}`, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      setUser(res.user);
      setAuthEmail('');
      setAuthPassword('');
      setResetEmail('');
      setResetLink('');
      setAuthNotice('');
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Auth failed');
    }
  };

  const handleResetRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthNotice('');
    setAuthNoticeTone('error');
    setResetLink('');
    const email = resetEmail.trim();
    if (!email) {
      setAuthNotice('Enter your email to receive a reset link.');
      return;
    }
    try {
      const res = await apiJson<{ ok: boolean; resetUrl?: string }>(
        '/api/auth/password-reset/request',
        {
          method: 'POST',
          body: JSON.stringify({ email })
        }
      );
      setAuthNoticeTone('success');
      setAuthNotice('If the email exists, a reset link is on its way.');
      setResetLink(res.resetUrl ?? '');
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Reset request failed');
    }
  };

  const handleLogout = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveThread(null);
    setThreads([]);
    setFreeUsage(null);
    setNotice('');
    setFreeThresholdNotice('');
    setAuthView('login');
    setAuthNotice('');
    setAuthNoticeTone('error');
    setResetLink('');
    setAuthEmail('');
    setAuthPassword('');
    setResetEmail('');
  };

  const handleConnectKey = async (provider: KeyProviderId) => {
    const key = keyInputs[provider].trim();
    if (!key) {
      setNotice('Paste a key to connect.');
      return;
    }
    try {
      await apiJson(`/api/providers/${provider}/keys`, {
        method: 'POST',
        body: JSON.stringify({ key })
      });
      setKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      const res = await apiJson<{ keys: KeyInfo[] }>(`/api/providers/${provider}/keys`);
      setProviders((prev) => ({ ...prev, [provider]: res.keys }));
      setCurrentProvider(provider);
      loadModels(provider, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to connect key');
    }
  };

  const handleDeleteKey = async (provider: KeyProviderId, keyId: string) => {
    await apiJson(`/api/providers/${provider}/keys/${keyId}`, { method: 'DELETE' });
    const res = await apiJson<{ keys: KeyInfo[] }>(`/api/providers/${provider}/keys`);
    setProviders((prev) => ({ ...prev, [provider]: res.keys }));
  };

  const handleNewThread = async (): Promise<ThreadDetail | null> => {
    try {
      if (connectedProviders.length === 0) {
        const freeStatus = freeUsage ?? (await loadFreeUsage());
        if (freeStatus?.status !== 'available') {
          const message =
            freeStatus?.status === 'global_exhausted'
              ? 'No global free API requests are left today. Connect your own API key to continue.'
              : freeStatus?.status === 'user_exhausted'
                ? 'Your free daily request limit is over. Connect your own API key to continue chatting.'
                : 'KeyLM free mode is not available right now. Connect your own API key to continue.';
          setNotice(message);
          return null;
        }

        const res = await apiJson<{ thread: ThreadDetail }>('/api/threads', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'free'
          })
        });
        const created = res.thread;
        setActiveThread(created);
        const list = await apiJson<{ threads: ThreadInfo[] }>('/api/threads');
        setThreads(list.threads);
        return created;
      }

      if (!selectedModel) {
        setNotice('Pick a model before starting a thread.');
        return null;
      }

      const res = await apiJson<{ thread: ThreadDetail }>('/api/threads', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'byok',
          provider: currentProvider,
          model: selectedModel
        })
      });
      const created = res.thread;
      setActiveThread(created);
      const list = await apiJson<{ threads: ThreadInfo[] }>('/api/threads');
      setThreads(list.threads);
      return created;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to create thread');
      return null;
    }
  };

  const handleSelectThread = async (threadId: string) => {
    try {
      const res = await apiJson<{ thread: ThreadDetail }>(`/api/threads/${threadId}`);
      setActiveThread(res.thread);
      if (res.thread.provider !== 'groq') {
        setCurrentProvider(res.thread.provider);
        setSelectedModel(res.thread.model);
      }
    } catch (error) {
      setNotice('Failed to load thread.');
    }
  };

  const handleDeleteThread = (thread: ThreadInfo) => {
    setDeleteTarget(thread);
  };

  const handleConfirmDeleteThread = async () => {
    if (!deleteTarget) {
      return;
    }
    const threadId = deleteTarget.id;
    try {
      await apiJson(`/api/threads/${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (activeThread?.id === threadId) {
        abortRef.current?.abort();
        setStreaming(false);
        setActiveThread(null);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to delete thread');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSendMessage = async () => {
    let thread = activeThread;
    if (!thread) {
      thread = await handleNewThread();
    }
    if (!thread) {
      return;
    }
    const content = messageInput.trim();
    if (!content || streaming) {
      return;
    }
    setMessageInput('');
    setNotice('');
    const requestId = crypto.randomUUID();
    const optimisticUser: MessageInfo = {
      id: requestId,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    const optimisticAssistant: MessageInfo = {
      id: `assistant-${requestId}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString()
    };
    setActiveThread((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticUser, optimisticAssistant] } : prev
    );
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const shouldStream = thread.provider !== 'gemini';

    try {
      const res = await fetch(`/api/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, requestId, stream: shouldStream }),
        signal: controller.signal
      });
      if (!res.ok) {
        let message = 'Failed to send message';
        try {
          const text = await res.text();
          if (text) {
            try {
              const payload = JSON.parse(text) as { error?: { message?: string } };
              message = payload?.error?.message ?? text;
            } catch {
              message = text;
            }
          }
        } catch {
          // Body already consumed or empty
        }
        throw new Error(message);
      }
      if (shouldStream) {
        await readSseStream(res, (event) => {
          if (event.event === 'delta') {
            const payload = JSON.parse(event.data) as { delta: string };
            setActiveThread((prev) => {
              if (!prev) {
                return prev;
              }
              const updated = [...prev.messages];
              const idx = updated.findIndex((msg) => msg.id === optimisticAssistant.id);
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  content: updated[idx].content + payload.delta
                };
              }
              return { ...prev, messages: updated };
            });
          }
          if (event.event === 'done') {
            const payload = JSON.parse(event.data) as { message: MessageInfo };
            setActiveThread((prev) => {
              if (!prev) {
                return prev;
              }
              const updated = [...prev.messages];
              const idx = updated.findIndex((msg) => msg.id === optimisticAssistant.id);
              if (idx >= 0) {
                updated[idx] = payload.message;
              }
              return { ...prev, messages: updated };
            });
            setStreaming(false);
          }
          if (event.event === 'error') {
            let message = 'Streaming error.';
            if (event.data) {
              try {
                const payload = JSON.parse(event.data) as { message?: string };
                if (payload?.message) {
                  message = payload.message;
                } else {
                  message = event.data;
                }
              } catch {
                message = event.data;
              }
            }
            setNotice(message);
            setStreaming(false);
          }
        });
      } else {
        const payload = (await res.json()) as { message: MessageInfo };
        setActiveThread((prev) => {
          if (!prev) {
            return prev;
          }
          const updated = [...prev.messages];
          const idx = updated.findIndex((msg) => msg.id === optimisticAssistant.id);
          if (idx >= 0) {
            updated[idx] = payload.message;
          }
          return { ...prev, messages: updated };
        });
        setStreaming(false);
      }
      const list = await apiJson<{ threads: ThreadInfo[] }>('/api/threads');
      setThreads(list.threads);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to send message');
      setStreaming(false);
    } finally {
      await loadFreeUsage();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    loadFreeUsage();
  };

  const isResetView = authView === 'reset';
  const isLoginView = authView === 'login';
  const freeResetLabel = formatResetTime(freeUsage?.resetAt);
  const freeStatusMessage =
    freeUsage?.status === 'global_exhausted'
      ? 'No global free API left today. Add your own Gemini, OpenAI, or Anthropic key to keep chatting.'
      : freeUsage?.status === 'user_exhausted'
        ? `Your ${freeUsage?.user.limit ?? 50} daily free requests are used up. Add your own Gemini, OpenAI, or Anthropic key to continue.`
        : freeUsage?.status === 'disabled'
          ? 'KeyLM free mode is unavailable right now. Add your own Gemini, OpenAI, or Anthropic key to continue.'
          : '';

  if (loading) {
    return <main className="container">Loading...</main>;
  }

  if (!user) {
    return (
      <main className="auth-container">
        <div className="auth-wrapper">
          <div className="auth-branding">
            <span className="badge glow">BYOK Workspace</span>
            <h1>KeyLM</h1>
            <p className="auth-tagline">Own your keys, switch models, and stream replies in one secure workspace.</p>
          </div>
          {isResetView ? (
            <form className="auth-card" onSubmit={handleResetRequest}>
              <div className="auth-card-header">
                <h2>Reset password</h2>
                <p>We will send a reset link to your inbox.</p>
              </div>
              <div className="auth-form-group">
                <label htmlFor="reset-email">Email address</label>
                <input
                  className="auth-input"
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  required
                />
              </div>
              <button className="auth-button primary" type="submit">
                Send reset link
              </button>
              <button
                className="auth-button secondary"
                type="button"
                onClick={() => {
                  setAuthView('login');
                  setAuthNotice('');
                  setAuthNoticeTone('error');
                  setResetLink('');
                }}
              >
                Back to sign in
              </button>
              {authNotice && (
                <p className={`auth-notice ${authNoticeTone === 'success' ? 'success' : ''}`}>{authNotice}</p>
              )}
              {resetLink && (
                <p className="auth-reset-link">
                  Dev reset link: <a href={resetLink}>{resetLink}</a>
                </p>
              )}
            </form>
          ) : (
            <form className="auth-card" onSubmit={handleAuth}>
              <div className="auth-card-header">
                <h2>{isLoginView ? 'Welcome back' : 'Create account'}</h2>
                <p>{isLoginView ? 'Sign in to continue to your workspace' : 'Get started in just a few seconds'}</p>
              </div>
              <div className="auth-form-group">
                <label htmlFor="email">Email address</label>
                <input
                  className="auth-input"
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  required
                />
              </div>
              <div className="auth-form-group">
                <label htmlFor="password">Password</label>
                <input
                  className="auth-input"
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  required
                />
              </div>
              {isLoginView && (
                <div className="auth-links">
                  <button
                    className="auth-link"
                    type="button"
                    onClick={() => {
                      setAuthView('reset');
                      setResetEmail(authEmail);
                      setAuthNotice('');
                      setAuthNoticeTone('error');
                      setResetLink('');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <button className="auth-button primary" type="submit">
                {isLoginView ? 'Sign in' : 'Create account'}
              </button>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <button
                className="auth-button secondary"
                type="button"
                onClick={() => {
                  setAuthView(isLoginView ? 'register' : 'login');
                  setAuthNotice('');
                  setAuthNoticeTone('error');
                  setResetLink('');
                }}
              >
                {isLoginView ? 'Create a new account' : 'Sign in to existing account'}
              </button>
              {authNotice && (
                <p className={`auth-notice ${authNoticeTone === 'success' ? 'success' : ''}`}>{authNotice}</p>
              )}
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      {/* Header: Email left, Workspace center, Sign out right */}
      <header className="main-header">
        <div className="header-left">
          <p className="header-session">
            <span className="header-session-label">Signed in:</span>
            <span className="header-session-email">{user.email}</span>
          </p>
        </div>
        <div className="header-center">
          {shouldShowFreeSource ? (
            <div className="free-source-banner">
              <span className="badge glow">KeyLM Free</span>
              <div>
                <strong>{freeUsage?.model ?? activeThread?.model ?? 'moonshotai/kimi-k2-instruct-0905'}</strong>
                {/* <p>Shared Groq pool. Connect your own key for stronger quality or when free quota runs out.</p> */}
              </div>
            </div>
          ) : connectedProviders.length === 0 ? (
            <div className="free-source-banner free-source-banner-muted">
              <span className="badge">Bring Your Key</span>
              <div>
                <strong>Personal API key required</strong>
                <p>Connect Gemini, OpenAI, or Anthropic to start a new BYOK thread.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="workspace-controls">
                <select
                  className="select"
                  value={currentProvider}
                  onChange={(event) => setCurrentProvider(event.target.value as KeyProviderId)}
                >
                  {KEY_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  disabled={!connectedProviders.includes(currentProvider)}
                >
                  {models[currentProvider]?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
                <button className="button secondary" onClick={() => loadModels(currentProvider, true)}>
                  Refresh models
                </button>
              </div>
              {modelsMeta[currentProvider]?.stale && (
                <p className="tag">Showing cached models. Refresh to retry.</p>
              )}
            </>
          )}
        </div>
        <div className="header-right">
          <button
            className={`theme-toggle ${isDark ? 'is-dark' : ''}`}
            onClick={() => setIsDark((prev) => !prev)}
            type="button"
            aria-label="Toggle dark theme"
            aria-pressed={isDark}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          />
          <button className="button secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {notice && <p className="tag notice-bar">{notice}</p>}
      {freeThresholdNotice && <p className="tag notice-bar">{freeThresholdNotice}</p>}

      {/* Main content: Threads left, Chat center, Providers right */}
      <div className="app-shell-new">
        {/* Left sidebar - Threads */}
        <aside className="threads-sidebar">
          <div className="card threads-panel">
            <div className="chat-header">
              <h3>Threads</h3>
              <button className="button secondary" onClick={handleNewThread}>
                New thread
              </button>
            </div>
            <div className="thread-list">
              {threads.map((thread) => {
                const fallbackTitle = thread.lastMessage ? truncateWords(thread.lastMessage, 4) || 'New thread' : 'New thread';
                const threadTitle = thread.title && thread.title.trim() ? thread.title : fallbackTitle;
                const messagePreview = thread.lastMessage
                  ? truncateWords(thread.lastMessage, 8) || 'No messages yet'
                  : 'No messages yet';
                return (
                  <div key={thread.id} className="thread-row">
                    <button
                      className={`thread-item ${activeThread?.id === thread.id ? 'active' : ''}`}
                      onClick={() => handleSelectThread(thread.id)}
                      type="button"
                    >
                      <div className="thread-title">
                        <span className="thread-title-text">{threadTitle}</span>
                        {thread.provider === 'groq' && <span className="thread-pill">KeyLM Free</span>}
                      </div>
                      <div className="thread-preview">{messagePreview}</div>
                    </button>
                    <button
                      className="thread-menu"
                      onClick={() => handleDeleteThread(thread)}
                      type="button"
                      aria-label="Delete thread"
                      title="Delete thread"
                    >
                      ...
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center - Chat area */}
        <section className="chat-section">
          <div className="card chat-box">
            <div className="chat-messages">
              {activeThread?.messages?.map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                  {msg.role === 'assistant' && formatUsageParts(msg.usage).length > 0 && (
                    <div className="message-usage">
                      {formatUsageParts(msg.usage).map((part) => (
                        <span key={`${msg.id}-${part}`}>{part}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="chat-input">
              <textarea
                placeholder="Send a message..."
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <div className="send-actions">
                {streaming ? (
                  <button className="button secondary" onClick={handleStop}>
                    Stop
                  </button>
                ) : (
                  <button className="button" onClick={handleSendMessage}>
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right sidebar - Providers */}
        <aside className="providers-sidebar">
          <div className="card free-usage-card">
            <div className="free-usage-header">
              <div>
                <h3>Free quota</h3>
                <p>Shared KeyLM fallback</p>
              </div>
              <span className={`status ${freeUsage?.status === 'available' ? 'connected' : 'idle'}`}>
                {freeUsage?.status === 'available' ? 'Available' : 'BYOK needed'}
              </span>
            </div>
            <div className="free-usage-grid">
              <div className="free-usage-stat">
                <strong>{freeUsage?.user.remaining ?? 0}</strong>
                <span>User requests left</span>
              </div>
              <div className="free-usage-stat">
                <strong>{freeUsage?.global.remaining ?? 0}</strong>
                <span>Global requests left</span>
              </div>
            </div>
            <p className="tag">
              Resets {freeResetLabel || 'soon'}
            </p>
            {freeStatusMessage && <p className="free-usage-warning">{freeStatusMessage}</p>}
          </div>
          <div className="card">
            <h3>Providers</h3>
            <p>Connect your API keys</p>
          </div>
          {KEY_PROVIDERS.map((provider) => {
            const keys = providers[provider.id];
            const connected = keys.some((key) => key.status === 'active');
            return (
              <div key={provider.id} className="card provider-card">
                <div className="provider-header">
                  <div>
                    <h4>{provider.name}</h4>
                    <p>{provider.detail}</p>
                  </div>
                  <span className={`status ${connected ? 'connected' : 'idle'}`}>
                    {connected ? 'Connected' : 'Idle'}
                  </span>
                </div>
                <div className="provider-input">
                  <input
                    className="input"
                    type="password"
                    placeholder="Paste API key"
                    value={keyInputs[provider.id]}
                    onChange={(event) =>
                      setKeyInputs((prev) => ({ ...prev, [provider.id]: event.target.value }))
                    }
                  />
                  <button className="button" onClick={() => handleConnectKey(provider.id)}>
                    Connect
                  </button>
                </div>
                {keys.length > 0 && (
                  <div className="connected-keys">
                    {keys.map((key) => (
                      <div key={key.id} className="key-item">
                        <span className="tag">{key.keyMask}</span>
                        <small>{key.status}</small>
                        <button
                          className="button secondary small"
                          onClick={() => handleDeleteKey(provider.id, key.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="card modal">
            <h3>Delete thread?</h3>
            <p>This will permanently remove the thread and all of its messages.</p>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="button danger" type="button" onClick={handleConfirmDeleteThread}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
