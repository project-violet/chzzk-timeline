import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const AllVideosPage = () => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploaderByVideoNo, setUploaderByVideoNo] = useState(new Map());
    const [sortKey, setSortKey] = useState('video'); // 'video' | 'start' | 'uptime'
    const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

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
                            byVideoNo.set(String(videoNo), { name, channelId, image, start, end, durationSec });
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
            const originalUrl = videoId ? `https://chzzk.naver.com/video/${videoId}` : '#';
            const chatLogUrl = videoId ? `https://chzzk-timeline-static.pages.dev/chatLog-${videoId}.log` : '#';
            const inAppChatUrl = videoId ? `/chat/${videoId}` : '#';
            const uploader = uploaderByVideoNo.get(String(videoId));
            const uptimeSec = uploader?.durationSec ?? null;
            const uptimeText = formatDuration(uptimeSec);
            const videoIdNum = Number(videoId) || 0;
            return { videoId, videoIdNum, startTime, startTs, originalUrl, chatLogUrl, inAppChatUrl, uploader, uptimeText, uptimeSec };
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
            }
            const dir = sortDir === 'asc' ? 1 : -1;
            if (aVal === bVal) return 0;
            return aVal > bVal ? dir : -dir;
        });
        return parsed;
    }, [videos, uploaderByVideoNo, sortKey, sortDir]);

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
            <div className="pt-24 max-w-6xl mx-auto">
                <h1 className="text-2xl md:text-3xl font-bold mb-2 text-teal-300">모든 비디오 목록</h1>
                <p className="text-sm text-slate-300 mb-6">채팅 기록이 있는 총 {items.length.toLocaleString()}개 비디오</p>

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
                                className="text-left col-span-3 md:col-span-2 hover:text-teal-300"
                                aria-label="Video 정렬"
                                title="Video 정렬"
                            >
                                Video{sortIndicator('video')}
                            </button>
                            <div className="col-span-5 md:col-span-3">Profile</div>
                            <button
                                type="button"
                                onClick={() => toggleSort('start')}
                                className="hidden md:block md:col-span-3 text-left hover:text-teal-300"
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
                            <div className="col-span-4 md:col-span-3">Links</div>
                        </div>
                        <ul className="divide-y divide-slate-800/80">
                            {items.map((item) => (
                                <li key={item.videoId} className="grid grid-cols-12 gap-0 px-3 py-3 bg-slate-900/40 hover:bg-slate-900/60">
                                    <div className="col-span-3 md:col-span-2 text-slate-100 font-mono">ID: {item.videoId}</div>
                                    <div className="col-span-5 md:col-span-3 flex items-center gap-3">
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
                                    <div className="hidden md:block md:col-span-3 text-slate-300">{item.startTime || '-'}</div>
                                    <div className="hidden md:block md:col-span-1 text-slate-300">{item.uptimeText}</div>
                                    <div className="col-span-4 md:col-span-3 flex flex-nowrap gap-2">
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
                                </li>
                            ))}
                        </ul>

                        {items.length === 0 ? (
                            <div className="px-3 py-6 text-slate-300">표시할 비디오가 없습니다.</div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllVideosPage;


