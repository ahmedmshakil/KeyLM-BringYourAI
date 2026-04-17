'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

type DemoUsageInfo = {
  enabled: boolean;
  model: string;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

type BootstrapPayload = {
  user: User | null;
  providers: Record<KeyProviderId, KeyInfo[]>;
  models: Record<KeyProviderId, ModelInfo[]>;
  modelsMeta: Record<KeyProviderId, { stale: boolean; fetchedAt?: string }>;
  threads: ThreadInfo[];
  freeUsage: FreeUsageInfo | null;
  demo: DemoUsageInfo;
};

const createEmptyProviders = (): Record<KeyProviderId, KeyInfo[]> => ({
  openai: [],
  gemini: [],
  anthropic: []
});

const createEmptyModels = (): Record<KeyProviderId, ModelInfo[]> => ({
  openai: [],
  gemini: [],
  anthropic: []
});

const createEmptyModelsMeta = (): Record<KeyProviderId, { stale: boolean; fetchedAt?: string }> => ({
  openai: { stale: false },
  gemini: { stale: false },
  anthropic: { stale: false }
});

const createDefaultDemoUsage = (): DemoUsageInfo => ({
  enabled: false,
  model: 'moonshotai/kimi-k2-instruct-0905',
  limit: 3,
  used: 0,
  remaining: 3,
  exhausted: false
});

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

function AppPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAuthView = searchParams.get('auth');
  const demoModeRequested = searchParams.get('demo') === '1';
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register' | 'reset'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authNoticeTone, setAuthNoticeTone] = useState<'error' | 'success'>('error');
  const [providers, setProviders] = useState<Record<KeyProviderId, KeyInfo[]>>(createEmptyProviders());
  const [keyInputs, setKeyInputs] = useState<Record<KeyProviderId, string>>({
    openai: '',
    gemini: '',
    anthropic: ''
  });
  const [models, setModels] = useState<Record<KeyProviderId, ModelInfo[]>>(createEmptyModels());
  const [modelsMeta, setModelsMeta] = useState<Record<KeyProviderId, { stale: boolean; fetchedAt?: string }>>(
    createEmptyModelsMeta()
  );
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
  const [demoUsage, setDemoUsage] = useState<DemoUsageInfo>(createDefaultDemoUsage());
  const [demoMessages, setDemoMessages] = useState<MessageInfo[]>([]);
  const [demoLimitModalOpen, setDemoLimitModalOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const freeNoticeTimeoutRef = useRef<number | null>(null);
  const previousFreeUsedRef = useRef<number | null>(null);
  const streamFlushTimeoutRef = useRef<number | null>(null);
  const streamBufferedDeltaRef = useRef('');
  const streamBufferedMessageIdRef = useRef<string | null>(null);

  const connectedProviders = useMemo(() => {
    return KEY_PROVIDERS.filter((provider) => providers[provider.id].some((key) => key.status === 'active'))
      .map((provider) => provider.id);
  }, [providers]);

  const activeThreadIsFree = activeThread?.provider === 'groq';
  const freeModeAvailable = freeUsage?.status === 'available';
  const shouldShowFreeSource = activeThreadIsFree || (connectedProviders.length === 0 && freeModeAvailable);
  const isDemoMode = demoModeRequested && !user;

  const flushBufferedAssistantDelta = () => {
    if (streamFlushTimeoutRef.current !== null) {
      window.clearTimeout(streamFlushTimeoutRef.current);
      streamFlushTimeoutRef.current = null;
    }

    const messageId = streamBufferedMessageIdRef.current;
    const delta = streamBufferedDeltaRef.current;
    if (!messageId || !delta) {
      return;
    }

    streamBufferedDeltaRef.current = '';
    setActiveThread((prev) => {
      if (!prev) {
        return prev;
      }

      const updatedMessages = [...prev.messages];
      const index = updatedMessages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        return prev;
      }

      updatedMessages[index] = {
        ...updatedMessages[index],
        content: updatedMessages[index].content + delta
      };

      return {
        ...prev,
        messages: updatedMessages
      };
    });
  };

  const queueAssistantDelta = (messageId: string, delta: string) => {
    if (streamBufferedMessageIdRef.current && streamBufferedMessageIdRef.current !== messageId) {
      flushBufferedAssistantDelta();
    }

    streamBufferedMessageIdRef.current = messageId;
    streamBufferedDeltaRef.current += delta;

    if (streamFlushTimeoutRef.current !== null) {
      return;
    }

    streamFlushTimeoutRef.current = window.setTimeout(() => {
      flushBufferedAssistantDelta();
    }, 48);
  };

  const updateThreadSummary = (
    thread: Pick<ThreadDetail, 'id' | 'provider' | 'model'>,
    options: {
      lastMessage?: string | null;
      updatedAt?: string;
      title?: string | null;
    } = {}
  ) => {
    setThreads((prev) => {
      const existing = prev.find((item) => item.id === thread.id);
      const lastMessage = options.lastMessage ?? existing?.lastMessage ?? null;
      const title =
        options.title ??
        existing?.title ??
        (lastMessage ? truncateWords(lastMessage, 4) || null : existing?.title ?? null);

      const next: ThreadInfo = {
        id: thread.id,
        provider: thread.provider,
        model: thread.model,
        title,
        status: existing?.status ?? 'active',
        updatedAt: options.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
        lastMessage
      };

      return [next, ...prev.filter((item) => item.id !== thread.id)];
    });
  };

  const applyBootstrapPayload = (payload: BootstrapPayload) => {
    setDemoUsage(payload.demo);
    if (!payload.user) {
      setUser(null);
      setProviders(createEmptyProviders());
      setModels(createEmptyModels());
      setModelsMeta(createEmptyModelsMeta());
      setThreads([]);
      setActiveThread(null);
      setFreeUsage(null);
      setCurrentProvider('openai');
      setSelectedModel('');
      return;
    }

    setUser(payload.user);
    setProviders(payload.providers);
    setModels(payload.models);
    setModelsMeta(payload.modelsMeta);
    setThreads(payload.threads);
    setFreeUsage(payload.freeUsage);

    const nextConnectedProviders = KEY_PROVIDERS.filter((provider) =>
      payload.providers[provider.id].some((key) => key.status === 'active')
    ).map((provider) => provider.id);

    const resolvedProvider = nextConnectedProviders.includes(currentProvider)
      ? currentProvider
      : nextConnectedProviders[0] ?? 'openai';

    setCurrentProvider(resolvedProvider);
    setSelectedModel((prev) => {
      const availableModels = payload.models[resolvedProvider] ?? [];
      return availableModels.some((model) => model.id === prev) ? prev : availableModels[0]?.id ?? '';
    });
  };

  const loadBootstrap = async (showLoading = false): Promise<BootstrapPayload | null> => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const payload = await apiJson<BootstrapPayload>('/api/app/bootstrap');
      applyBootstrapPayload(payload);
      return payload;
    } catch {
      applyBootstrapPayload({
        user: null,
        providers: createEmptyProviders(),
        models: createEmptyModels(),
        modelsMeta: createEmptyModelsMeta(),
        threads: [],
        freeUsage: null,
        demo: createDefaultDemoUsage()
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

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
    void loadBootstrap(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'dark') {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    if (requestedAuthView === 'login' || requestedAuthView === 'register' || requestedAuthView === 'reset') {
      setAuthView(requestedAuthView);
      setAuthNotice('');
      setAuthNoticeTone('error');
      setResetLink('');
    }
  }, [requestedAuthView]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (requestedAuthView || demoModeRequested) {
      router.replace('/app');
    }
  }, [demoModeRequested, requestedAuthView, router, user]);

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

      if (streamFlushTimeoutRef.current !== null) {
        window.clearTimeout(streamFlushTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isDemoMode && demoUsage.exhausted) {
      setDemoLimitModalOpen(true);
      return;
    }

    if (!isDemoMode) {
      setDemoLimitModalOpen(false);
    }
  }, [demoUsage.exhausted, isDemoMode]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!connectedProviders.includes(currentProvider)) {
      const fallback = connectedProviders[0] ?? 'openai';
      setCurrentProvider(fallback);
      return;
    }

    const availableModels = models[currentProvider] ?? [];
    if (availableModels.length > 0) {
      if (!availableModels.some((model) => model.id === selectedModel)) {
        setSelectedModel(availableModels[0]?.id ?? '');
      }
      return;
    }

    loadModels(currentProvider);
  }, [user, currentProvider, connectedProviders, models, selectedModel]);

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
      setAuthEmail('');
      setAuthPassword('');
      setResetEmail('');
      setResetLink('');
      setAuthNotice('');
      await loadBootstrap(true);
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
    setProviders(createEmptyProviders());
    setModels(createEmptyModels());
    setModelsMeta(createEmptyModelsMeta());
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

  const navigateToAuth = (view: 'login' | 'register') => {
    window.location.href = `/app?auth=${view}`;
  };

  const handleConnectKey = async (provider: KeyProviderId) => {
    const key = keyInputs[provider].trim();
    if (!key) {
      setNotice('Paste a key to connect.');
      return;
    }
    try {
      const res = await apiJson<{ key: KeyInfo }>(`/api/providers/${provider}/keys`, {
        method: 'POST',
        body: JSON.stringify({ key })
      });
      setKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      setProviders((prev) => ({
        ...prev,
        [provider]: [res.key, ...prev[provider].filter((item) => item.id !== res.key.id)]
      }));
      setCurrentProvider(provider);
      await loadModels(provider, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to connect key');
    }
  };

  const handleDeleteKey = async (provider: KeyProviderId, keyId: string) => {
    await apiJson(`/api/providers/${provider}/keys/${keyId}`, { method: 'DELETE' });
    setProviders((prev) => ({
      ...prev,
      [provider]: prev[provider].filter((key) => key.id !== keyId)
    }));
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
        updateThreadSummary(created, {
          updatedAt: new Date().toISOString(),
          lastMessage: null,
          title: null
        });
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
      updateThreadSummary(created, {
        updatedAt: new Date().toISOString(),
        lastMessage: null,
        title: null
      });
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

  const handleSendDemoMessage = async () => {
    const content = messageInput.trim();
    if (!content || streaming) {
      return;
    }

    if (demoUsage.exhausted) {
      setDemoLimitModalOpen(true);
      return;
    }

    setMessageInput('');
    setNotice('');

    const requestId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const optimisticUser: MessageInfo = {
      id: requestId,
      role: 'user',
      content,
      createdAt
    };
    const optimisticAssistant: MessageInfo = {
      id: `assistant-${requestId}`,
      role: 'assistant',
      content: '',
      createdAt
    };

    const transcript = [...demoMessages, optimisticUser].map((message) => ({
      role: message.role,
      content: message.content
    }));

    setDemoMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
    setStreaming(true);

    try {
      const res = await fetch('/api/demo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: transcript })
      });

      const payload = (await res.json().catch(() => ({}))) as {
        message?: MessageInfo;
        demo?: DemoUsageInfo;
        error?: { code?: string; message?: string };
      };

      if (payload.demo) {
        setDemoUsage(payload.demo);
      }

      if (!res.ok || !payload.message) {
        setDemoMessages((prev) =>
          prev.filter((message) => message.id !== optimisticUser.id && message.id !== optimisticAssistant.id)
        );

        if (payload.error?.code === 'demo_limit_reached') {
          setDemoLimitModalOpen(true);
        }

        throw new Error(payload.error?.message ?? 'Failed to send demo message');
      }

      setDemoMessages((prev) => {
        const updated = [...prev];
        const assistantIndex = updated.findIndex((message) => message.id === optimisticAssistant.id);
        if (assistantIndex >= 0) {
          updated[assistantIndex] = payload.message as MessageInfo;
        }
        return updated;
      });

      if (payload.demo?.exhausted) {
        setDemoLimitModalOpen(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to send demo message');
    } finally {
      setStreaming(false);
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
    updateThreadSummary(thread, {
      lastMessage: content,
      updatedAt: optimisticUser.createdAt
    });
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const shouldStream = true;
    const shouldRefreshFreeUsage = thread.provider === 'groq';

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
            queueAssistantDelta(optimisticAssistant.id, payload.delta);
          }

          if (event.event === 'done') {
            flushBufferedAssistantDelta();
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
            updateThreadSummary(thread, {
              lastMessage: payload.message.content,
              updatedAt: payload.message.createdAt
            });
            setStreaming(false);
          }

          if (event.event === 'error') {
            flushBufferedAssistantDelta();
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
        flushBufferedAssistantDelta();
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
        updateThreadSummary(thread, {
          lastMessage: payload.message.content,
          updatedAt: payload.message.createdAt
        });
        setStreaming(false);
      }
    } catch (error) {
      flushBufferedAssistantDelta();
      setNotice(error instanceof Error ? error.message : 'Failed to send message');
      setStreaming(false);
    } finally {
      if (shouldRefreshFreeUsage) {
        await loadFreeUsage();
      }
    }
  };

  const handleStop = () => {
    flushBufferedAssistantDelta();
    abortRef.current?.abort();
    setStreaming(false);
    if (activeThread?.provider === 'groq') {
      loadFreeUsage();
    }
  };

  const isResetView = authView === 'reset';
  const isLoginView = authView === 'login';
  const showAuthScreen = !user && !isDemoMode;
  const displayedMessages = isDemoMode ? demoMessages : activeThread?.messages ?? [];
  const demoModelLabel = demoUsage.model || createDefaultDemoUsage().model;
  const demoUsageLabel = `${demoUsage.used}/${demoUsage.limit} demo messages used`;
  const demoRemainingLabel = `${demoUsage.remaining} demo ${demoUsage.remaining === 1 ? 'message' : 'messages'} left`;
  const composerPlaceholder = isDemoMode
    ? demoUsage.exhausted
      ? 'Demo complete. Create an account to continue.'
      : 'Try the demo with up to 3 messages...'
    : 'Send a message...';
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

  if (showAuthScreen) {
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
          {user ? (
            <p className="header-session">
              <span className="header-session-label">Signed in:</span>
              <span className="header-session-email">{user.email}</span>
            </p>
          ) : (
            <div className="demo-guest-pill">
              <span className="badge">Guest Demo</span>
              <span className="tag">No login required</span>
            </div>
          )}
        </div>
        <div className="header-center">
          {isDemoMode ? (
            <div className="free-source-banner">
              <span className="badge glow">KeyLM Free</span>
              <div>
                <strong>{demoModelLabel}</strong>
              </div>
            </div>
          ) : shouldShowFreeSource ? (
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
          {isDemoMode ? (
            <>
              <button className="button secondary" type="button" onClick={() => navigateToAuth('login')}>
                Log in
              </button>
              <button className="button" type="button" onClick={() => navigateToAuth('register')}>
                Create account
              </button>
            </>
          ) : (
            <button className="button secondary" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {notice && <p className="tag notice-bar">{notice}</p>}
      {freeThresholdNotice && <p className="tag notice-bar">{freeThresholdNotice}</p>}

      {/* Main content: Threads left, Chat center, Providers right */}
      <div className={isDemoMode ? 'app-shell-new app-shell-demo' : 'app-shell-new'}>
        {/* Left sidebar - Threads */}
        <aside className="threads-sidebar">
          {isDemoMode ? (
            <div className="card demo-sidebar-card">
              <div className="chat-header">
                <h3>Try the demo</h3>
                <span className={`status ${demoUsage.exhausted ? 'idle' : 'connected'}`}>
                  {demoUsage.exhausted ? 'Complete' : 'Live'}
                </span>
              </div>
              <p>
                Explore the KeyLM dashboard without logging in. After 3 messages, we will ask you to log in or
                create an account.
              </p>
              <div className="demo-usage-meter">
                <strong>{demoUsage.remaining}</strong>
                <span>{demoRemainingLabel}</span>
              </div>
              <p className="tag">{demoUsageLabel}</p>
            </div>
          ) : (
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
          )}
        </aside>

        {/* Center - Chat area */}
        <section className="chat-section">
          <div className="card chat-box">
            <div className="chat-messages">
              {displayedMessages.length === 0 && (
                <div className="chat-empty-state">
                  <span className="badge glow">{isDemoMode ? 'Try Demo' : 'New conversation'}</span>
                  <h3>
                    {isDemoMode
                      ? 'Ask up to 3 questions without logging in.'
                      : 'Start a new thread to begin chatting.'}
                  </h3>
                  <p>
                    {isDemoMode
                      ? 'Once the demo limit is finished, KeyLM will prompt you to log in or create an account.'
                      : 'Pick a model, start a thread, and stream responses in your workspace.'}
                  </p>
                </div>
              )}
              {displayedMessages.map((msg) => (
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
                placeholder={composerPlaceholder}
                value={messageInput}
                disabled={isDemoMode && demoUsage.exhausted}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (isDemoMode) {
                      void handleSendDemoMessage();
                    } else {
                      void handleSendMessage();
                    }
                  }
                }}
              />
              <div className="send-actions">
                {isDemoMode ? (
                  <>
                    <button
                      className="button"
                      type="button"
                      disabled={streaming || demoUsage.exhausted}
                      onClick={() => void handleSendDemoMessage()}
                    >
                      {streaming ? 'Sending...' : demoUsage.exhausted ? 'Demo complete' : 'Send'}
                    </button>
                    <span className="tag">{demoRemainingLabel}</span>
                  </>
                ) : (
                  <>
                    {streaming ? (
                      <button className="button secondary" onClick={handleStop}>
                        Stop
                      </button>
                    ) : (
                      <button className="button" onClick={handleSendMessage}>
                        Send
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right sidebar - Providers */}
        {!isDemoMode && (
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
        )}
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

      {isDemoMode && demoLimitModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="card modal demo-limit-modal">
            <span className="badge glow">Demo complete</span>
            <h3>You have used all 3 demo messages.</h3>
            <p>Create an account to keep chatting in KeyLM, or log in if you already have one.</p>
            <div className="modal-actions demo-limit-actions">
              <button className="button secondary" type="button" onClick={() => setDemoLimitModalOpen(false)}>
                Not now
              </button>
              <button className="button secondary" type="button" onClick={() => navigateToAuth('login')}>
                Log in
              </button>
              <button className="button" type="button" onClick={() => navigateToAuth('register')}>
                Create account
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<main className="container">Loading...</main>}>
      <AppPageClient />
    </Suspense>
  );
}
