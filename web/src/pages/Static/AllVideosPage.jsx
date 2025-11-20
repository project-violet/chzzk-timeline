import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { hangulToKeystrokes, levenshteinDistance } from '../../utils/hangul';

const AllVideosPage = () => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploaderByVideoNo, setUploaderByVideoNo] = useState(new Map());
    const [sortKey, setSortKey] = useState('video'); // 'video' | 'start' | 'uptime' | 'messages'
    const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
    const [searchQuery, setSearchQuery] = useState('');
    const listParentRef = useRef(null);

    useEffect(() => {
        let aborted = false;
        async function load() {
            try {
                setLoading(true);
                setError(null);
                const [resVideos, resCh0, resCh1] = await Promise.all([
                    fetch('/video_with_chat_counts.json'),
                    fetch('/channel_with_replays_0.json'),
                    fetch('/channel_with_replays_1.json'),
                ]);
                if (!resVideos.ok) throw new Error('video_with_chat_counts.json 불러오기 실패');
                const json = await resVideos.json();

                let channels = [];
                if (resCh0.ok) {
                    try {
                        const j0 = await resCh0.json();
                        if (Array.isArray(j0)) channels = channels.concat(j0);
                    } catch { }
                }
                if (resCh1.ok) {
                    try {
                        const j1 = await resCh1.json();
                        if (Array.isArray(j1)) channels = channels.concat(j1);
                    } catch { }
                }

                const byVideoNo = new Map();
                for (const ch of channels) {
                    const name = ch?.name;
                    const channelId = ch?.channelId;
                    const image = ch?.image;
                    const replays = Array.isArray(ch?.replays) ? ch.replays : [];
                    for (const rp of replays) {
                        const videoNo = rp?.videoNo;
                        if (videoNo != null && !byVideoNo.has(String(videoNo))) {
                            const title = rp?.title || null;
                            const start = rp?.start || null;
                            const end = rp?.end || null;
                            let durationSec = null;
                            if (start && end) {
                                const s = Date.parse(String(start).replace(' ', 'T'));
                                const e = Date.parse(String(end).replace(' ', 'T'));
                                if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
                                    durationSec = Math.floor((e - s) / 1000);
                                }
                            }
                            byVideoNo.set(String(videoNo), { name, title, channelId, image, start, end, durationSec });
                        }
                    }
                }

                if (!aborted) {
                    setVideos(Array.isArray(json?.videos) ? json.videos : []);
                    setUploaderByVideoNo(byVideoNo);
                    setLoading(false);
                }
            } catch (err) {
                if (!aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }
        load();
        return () => {
            aborted = true;
        };
    }, []);

    const items = useMemo(() => {
        function formatDuration(sec) {
            if (sec == null || Number.isNaN(sec) || sec < 0) return '-';
            const hours = Math.floor(sec / 3600);
            const minutes = Math.floor((sec % 3600) / 60);
            const seconds = sec % 60;
            const mm = String(minutes).padStart(2, '0');
            const ss = String(seconds).padStart(2, '0');
            if (hours > 0) return `${hours}:${mm}:${ss}`;
            return `${minutes}:${ss}`;
        }
        const parsed = videos.map((v) => {
            const videoId = v?.videoId ?? v?.videoNo ?? v?.id;
            const startTime = v?.start_time || v?.startTime || '';
            const startTs = startTime ? Date.parse(startTime.replace(' ', 'T')) : 0;
            const startDisplay = typeof startTime === 'string' ? startTime.split('+')[0] : startTime;
            const totalMessages = Array.isArray(v?.timeline)
                ? v.timeline.reduce((acc, t) => acc + (Number(t?.count) || 0), 0)
                : 0;
            const originalUrl = videoId ? `https://chzzk.naver.com/video/${videoId}` : '#';
            const chatLogUrl = videoId ? `https://chzzk-timeline-static.pages.dev/chatLog-${videoId}.log` : '#';
            const inAppChatUrl = videoId ? `/chat/${videoId}` : '#';
            const uploader = uploaderByVideoNo.get(String(videoId));
            const uptimeSec = uploader?.durationSec ?? null;
            const uptimeText = formatDuration(uptimeSec);
            const videoIdNum = Number(videoId) || 0;
            return {
                videoId,
                videoIdNum,
                startTime,
                startDisplay,
                startTs,
                originalUrl,
                chatLogUrl,
                inAppChatUrl,
                uploader,
                uptimeText,
                uptimeSec,
                totalMessages,
                title: uploader?.title || v?.title || '',
            };
        }).filter((x) => !!x.videoId);
        parsed.sort((a, b) => {
            let aVal = 0;
            let bVal = 0;
            if (sortKey === 'video') {
                aVal = a.videoIdNum || 0;
                bVal = b.videoIdNum || 0;
            } else if (sortKey === 'start') {
                aVal = a.startTs || 0;
                bVal = b.startTs || 0;
            } else if (sortKey === 'uptime') {
                aVal = a.uptimeSec ?? -1;
                bVal = b.uptimeSec ?? -1;
            } else if (sortKey === 'messages') {
                aVal = a.totalMessages ?? -1;
                bVal = b.totalMessages ?? -1;
            }
            const dir = sortDir === 'asc' ? 1 : -1;
            if (aVal === bVal) return 0;
            return aVal > bVal ? dir : -dir;
        });
        return parsed;
    }, [videos, uploaderByVideoNo, sortKey, sortDir]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return items;

        const queryKeys = hangulToKeystrokes(query);
        const maxDistance = query.length <= 4 ? 1 : 2;

        return items.filter((item) => {
            const candidates = [
                item.title || '',
                item.uploader?.name || '',
                item.uploader?.channelId || '',
                item.videoId || '',
            ];

            return candidates.some((candidate) => {
                if (!candidate) return false;
                const target = String(candidate).toLowerCase();
                if (target.includes(query)) return true;

                const targetKeys = hangulToKeystrokes(target);
                if (queryKeys && targetKeys.includes(queryKeys)) return true;

                if (!queryKeys || !targetKeys) return false;
                return levenshteinDistance(queryKeys, targetKeys, maxDistance) <= maxDistance;
            });
        });
    }, [items, searchQuery]);

    const listVirtualizer = useVirtualizer({
        count: filteredItems.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 84,
        overscan: 10,
    });

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            // 기본 방향: video는 desc, start/uptime은 desc로 시작
            setSortDir('desc');
        }
    };

    const sortIndicator = (key) => {
        if (sortKey !== key) return null;
        return sortDir === 'asc' ? ' ▲' : ' ▼';
    };

    return (
        <div className="min-h-screen bg-slate-950/95 text-slate-100">
            <div className="pt-24 max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-2 text-teal-300">모든 비디오 목록</h1>
                <p className="text-sm text-slate-300">채팅 기록이 있는 총 {items.length.toLocaleString()}개 비디오</p>
                <p className="text-xs text-slate-400 mb-6">모든 채팅 기록은 개인정보가 지워진 상태로 제공됩니다.</p>
                <div className="mb-6 flex flex-col gap-2">
                    <label htmlFor="all-videos-search" className="text-xs text-slate-400 uppercase tracking-wide">
                        검색
                    </label>
                    <input
                        id="all-videos-search"
                        type="text"
                        placeholder="제목 또는 스트리머 이름 입력"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    />
                    {searchQuery.trim() ? (
                        <p className="text-xs text-slate-400">
                            검색 결과: {filteredItems.length.toLocaleString()}개
                        </p>
                    ) : null}
                </div>

                {loading ? (
                    <div className="text-slate-300">불러오는 중...</div>
                ) : error ? (
                    <div className="text-red-400">오류: {String(error?.message || error)}</div>
                ) : (
                    <div className="rounded-xl border border-slate-700/70 overflow-hidden">
                        <div className="grid grid-cols-12 gap-0 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300">
                            <button
                                type="button"
                                onClick={() => toggleSort('video')}
                                className="text-left col-span-3 md:col-span-2 lg:col-span-1 hover:text-teal-300"
                                aria-label="Video 정렬"
                                title="Video 정렬"
                            >
                                Video{sortIndicator('video')}
                            </button>
                            <div className="col-span-9 md:col-span-2 lg:col-span-3 text-left">Title</div>
                            <div className="col-span-12 md:col-span-2 lg:col-span-2">Profile</div>
                            <button
                                type="button"
                                onClick={() => toggleSort('start')}
                                className="hidden md:block md:col-span-2 lg:col-span-2 text-left hover:text-teal-300"
                                aria-label="Start Time 정렬"
                                title="Start Time 정렬"
                            >
                                Start Time{sortIndicator('start')}
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleSort('uptime')}
                                className="hidden md:block md:col-span-1 text-left hover:text-teal-300"
                                aria-label="Up Time 정렬"
                                title="Up Time 정렬"
                            >
                                Up Time{sortIndicator('uptime')}
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleSort('messages')}
                                className="hidden md:block md:col-span-1 text-left hover:text-teal-300"
                                aria-label="Messages 정렬"
                                title="Messages 정렬"
                            >
                                Messages{sortIndicator('messages')}
                            </button>
                            <div className="col-span-12 md:col-span-2 lg:col-span-2">Links</div>
                        </div>
                        <div ref={listParentRef} className="relative max-h-[70vh] overflow-y-auto bg-slate-900/10">
                            {filteredItems.length === 0 ? (
                                <div className="px-3 py-6 text-slate-300">표시할 비디오가 없습니다.</div>
                            ) : (
                                <div style={{ height: `${listVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                                    {listVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const item = filteredItems[virtualRow.index];
                                        if (!item) return null;
                                        return (
                                            <div
                                                key={virtualRow.key}
                                                data-index={virtualRow.index}
                                                ref={listVirtualizer.measureElement}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                                className="grid grid-cols-12 gap-0 px-3 py-3 border-b border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/60"
                                            >
                                                <div className="col-span-3 md:col-span-2 lg:col-span-1 text-slate-100 font-mono">ID: {item.videoId}</div>
                                                <div className="col-span-9 md:col-span-2 lg:col-span-3 text-slate-200 text-sm font-semibold truncate">
                                                    {item.title || '-'}
                                                </div>
                                                <div className="col-span-12 md:col-span-2 lg:col-span-2 flex items-center gap-3">
                                                    {item.uploader?.image ? (
                                                        <img
                                                            src={item.uploader.image}
                                                            alt=""
                                                            className="h-8 w-8 rounded-full object-cover flex-none"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="h-8 w-8 rounded-full bg-slate-800/70 flex-none" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="text-slate-100 text-sm font-semibold truncate">
                                                            {item.uploader?.name || '알 수 없음'}
                                                        </div>
                                                        <div className="text-slate-400 text-xs font-mono truncate">
                                                            {item.uploader?.channelId || '-'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="hidden md:block md:col-span-2 lg:col-span-2 text-slate-300">{item.startDisplay || '-'}</div>
                                                <div className="hidden md:block md:col-span-1 text-slate-300">{item.uptimeText}</div>
                                                <div className="hidden md:block md:col-span-1 text-slate-300">{item.totalMessages?.toLocaleString?.() ?? item.totalMessages}</div>
                                                <div className="col-span-12 md:col-span-2 lg:col-span-2 flex flex-nowrap gap-2 flex-wrap md:flex-nowrap mt-2 md:mt-0">
                                                    <a
                                                        href={item.originalUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center rounded-full border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
                                                        title="치지직 원본"
                                                    >
                                                        영상
                                                    </a>
                                                    <a
                                                        href={item.chatLogUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center rounded-full border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
                                                        title="채팅 로그 파일"
                                                    >
                                                        채팅 로그
                                                    </a>
                                                    <Link
                                                        to={item.inAppChatUrl}
                                                        className="inline-flex items-center rounded-full border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="채팅 타임라인"
                                                    >
                                                        채팅 타임라인
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllVideosPage;


