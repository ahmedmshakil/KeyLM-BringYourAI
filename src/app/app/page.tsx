'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiJson } from '@/lib/client/api';
import { readSseStream } from '@/lib/client/sse';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', detail: 'GPT models, strong reasoning' },
  { id: 'gemini', name: 'Gemini', detail: 'Google multimodal family' },
  { id: 'anthropic', name: 'Anthropic', detail: 'Claude models, safe defaults' }
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

type User = { id: string; email: string };

type KeyInfo = {
  id: string;
  provider: ProviderId;
  keyMask: string;
  status: string;
  createdAt: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
};

type ModelInfo = {
  id: string;
  displayName: string;
  provider: ProviderId;
  capabilities: { streaming: boolean; vision: boolean; tools: boolean; json: boolean };
  contextWindow?: number;
  category?: string;
};

type ThreadInfo = {
  id: string;
  provider: ProviderId;
  model: string;
  title?: string;
  status: string;
  updatedAt: string;
  lastMessage?: string | null;
};

type MessageInfo = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ThreadDetail = {
  id: string;
  provider: ProviderId;
  model: string;
  systemPrompt?: string | null;
  settings?: Record<string, unknown> | null;
  messages: MessageInfo[];
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
  const [providers, setProviders] = useState<Record<ProviderId, KeyInfo[]>>({
    openai: [],
    gemini: [],
    anthropic: []
  });
  const [keyInputs, setKeyInputs] = useState<Record<ProviderId, string>>({
    openai: '',
    gemini: '',
    anthropic: ''
  });
  const [models, setModels] = useState<Record<ProviderId, ModelInfo[]>>({
    openai: [],
    gemini: [],
    anthropic: []
  });
  const [modelsMeta, setModelsMeta] = useState<Record<ProviderId, { stale: boolean; fetchedAt?: string }>>({
    openai: { stale: false },
    gemini: { stale: false },
    anthropic: { stale: false }
  });
  const [currentProvider, setCurrentProvider] = useState<ProviderId>('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [notice, setNotice] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const connectedProviders = useMemo(() => {
    return PROVIDERS.filter((provider) => providers[provider.id].some((key) => key.status === 'active'))
      .map((provider) => provider.id);
  }, [providers]);

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
    if (!user) {
      return;
    }
    const load = async () => {
      const nextProviders: Record<ProviderId, KeyInfo[]> = {
        openai: [],
        gemini: [],
        anthropic: []
      };
      await Promise.all(
        PROVIDERS.map(async (provider) => {
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

  const loadModels = async (provider: ProviderId, refresh = false) => {
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
    setNotice('');
    setAuthView('login');
    setAuthNotice('');
    setAuthNoticeTone('error');
    setResetLink('');
    setAuthEmail('');
    setAuthPassword('');
    setResetEmail('');
  };

  const handleConnectKey = async (provider: ProviderId) => {
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

  const handleDeleteKey = async (provider: ProviderId, keyId: string) => {
    await apiJson(`/api/providers/${provider}/keys/${keyId}`, { method: 'DELETE' });
    const res = await apiJson<{ keys: KeyInfo[] }>(`/api/providers/${provider}/keys`);
    setProviders((prev) => ({ ...prev, [provider]: res.keys }));
  };

  const handleNewThread = async (): Promise<ThreadDetail | null> => {
    if (!selectedModel) {
      setNotice('Pick a model before starting a thread.');
      return null;
    }
    try {
      const res = await apiJson<{ thread: ThreadDetail }>('/api/threads', {
        method: 'POST',
        body: JSON.stringify({
          provider: currentProvider,
          model: selectedModel,
          settings: { temperature, maxTokens }
        })
      });
      const created = { ...res.thread, messages: [] };
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
      setCurrentProvider(res.thread.provider);
      setSelectedModel(res.thread.model);
    } catch (error) {
      setNotice('Failed to load thread.');
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

    try {
      const res = await fetch(`/api/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, requestId, stream: true }),
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error('Streaming failed');
      }
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
          setStreaming(false);
        }
        if (event.event === 'error') {
          setNotice('Streaming error.');
          setStreaming(false);
        }
      });
      const list = await apiJson<{ threads: ThreadInfo[] }>('/api/threads');
      setThreads(list.threads);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to send message');
      setStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const isResetView = authView === 'reset';
  const isLoginView = authView === 'login';

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
          <span className="badge">Signed in</span>
          <h2>{user.email}</h2>
        </div>
        <div className="header-center">
          <div className="workspace-controls">
            <select
              className="select"
              value={currentProvider}
              onChange={(event) => setCurrentProvider(event.target.value as ProviderId)}
            >
              {PROVIDERS.map((provider) => (
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
        </div>
        <div className="header-right">
          <button className="button secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {notice && <p className="tag notice-bar">{notice}</p>}

      {/* Main content: Chat left (wider), Providers right */}
      <div className="app-shell-new">
        <section className="chat-section">
          {/* Threads and Chat side by side */}
          <div className="threads-chat-grid">
            <div className="card threads-panel">
              <div className="chat-header">
                <h3>Threads</h3>
                <button className="button secondary" onClick={handleNewThread}>
                  New thread
                </button>
              </div>
              <div className="thread-list">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    className={`thread-item ${activeThread?.id === thread.id ? 'active' : ''}`}
                    onClick={() => handleSelectThread(thread.id)}
                  >
                    <div className="tag">{thread.provider}</div>
                    <div>{thread.model}</div>
                    <small>{thread.lastMessage ?? 'No messages yet'}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="card chat-box">
              <div className="chat-messages">
                {activeThread?.messages?.map((msg) => (
                  <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                    {msg.content}
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
          </div>

          {/* Settings below chat */}
          <div className="card settings-panel">
            <div className="chat-header">
              <h3>Settings</h3>
              <span className="tag">Applied when creating a thread</span>
            </div>
            <div className="settings-grid">
              <label className="tag">
                Temperature
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                />
              </label>
              <label className="tag">
                Max tokens
                <input
                  className="input"
                  type="number"
                  min={128}
                  max={4096}
                  step={128}
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        </section>

        {/* Providers sidebar on the right */}
        <aside className="providers-sidebar">
          <div className="card">
            <h3>Providers</h3>
            <p>Connect your API keys</p>
          </div>
          {PROVIDERS.map((provider) => {
            const keys = providers[provider.id];
            const connected = keys.some((key) => key.status === 'active');
            return (
              <div key={provider.id} className="card provider-card">
                <div className="provider-header">
                  <div>
                    <h4>{provider.name}</h4>
                    <p>{provider.detail}</p>
                  </div>
                  <span className={`status ${connected ? 'connected' : ''}`}>
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
    </main>
  );
}
