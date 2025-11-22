import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, createChart, LineSeries } from 'lightweight-charts';

const WS_URLS = {
  localhost: 'ws://localhost:12003',
  remote: 'ws://132.145.91.45:12003',
};

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

const MiniCandleChart = ({ candles, maxValue }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candles || candles.length === 0) return undefined;

    const chart = createChart(container, {
      width: container.clientWidth || 280,
      height: 160,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#cbd5e1',
      },
      grid: {
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' },
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        // 최대값을 랭킹의 메시지 개수와 일치시키기
        autoScale: true,
        entireTextOnly: false,
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 0,
        barSpacing: 2,
      },
      crosshair: { mode: 0 },
    });

    // 주식 차트처럼 상승/하락 두 가지 색으로 고정
    const seriesOptions = {
      upColor: '#26a69a',      // 상승: 청록색
      borderUpColor: '#26a69a',
      wickUpColor: '#26a69a',
      downColor: '#ef5350',    // 하락: 빨간색
      borderDownColor: '#ef5350',
      wickDownColor: '#ef5350',
      priceLineVisible: false,
    };

    // lightweight-charts v5 uses addSeries(CandlestickSeries, opts); v3/v4 uses addCandlestickSeries(opts)
    const series =
      typeof chart.addSeries === 'function'
        ? chart.addSeries(CandlestickSeries, seriesOptions)
        : chart.addCandlestickSeries
          ? chart.addCandlestickSeries(seriesOptions)
          : null;

    if (!series) {
      chart.remove();
      return undefined;
    }

    // candles는 이미 { time, open, high, low, close } 형태
    series.setData(candles);

    // 최대값을 랭킹의 메시지 개수로 고정 (누적값이 아닌 총 개수)
    if (maxValue && maxValue > 0) {
      // Y축 스케일을 랭킹의 메시지 개수에 맞춤
      // lightweight-charts API: priceScale('right') 사용
      const priceScale = chart.priceScale('right');
      if (priceScale) {
        priceScale.applyOptions({
          autoScale: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          minimum: 0,
          maximum: maxValue,
        });
      }
    }

    // 모든 데이터를 보이도록 설정
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, maxValue]);

  if (!candles || candles.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800/70 bg-slate-900/60 text-sm text-slate-500">
        데이터 없음
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-40 w-full overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60"
    />
  );
};

const UnifiedLineChart = ({ channels, rankingHistory, channelMeta }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !channels || channels.length === 0 || !rankingHistory || rankingHistory.size === 0) {
      return undefined;
    }

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: 400,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#cbd5e1',
      },
      grid: {
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' },
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      leftPriceScale: { visible: false },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
        entireTextOnly: false,
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 0,
        barSpacing: 2,
      },
      crosshair: { mode: 1 },
    });

    // 각 채널별로 라인 시리즈 생성
    const colors = [
      '#26a69a', // teal
      '#42a5f5', // blue
      '#ab47bc', // purple
      '#ef5350', // red
      '#ffa726', // orange
      '#66bb6a', // green
      '#ec407a', // pink
      '#5c6bc0', // indigo
      '#ffca28', // yellow
    ];

    const seriesMap = new Map();

    for (let i = 0; i < channels.length && i < 9; i++) {
      const channel = channels[i];
      const channelId = channel.channelId;
      const history = rankingHistory.get(channelId) || [];

      if (history.length === 0) continue;

      // 시간 순서대로 정렬
      const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

      // 같은 초 내의 중복된 time 값을 제거하기 위해 Map 사용
      // 같은 time 값이 있으면 마지막 것만 사용
      const timeMap = new Map();
      for (const record of sortedHistory) {
        const timeInSeconds = Math.floor(record.timestamp / 1000);
        // 같은 time 값이 있으면 업데이트 (마지막 값 사용)
        timeMap.set(timeInSeconds, record.count);
      }

      // Map을 배열로 변환하고 시간 순서대로 정렬
      const lineData = Array.from(timeMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({
          time,
          value,
        }));

      // 라인 시리즈 생성
      // lightweight-charts v5에서는 addSeries를 사용
      let series;
      if (typeof chart.addSeries === 'function') {
        // v5 API: addSeries(LineSeries, options) 또는 addSeries('Line', options)
        try {
          series = chart.addSeries(LineSeries, {
            color: colors[i % colors.length],
            lineWidth: 2,
            title: channelMeta[channelId]?.name || channelId,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        } catch (err) {
          // LineSeries가 없으면 문자열로 시도
          series = chart.addSeries('Line', {
            color: colors[i % colors.length],
            lineWidth: 2,
            title: channelMeta[channelId]?.name || channelId,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        }
      } else if (chart.addLineSeries) {
        // 구버전 API
        series = chart.addLineSeries({
          color: colors[i % colors.length],
          lineWidth: 2,
          title: channelMeta[channelId]?.name || channelId,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }

      if (!series) continue;

      series.setData(lineData);
      seriesMap.set(channelId, series);
    }

    // 모든 데이터를 보이도록 설정
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [channels, rankingHistory, channelMeta]);

  if (!channels || channels.length === 0 || !rankingHistory || rankingHistory.size === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-slate-800/70 bg-slate-900/60 text-sm text-slate-500">
        데이터 없음
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-96 w-full overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60"
    />
  );
};

const LiveChatPage = () => {
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState([]);
  const [channelMeta, setChannelMeta] = useState({});
  const [channelFilter, setChannelFilter] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [lastError, setLastError] = useState('');
  const scrollRef = useRef(null);
  // 랭킹 변경 시점의 (timestamp, 메시지 수) 데이터 저장
  // channelId -> Array<{ timestamp: number, count: number }>
  const [rankingHistory, setRankingHistory] = useState(new Map());
  // 캔들 차트 시간 단위 (초 단위): 1초봉, 5초봉, 10초봉, 60초봉(분봉)
  const [candleTimeframe, setCandleTimeframe] = useState(5);
  // 유저별 채널 정보: userId -> Map<channelId, count>
  const [userChannelMap, setUserChannelMap] = useState(new Map());
  // WebSocket URL 선택
  const [wsUrlKey, setWsUrlKey] = useState(
    import.meta.env.VITE_LIVE_CHAT_WS_URL || 'remote'
  );
  const wsUrl = WS_URLS[wsUrlKey] || WS_URLS.localhost;

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

      ws = new WebSocket(wsUrl);

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
            // 최근 2분 이상의 데이터를 저장하고, 최소 50000개는 유지
            const now = Date.now();
            const twoMinutesAgo = now - 2 * 60 * 1000; // 2분 전 (2분 * 60초 * 1000밀리초)
            const minMessages = 50000;

            // 최근 2분 내의 메시지 필터링
            const recentMessages = next.filter(
              (msg) => (msg.receivedAt || 0) >= twoMinutesAgo
            );

            // 최근 2분 내 메시지가 50000개 미만이면, 오래된 메시지를 포함하여 최소 50000개는 유지
            if (recentMessages.length < minMessages && next.length > minMessages) {
              // 최근 50000개만 유지
              return next.slice(-minMessages);
            }

            // 최근 2분 내 메시지가 50000개 이상이거나, 전체 메시지가 50000개 미만이면 최근 2분 데이터 반환
            return recentMessages.length >= minMessages || next.length < minMessages
              ? recentMessages
              : next;
          });

          // 유저별 채널 정보 업데이트
          if (normalized.userId) {
            setUserChannelMap((prev) => {
              const newMap = new Map(prev);
              const userChannels = newMap.get(normalized.userId) || new Map();
              const currentCount = userChannels.get(normalized.channelId) || 0;
              userChannels.set(normalized.channelId, currentCount + 1);
              newMap.set(normalized.userId, userChannels);
              return newMap;
            });
          }
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
  }, [wsUrl]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, channelFilter, textFilter]);

  useEffect(() => {
    let aborted = false;
    const files = ['/channel_with_replays_0.json', '/channel_with_replays_1.json'];

    const load = async () => {
      try {
        const meta = {};
        for (const file of files) {
          const res = await fetch(file);
          if (!res.ok) continue;
          const data = await res.json();
          if (!Array.isArray(data)) continue;
          for (const item of data) {
            const id = item.channelId || item.channel_id;
            if (!id) continue;
            meta[id] = {
              name: item.channelName || item.name || '',
              image: item.profileImageUrl || item.image || '',
            };
          }
        }
        if (!aborted) {
          setChannelMeta(meta);
        }
      } catch (err) {
        console.warn('Failed to load channel metadata', err);
      }
    };

    load();
    return () => {
      aborted = true;
    };
  }, []);

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

  // 최근 1분 내 메시지 기준으로 채널별 메시지 수 계산
  const channelRanking = useMemo(() => {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000; // 1분 전 (60초 * 1000밀리초)

    // 최근 1분 내의 메시지만 필터링
    const recentMessages = messages.filter(
      (msg) => (msg.receivedAt || 0) >= oneMinuteAgo
    );

    const stats = new Map();
    for (const msg of recentMessages) {
      const key = msg.channelId || 'unknown';
      const entry = stats.get(key) || { channelId: key, count: 0, last: 0 };
      entry.count += 1;
      entry.last = Math.max(entry.last, msg.receivedAt || 0);
      stats.set(key, entry);
    }
    return Array.from(stats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [messages]);

  const topChannels = useMemo(() => channelRanking.slice(0, 9), [channelRanking]);

  // 랭킹이 변경될 때마다 (timestamp, 메시지 수) 저장
  useEffect(() => {
    if (channelRanking.length === 0) return;

    const now = Date.now();
    setRankingHistory((prev) => {
      const newHistory = new Map(prev);

      // 각 채널의 현재 메시지 수 확인
      for (const channel of channelRanking) {
        const channelId = channel.channelId;
        const currentCount = channel.count;

        // 이전 히스토리 가져오기
        const history = newHistory.get(channelId) || [];

        // 마지막 기록과 비교하여 변경되었는지 확인
        const lastRecord = history[history.length - 1];
        if (!lastRecord || lastRecord.count !== currentCount) {
          // 메시지 수가 변경되었으므로 새 기록 추가
          const newRecord = {
            timestamp: now,
            count: currentCount,
          };
          newHistory.set(channelId, [...history, newRecord]);
        }
      }

      return newHistory;
    });
  }, [channelRanking]);

  // 랭킹 히스토리를 기반으로 캔들 차트 데이터 생성
  const channelCandles = useMemo(() => {
    if (topChannels.length === 0 || rankingHistory.size === 0) {
      return { byChannel: {} };
    }

    const byChannel = {};

    // 각 채널별로 랭킹 히스토리를 기반으로 캔들 생성
    for (const channel of topChannels) {
      const channelId = channel.channelId;
      const history = rankingHistory.get(channelId) || [];

      if (history.length === 0) {
        byChannel[channelId] = [];
        continue;
      }

      // 시간 순서대로 정렬
      const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

      // 선택된 시간 단위에 따라 그룹화
      const groupedByTimeframe = new Map();

      for (const record of sortedHistory) {
        const timeInSeconds = Math.floor(record.timestamp / 1000);
        // 선택된 시간 단위로 버킷 계산 (예: 5초봉이면 5초 단위로 그룹화)
        const bucketTime = Math.floor(timeInSeconds / candleTimeframe) * candleTimeframe;

        if (!groupedByTimeframe.has(bucketTime)) {
          groupedByTimeframe.set(bucketTime, []);
        }
        groupedByTimeframe.get(bucketTime).push(record);
      }

      // 각 시간 단위 그룹을 캔들로 변환
      const candles = [];
      let prevClose = null;

      for (const [bucketTime, records] of Array.from(groupedByTimeframe.entries()).sort((a, b) => a[0] - b[0])) {
        // 같은 시간 단위 내의 여러 tick이 있으면 병합
        // 첫 번째 tick의 count를 open으로, 마지막 tick의 count를 close로
        // 그 사이의 최대값을 high로, 최소값을 low로 사용
        const counts = records.map(r => r.count);
        const open = prevClose !== null ? prevClose : counts[0];
        const close = counts[counts.length - 1];
        const high = Math.max(open, close, ...counts);
        const low = Math.min(open, close, ...counts);

        candles.push({
          time: bucketTime,
          open,
          high,
          low,
          close,
        });

        prevClose = close;
      }

      byChannel[channelId] = candles;
    }

    return { byChannel };
  }, [rankingHistory, topChannels, candleTimeframe]);

  // 여러 채널에 존재하는 유저 찾기 및 채널 쌍별 겹치는 유저 수 계산
  const channelOverlaps = useMemo(() => {
    // 두 개 이상의 채널에 있는 유저 찾기
    const multiChannelUsers = [];
    for (const [userId, channels] of userChannelMap.entries()) {
      if (channels.size >= 2) {
        multiChannelUsers.push({
          userId,
          channels: Array.from(channels.keys()),
        });
      }
    }

    // 채널 쌍별로 겹치는 유저 수 계산
    const overlapMap = new Map();

    for (const user of multiChannelUsers) {
      const channelList = user.channels;
      // 모든 채널 쌍 조합 생성
      for (let i = 0; i < channelList.length; i++) {
        for (let j = i + 1; j < channelList.length; j++) {
          const ch1 = channelList[i];
          const ch2 = channelList[j];
          // 정렬하여 키 생성 (채널1 < 채널2)
          const pairKey = ch1 < ch2 ? `${ch1} <-> ${ch2}` : `${ch2} <-> ${ch1}`;
          const count = overlapMap.get(pairKey) || 0;
          overlapMap.set(pairKey, count + 1);
        }
      }
    }

    // Map을 배열로 변환하고 겹치는 유저 수로 정렬
    return Array.from(overlapMap.entries())
      .map(([pair, count]) => {
        const [ch1, ch2] = pair.split(' <-> ');
        return { channel1: ch1, channel2: ch2, userCount: count };
      })
      .sort((a, b) => b.userCount - a.userCount);
  }, [userChannelMap]);

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
      <div className="mx-auto flex max-w-8xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-200">Live Chat Aggregator</p>
            <h1 className="mt-1 text-2xl font-bold text-white">실시간 채팅 모니터</h1>
            <p className="mt-2 text-sm text-slate-300">
              scrap_chat에서 수집한 모든 메시지를 단일 웹소켓으로 전달합니다.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-400">WebSocket URL:</label>
              <select
                value={wsUrlKey}
                onChange={(e) => setWsUrlKey(e.target.value)}
                className="rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-1.5 text-xs text-white outline-none transition focus:border-teal-400/70 focus:ring-2 focus:ring-teal-400/20"
              >
                <option value="localhost">localhost:12003</option>
                <option value="remote">132.145.91.45:12003</option>
              </select>
              <span className="text-xs text-slate-500">{wsUrl}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            {lastError ? (
              <span className="text-xs text-rose-200/90">재연결 시도 중: {lastError}</span>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_320px]">
          <aside className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-lg shadow-slate-900/40 space-y-6">
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
                  {filteredMessages.slice(-500).map((msg) => (
                    <li
                      key={msg.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-800/80 p-4 shadow"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <div className="flex items-center gap-2 rounded-full bg-slate-800/80 px-2 py-1">
                          {channelMeta[msg.channelId]?.image ? (
                            <img
                              src={channelMeta[msg.channelId].image}
                              alt={channelMeta[msg.channelId].name || msg.channelId}
                              className="h-5 w-5 rounded-full border border-slate-800/80 object-cover"
                              loading="lazy"
                            />
                          ) : null}
                          <span className="font-semibold text-teal-200">
                            {channelMeta[msg.channelId]?.name || msg.channelId}
                          </span>
                        </div>
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

          <aside className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-5 shadow-lg shadow-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">채널별 메시지 랭킹</h3>
              <span className="text-xs text-slate-500">top 10</span>
            </div>
            <div className="space-y-2">
              {channelRanking.length === 0 ? (
                <p className="text-sm text-slate-500">데이터 없음</p>
              ) : (
                channelRanking.map((item) => {
                  const meta = channelMeta[item.channelId] || {};
                  return (
                    <div
                      key={item.channelId}
                      className="rounded-2xl border border-slate-800/80 bg-slate-800/60 p-3"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          {meta.image ? (
                            <img
                              src={meta.image}
                              alt={meta.name || item.channelId}
                              className="h-7 w-7 rounded-full border border-slate-800/80 object-cover"
                              loading="lazy"
                            />
                          ) : null}
                          <div className="flex flex-col leading-tight">
                            <span className="font-semibold text-teal-200">
                              {meta.name || item.channelId}
                            </span>
                            <span className="text-slate-500">{item.channelId}</span>
                          </div>
                        </div>
                        <span className="text-slate-400">{item.count} msgs</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                        <div
                          className="h-full rounded-full bg-teal-400/70"
                          style={{
                            width: `${Math.min(
                              100,
                              (item.count / (channelRanking[0]?.count || 1)) * 100,
                            ).toFixed(1)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        <section className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">
                Channel Ranking
              </p>
              <h3 className="text-lg font-bold text-white">통합 변동 차트 (Top 9)</h3>
              <p className="text-sm text-slate-400 mt-1">랭킹 상위 9개 채널의 메시지 수 변동을 실선으로 표시</p>
            </div>
          </div>
          <UnifiedLineChart
            channels={topChannels}
            rankingHistory={rankingHistory}
            channelMeta={channelMeta}
          />
        </section>

        <section className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">
                Channel Ranking
              </p>
              <h3 className="text-lg font-bold text-white">랭킹 변동 캔들 차트 (Top 9)</h3>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/50 p-1">
                <button
                  onClick={() => setCandleTimeframe(1)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${candleTimeframe === 1
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  1초봉
                </button>
                <button
                  onClick={() => setCandleTimeframe(5)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${candleTimeframe === 5
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  5초봉
                </button>
                <button
                  onClick={() => setCandleTimeframe(10)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${candleTimeframe === 10
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  10초봉
                </button>
                <button
                  onClick={() => setCandleTimeframe(60)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${candleTimeframe === 60
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  분봉
                </button>
              </div>
              <span className="text-xs text-slate-500">랭킹 메시지 수 변동 시점 기준 캔들</span>
            </div>
          </div>

          {topChannels.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">메시지 수집 이후 차트가 표시됩니다.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {topChannels.map((ch) => {
                const meta = channelMeta[ch.channelId] || {};
                const candles = channelCandles.byChannel[ch.channelId] || [];
                return (
                  <div
                    key={ch.channelId}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-800/60 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {meta.image ? (
                          <img
                            src={meta.image}
                            alt={meta.name || ch.channelId}
                            className="h-10 w-10 rounded-full border border-slate-800/80 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full border border-slate-800/80 bg-slate-900/80" />
                        )}
                        <div className="leading-tight">
                          <p className="text-sm font-semibold text-teal-200">
                            {meta.name || ch.channelId}
                          </p>
                          <p className="text-xs text-slate-500">{ch.channelId}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <div className="font-semibold text-white">{ch.count} msgs</div>
                        <div className="opacity-80">최근 1분 기준</div>
                      </div>
                    </div>
                    <MiniCandleChart candles={candles} maxValue={ch.count} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">
                Channel Overlap
              </p>
              <h3 className="text-lg font-bold text-white">다중 채널 유저 분석</h3>
              <p className="text-sm text-slate-400 mt-1">여러 채널에 존재하는 유저와 채널 간 겹침 정보</p>
            </div>
          </div>

          {channelOverlaps.length === 0 ? (
            <p className="text-sm text-slate-500">여러 채널에 존재하는 유저가 아직 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {channelOverlaps.map((overlap, idx) => {
                const meta1 = channelMeta[overlap.channel1] || {};
                const meta2 = channelMeta[overlap.channel2] || {};
                return (
                  <div
                    key={`${overlap.channel1}-${overlap.channel2}-${idx}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-800/60 p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {meta1.image ? (
                          <img
                            src={meta1.image}
                            alt={meta1.name || overlap.channel1}
                            className="h-8 w-8 rounded-full border border-slate-800/80 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full border border-slate-800/80 bg-slate-900/80 flex items-center justify-center text-xs text-slate-400">
                            {overlap.channel1.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-teal-200">
                            {meta1.name || overlap.channel1}
                          </span>
                          <span className="text-xs text-slate-500">{overlap.channel1}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-lg font-bold text-teal-300">{overlap.userCount}</span>
                        <span className="text-sm">명</span>
                      </div>

                      <div className="text-slate-600">↔</div>

                      <div className="flex items-center gap-2">
                        {meta2.image ? (
                          <img
                            src={meta2.image}
                            alt={meta2.name || overlap.channel2}
                            className="h-8 w-8 rounded-full border border-slate-800/80 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full border border-slate-800/80 bg-slate-900/80 flex items-center justify-center text-xs text-slate-400">
                            {overlap.channel2.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-teal-200">
                            {meta2.name || overlap.channel2}
                          </span>
                          <span className="text-xs text-slate-500">{overlap.channel2}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default LiveChatPage;
