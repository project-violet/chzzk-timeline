import { useEffect, useMemo, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_LIVE_CHAT_WS_URL || 'ws://localhost:12003';

const StatusBadge = ({ status }) => {
  const color =
    status === 'connected'
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
      : status === 'connecting'
        ? 'bg-amber-400/20 text-amber-100 border-amber-300/40'
        : 'bg-rose-500/20 text-rose-100 border-rose-400/40';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color}`}
    >
      <span className="h-2 w-2 rounded-full bg-current shadow-[0_0_0_3px_rgba(255,255,255,0.05)]" />
      {status}
    </span>
  );
};

const LiveChatPage = () => {
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [channelFilter, setChannelFilter] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [lastError, setLastError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    let ws;
    let stop = false;
    let retryTimer;

    const parseProfileNickname = (raw) => {
      try {
        if (raw && typeof raw.profile === 'string') {
          const parsed = JSON.parse(raw.profile);
          if (parsed?.nickname) return parsed.nickname;
        }
      } catch (_) {
        /* noop */
      }
      return '';
    };

    const normalizeEmojiPositions = (item) => {
      const result = [];
      const pushPos = (start, end) => {
        if (typeof start === 'number') {
          result.push({ start, end: typeof end === 'number' ? end : start });
        }
      };

      if (Array.isArray(item?.positions)) {
        for (const p of item.positions) {
          pushPos(p?.start ?? p?.st ?? p?.s, p?.end ?? p?.ed ?? p?.e);
        }
      } else if (item?.position) {
        pushPos(
          item.position.start ?? item.position.st ?? item.position.s,
          item.position.end ?? item.position.ed ?? item.position.e,
        );
      } else if (typeof item?.start === 'number') {
        pushPos(item.start, item.end);
      }

      return result;
    };

    const parseEmojiImages = (raw) => {
      const list = [];
      const map = {};

      try {
        const extras =
          typeof raw?.extras === 'string'
            ? JSON.parse(raw.extras)
            : raw && typeof raw?.extras === 'object'
              ? raw.extras
              : null;

        const emojis = extras?.emojis;
        if (!emojis) return { list, map };

        for (const [name, url] of Object.entries(emojis)) {
          if (!url) continue;

          const emojiObj = {
            url,
            name,
          };

          map[name] = emojiObj;
        }

        return { list, map };
      } catch (_) {
        return { list, map };
      }
    };

    const connect = () => {
      setStatus('connecting');
      setLastError('');

      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        if (stop) return;
        setStatus('connected');
      };

      ws.onerror = () => {
        setLastError('웹소켓 연결 중 오류가 발생했습니다.');
        ws.close();
      };

      ws.onclose = () => {
        if (stop) return;
        setStatus('disconnected');
        retryTimer = setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const raw = payload.raw ?? payload;
          const { list: emojis, map: emojiMap } = parseEmojiImages(raw);
          const normalized = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId: payload.channelId || payload.channel_id || payload.cid || 'unknown',
            userId: payload.userId || payload.uid || '',
            displayName:
              payload.displayName ||
              payload.nickname ||
              parseProfileNickname(raw) ||
              payload.userId ||
              payload.uid ||
              '',
            message: payload.message || payload.msg || '',
            receivedAt: payload.receivedAt || Date.now(),
            emojis,
            emojiMap,
            raw,
          };

          setMessages((prev) => {
            const next = [...prev, normalized];
            // keep the latest 500 messages to avoid runaway memory usage
            if (next.length > 500) {
              next.shift();
            }
            return next;
          });
        } catch (err) {
          console.warn('Failed to parse message', err);
        }
      };
    };

    connect();

    return () => {
      stop = true;
      clearTimeout(retryTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, channelFilter, textFilter]);

  const filteredMessages = useMemo(() => {
    const channel = channelFilter.trim().toLowerCase();
    const keyword = textFilter.trim().toLowerCase();

    return messages.filter((msg) => {
      const byChannel = channel ? String(msg.channelId).toLowerCase().includes(channel) : true;
      const byKeyword = keyword
        ? String(msg.message || '').toLowerCase().includes(keyword) ||
        String(msg.userId || '').toLowerCase().includes(keyword)
        : true;
      return byChannel && byKeyword;
    });
  }, [messages, channelFilter, textFilter]);

  const renderMessageWithEmojis = (msg) => {
    const text = msg.message || '';

    // Priority 1: token replacement {:token:}
    if (msg.emojiMap && Object.keys(msg.emojiMap).length > 0) {
      const parts = [];
      const regex = /\{:([^:{}]+):\}/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const [full, tokenName] = match;
        const emoji = msg.emojiMap[tokenName];
        const start = match.index;

        if (start > lastIndex) {
          parts.push(<span key={`${msg.id}-text-${start}`}>{text.slice(lastIndex, start)}</span>);
        }

        if (emoji) {
          parts.push(
            <img
              key={`${msg.id}-emoji-token-${start}`}
              src={emoji.url}
              alt={emoji.name || tokenName}
              className="mx-0.5 inline-block h-6 w-6 align-text-bottom"
              loading="lazy"
            />,
          );
        } else {
          parts.push(<span key={`${msg.id}-text-token-${start}`}>{full}</span>);
        }

        lastIndex = start + full.length;
      }

      if (lastIndex < text.length) {
        parts.push(<span key={`${msg.id}-text-tail`}>{text.slice(lastIndex)}</span>);
      }

      if (parts.length > 0) {
        return <span>{parts}</span>;
      }
    }

    // Priority 2: positional replacement from extras
    if (msg.emojis && msg.emojis.length > 0) {
      const positions = msg.emojis
        .flatMap((emoji) =>
          Array.isArray(emoji.positions) && emoji.positions.length > 0
            ? emoji.positions.map((pos) => ({ ...pos, emoji }))
            : [],
        )
        .filter((p) => typeof p.start === 'number' && p.start >= 0)
        .sort((a, b) => a.start - b.start);

      if (positions.length > 0) {
        const parts = [];
        let cursor = 0;

        positions.forEach((pos, idx) => {
          const start = Math.max(0, pos.start);
          const end = Math.min(text.length - 1, pos.end ?? pos.start);
          if (cursor < start) {
            parts.push(<span key={`${msg.id}-text-${idx}`}>{text.slice(cursor, start)}</span>);
          }
          parts.push(
            <img
              key={`${msg.id}-emoji-${idx}`}
              src={pos.emoji.url}
              alt={pos.emoji.name || 'emoji'}
              className="mx-0.5 inline-block h-6 w-6 align-text-bottom"
              loading="lazy"
            />,
          );
          cursor = end + 1;
        });

        if (cursor < text.length) {
          parts.push(<span key={`${msg.id}-text-tail`}>{text.slice(cursor)}</span>);
        }

        return <span>{parts}</span>;
      }

      // No positions but we do have emoji URLs; append them after text
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span>{text || '(empty)'}</span>
          <div className="flex flex-wrap items-center gap-2">
            {msg.emojis.map((emoji, idx) => (
              <img
                key={`${msg.id}-emoji-inline-${idx}`}
                src={emoji.url}
                alt={emoji.name || 'emoji'}
                className="h-6 w-6"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      );
    }

    return <span>{text || '(empty)'}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950/95 pt-28 pb-10 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-200">Live Chat Aggregator</p>
            <h1 className="mt-1 text-2xl font-bold text-white">실시간 채팅 모니터</h1>
            <p className="mt-2 text-sm text-slate-300">
              scrap_chat에서 수집한 모든 메시지를 단일 웹소켓으로 전달합니다. 기본 주소는{' '}
              <span className="font-semibold text-teal-200">{WS_URL}</span> 입니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            {lastError ? (
              <span className="text-xs text-rose-200/90">재연결 시도 중: {lastError}</span>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-lg shadow-slate-900/40">
            <h2 className="text-lg font-semibold text-white">필터</h2>
            <p className="mt-1 text-sm text-slate-400">
              채널 ID 또는 메시지/사용자명으로 필터링할 수 있습니다.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Channel ID
                </span>
                <input
                  type="text"
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  placeholder="channel-id..."
                  className="mt-2 w-full rounded-xl border border-slate-700/70 bg-slate-800/50 px-3 py-2 text-sm text-white outline-none transition focus:border-teal-400/70 focus:ring-2 focus:ring-teal-400/20"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Keyword / User
                </span>
                <input
                  type="text"
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="message keyword..."
                  className="mt-2 w-full rounded-xl border border-slate-700/70 bg-slate-800/50 px-3 py-2 text-sm text-white outline-none transition focus:border-teal-400/70 focus:ring-2 focus:ring-teal-400/20"
                />
              </label>

              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>표시 메시지</span>
                <span className="font-semibold text-teal-200">
                  {filteredMessages.length} / {messages.length}
                </span>
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-800/70 bg-slate-900/95 shadow-lg shadow-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-3 text-sm text-slate-300">
              <span>최근 수집 메시지</span>
              <span className="text-xs text-slate-400">자동 스크롤</span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5" ref={scrollRef}>
              {filteredMessages.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  아직 수신된 메시지가 없거나 필터에 매칭되는 항목이 없습니다.
                </div>
              ) : (
                <ul className="space-y-3">
                  {filteredMessages.map((msg) => (
                    <li
                      key={msg.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-800/80 p-4 shadow"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-full bg-slate-800/80 px-2 py-1 font-semibold text-teal-200">
                          {msg.channelId}
                        </span>
                        {msg.displayName ? (
                          <span className="rounded-full bg-slate-800/70 px-2 py-1">
                            {msg.displayName}
                          </span>
                        ) : null}
                        <span className="text-slate-500">
                          {new Date(msg.receivedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-100">
                        {renderMessageWithEmojis(msg)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LiveChatPage;
