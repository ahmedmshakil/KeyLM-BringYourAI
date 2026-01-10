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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
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
    setNotice('');
    try {
      const res = await apiJson<{ user: User }>(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      setUser(res.user);
      setAuthEmail('');
      setAuthPassword('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Auth failed');
    }
  };

  const handleLogout = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveThread(null);
    setThreads([]);
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

  if (loading) {
    return <main className="container">Loading...</main>;
  }

  if (!user) {
    return (
      <main className="container">
        <section className="hero">
          <div>
            <span className="badge">BYOK Workspace</span>
            <h1>Sign in to wire your providers.</h1>
            <p>Own your keys, switch models, and stream replies in one secure workspace.</p>
          </div>
          <form className="card" onSubmit={handleAuth}>
            <h3>{authMode === 'login' ? 'Welcome back' : 'Create account'}</h3>
            <p className="tag">{authMode === 'login' ? 'Sign in to continue' : 'Start fresh in minutes'}</p>
            <label className="tag" htmlFor="email">Email</label>
            <input
              className="input"
              id="email"
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />
            <label className="tag" htmlFor="password">Password</label>
            <input
              className="input"
              id="password"
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              required
            />
            <button className="button" type="submit">
              {authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
            </button>
            {notice && <p className="tag">{notice}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="chat-header">
        <div>
          <span className="badge">Signed in</span>
          <h2>{user.email}</h2>
        </div>
        <div className="topbar">
          <button className="button secondary" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>

      {notice && <p className="tag">{notice}</p>}

      <div className="app-shell">
        <aside className="sidebar">
          <div className="card">
            <h3>Providers</h3>
            <p>Connect keys and keep models fresh.</p>
          </div>
          {PROVIDERS.map((provider) => {
            const keys = providers[provider.id];
            const connected = keys.some((key) => key.status === 'active');
            return (
              <div key={provider.id} className="card">
                <div className="chat-header">
                  <div>
                    <h3>{provider.name}</h3>
                    <p>{provider.detail}</p>
                  </div>
                  <span className={`status ${connected ? 'connected' : ''}`}>{connected ? 'Connected' : 'Idle'}</span>
                </div>
                <div className="grid" style={{ marginTop: 12 }}>
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
                <div className="grid" style={{ marginTop: 12 }}>
                  {keys.map((key) => (
                    <div key={key.id} className="thread-item">
                      <div className="tag">{key.keyMask}</div>
                      <small>{key.status}</small>
                      <button
                        className="button secondary"
                        style={{ marginTop: 8 }}
                        onClick={() => handleDeleteKey(provider.id, key.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </aside>

        <section className="chat-panel">
          <div className="card">
            <div className="chat-header">
              <div>
                <h3>Chat workspace</h3>
                <p>Pick a provider, choose a model, and start a thread.</p>
              </div>
              <div className="topbar">
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
            </div>
            {modelsMeta[currentProvider]?.stale && (
              <p className="tag">Showing cached models. Refresh to retry.</p>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: '280px 1fr', gap: 20 }}>
            <div className="card">
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

            <div className="card">
              <div className="chat-messages">
                {activeThread?.messages?.map((msg) => (
                  <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
              </div>
              <div className="chat-input" style={{ marginTop: 12 }}>
                <textarea
                  placeholder="Send a message..."
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                />
                <div className="grid" style={{ minWidth: 140 }}>
                  <button className="button" onClick={handleSendMessage}>
                    Send
                  </button>
                  {streaming && (
                    <button className="button secondary" onClick={handleStop}>
                      Stop
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="chat-header">
              <h3>Settings</h3>
              <span className="tag">Applied when creating a thread</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
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
      </div>
    </main>
  );
}
