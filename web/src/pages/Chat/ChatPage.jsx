import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { VideoHeader } from './VideoHeader.jsx';
import { VideoInfo } from './VideoInfo.jsx';
import { ChatSearchSection } from './ChatSearchSection.jsx';
import { ChatKeywordRanking } from './ChatKeywordRanking.jsx';
import { PeakTimeline } from './PeakTimeline.jsx';
import { RelatedVideos } from './RelatedVideos.jsx';
import { RelatedChannels } from './RelatedChannels.jsx';
import { RelatedTimelineSection } from './RelatedTimelineSection.jsx';
import { parseChatLog, extractTopKeywords } from './ChatLogParser.js';

const ChatPage = () => {
    const { videoId } = useParams();
    const [videoData, setVideoData] = useState(null);
    const [videoInfo, setVideoInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chartWidth, setChartWidth] = useState(800);
    const chartContainerRef = useRef(null);
    const chartSvgRef = useRef(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState(null);
    const [isFirstRender, setIsFirstRender] = useState(true);
    const [chatLogText, setChatLogText] = useState(null);
    const [chatLogLoading, setChatLogLoading] = useState(false);
    const [chatLogError, setChatLogError] = useState(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const [videoWithChatCounts, setVideoWithChatCounts] = useState(null);
    const [allChannels, setAllChannels] = useState([]);
    const [relatedVideosData, setRelatedVideosData] = useState([]);
    const [iframeCurrentTime, setIframeCurrentTime] = useState(null);

    useEffect(() => {
        let aborted = false;

        async function loadVideoData() {
            try {
                setLoading(true);
                setError(null);

                // 채팅 데이터와 비디오 정보를 동시에 로드
                const [chatResponse, ...channelResponses] = await Promise.all([
                    fetch('/video_with_chat_counts.json'),
                    fetch('/channel_with_replays_0.json'),
                    fetch('/channel_with_replays_1.json'),
                ]);

                if (!chatResponse.ok) {
                    throw new Error(`데이터를 불러오지 못했습니다. 상태 코드: ${chatResponse.status}`);
                }

                const chatData = await chatResponse.json();
                const videos = Array.isArray(chatData?.videos) ? chatData.videos : [];
                const video = videos.find((v) => String(v.videoId) === String(videoId));
                const chatCountSet = new Set(videos.map((v) => String(v.videoId)).filter(Boolean));

                if (!aborted) {
                    setVideoWithChatCounts(chatCountSet);
                }

                if (!video) {
                    if (!aborted) {
                        setError(new Error(`비디오 ID ${videoId}에 해당하는 데이터를 찾을 수 없습니다.`));
                        setLoading(false);
                    }
                    return;
                }

                // channel_with_replays에서 비디오 정보 찾기
                let videoInfoData = null;
                try {
                    const channelDataArrays = await Promise.all(
                        channelResponses.map(async (res) => {
                            if (!res.ok) return [];
                            const data = await res.json();
                            return Array.isArray(data) ? data : [];
                        })
                    );
                    const allChannels = channelDataArrays.flat();
                    if (!aborted) {
                        setAllChannels(allChannels);
                    }

                    // 모든 채널의 리플레이에서 videoId로 매칭
                    for (const channel of allChannels) {
                        if (Array.isArray(channel?.replays)) {
                            const replay = channel.replays.find(
                                (r) => String(r.videoId) === String(videoId) || String(r.videoNo) === String(videoId)
                            );
                            if (replay) {
                                videoInfoData = {
                                    replay,
                                    channel,
                                };
                                break;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('비디오 정보를 가져오는 중 오류:', err);
                    // 비디오 정보를 찾지 못해도 채팅 데이터는 표시
                }

                if (!aborted) {
                    setVideoData(video);
                    setVideoInfo(videoInfoData);
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                if (!aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }

        loadVideoData();

        return () => {
            aborted = true;
        };
    }, [videoId]);

    useEffect(() => {
        setIframeCurrentTime(null);
    }, [videoId]);
    const handleTimelinePointDoubleClick = useCallback((point) => {
        if (!point || typeof point.time !== 'number') {
            return;
        }
        const safeTime = Math.max(0, Math.round(point.time));
        setIframeCurrentTime(safeTime);
    }, []);

    // Chat log 다운로드
    useEffect(() => {
        if (!videoId) return;

        let aborted = false;

        async function loadChatLog() {
            try {
                setChatLogLoading(true);
                setChatLogError(null);

                const url = `https://chzzk-timeline-static.pages.dev/chatLog-${videoId}.log`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`Chat log를 불러오지 못했습니다. 상태 코드: ${response.status}`);
                }

                const text = await response.text();
                if (!aborted) {
                    setChatLogText(text);
                    setChatLogLoading(false);
                }
            } catch (err) {
                console.warn('Chat log 로드 실패:', err);
                if (!aborted) {
                    setChatLogError(err);
                    setChatLogLoading(false);
                }
            }
        }

        loadChatLog();

        return () => {
            aborted = true;
        };
    }, [videoId]);

    useEffect(() => {
        if (typeof window === 'undefined' || !chartContainerRef.current) return;

        const updateChartWidth = () => {
            const container = chartContainerRef.current;
            if (!container) return;

            // 컨테이너의 실제 가용 너비 계산 (padding 제외)
            const containerRect = container.getBoundingClientRect();
            const padding = 64; // p-8 = 2rem = 32px * 2
            const availableWidth = containerRect.width - padding;

            setChartWidth(Math.max(400, availableWidth));
        };

        // 초기 설정
        updateChartWidth();

        // ResizeObserver로 컨테이너 크기 변경 감지
        const resizeObserver = new ResizeObserver(() => {
            updateChartWidth();
        });

        resizeObserver.observe(chartContainerRef.current);

        // 윈도우 리사이즈도 감지 (스크롤바 등으로 인한 변경)
        window.addEventListener('resize', updateChartWidth);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateChartWidth);
        };
    }, [videoData]);

    // hoveredPoint 변경 시 툴팁 위치 업데이트 (데이터 포인트 화면 좌표로)
    const handlePointScreenPosition = useMemo(() => {
        return (pos) => {
            // 유효한 위치일 때만 설정
            if (pos && pos.x > 0 && pos.y > 0) {
                setTooltipPosition(pos);
                setIsFirstRender(false);
            } else {
                setTooltipPosition(null);
                setIsFirstRender(true);
            }
        };
    }, []);

    const parsedStartTime = useMemo(() => {
        if (!videoData?.start_time) return null;
        try {
            return new Date(videoData.start_time);
        } catch {
            return null;
        }
    }, [videoData]);

    const totalDuration = useMemo(() => {
        if (!videoData?.timeline || videoData.timeline.length === 0) return 0;
        return Math.max(...videoData.timeline.map((d) => d.time));
    }, [videoData]);

    const endTime = useMemo(() => {
        if (!parsedStartTime || !totalDuration) return null;
        return new Date(parsedStartTime.getTime() + totalDuration * 1000);
    }, [parsedStartTime, totalDuration]);

    const stats = useMemo(() => {
        if (!videoData?.timeline || videoData.timeline.length === 0) {
            return { total: 0, max: 0, min: 0, avg: 0 };
        }

        const counts = videoData.timeline.map((d) => d.count);
        const total = counts.reduce((sum, count) => sum + count, 0);
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        const avg = Math.round(total / counts.length);

        return { total, max, min, avg };
    }, [videoData]);

    const relatedVideosForCards = useMemo(() => {
        if (!Array.isArray(relatedVideosData) || relatedVideosData.length === 0) return [];
        const currentId = videoInfo?.replay?.videoNo ?? videoId;
        return relatedVideosData.filter((video) => {
            const replayId = video?.replay?.videoNo ?? video?.video_no;
            return String(replayId) !== String(currentId);
        });
    }, [relatedVideosData, videoInfo, videoId]);

    // 키워드 존재 여부 확인
    const hasKeywords = useMemo(() => {
        if (!chatLogText || chatLogLoading) return false;
        try {
            const messages = parseChatLog(chatLogText);
            const keywords = extractTopKeywords(messages, 100, 2);
            return keywords && keywords.length > 0;
        } catch (err) {
            return false;
        }
    }, [chatLogText, chatLogLoading]);

    // 연관 비디오 데이터 로드 (공용)
    useEffect(() => {
        if (!videoId) {
            setRelatedVideosData([]);
            return;
        }

        let aborted = false;

        async function loadRelatedVideos() {
            try {
                const relatedResponse = await fetch('/video_related.json');
                if (!relatedResponse.ok) {
                    throw new Error('Failed to load related videos');
                }

                const relatedData = await relatedResponse.json();
                const videos = relatedData[videoId] || [];

                const enriched = videos
                    .map((video) => {
                        const channel = allChannels.find((ch) => {
                            if (!Array.isArray(ch?.replays)) return false;
                            return ch.replays.some((r) => String(r.videoNo) === String(video.video_no));
                        });
                        if (!channel) return null;

                        const replay =
                            channel.replays.find((r) => String(r.videoNo) === String(video.video_no)) ?? null;
                        if (!replay) return null;

                        return {
                            ...video,
                            replay,
                            channel,
                        };
                    })
                    .filter(Boolean);

                if (!aborted) {
                    setRelatedVideosData(enriched);
                }
            } catch (err) {
                console.error('Failed to load related videos:', err);
                if (!aborted) {
                    setRelatedVideosData([]);
                }
            }
        }

        if (allChannels.length > 0) {
            loadRelatedVideos();
        }

        return () => {
            aborted = true;
        };
    }, [videoId, allChannels]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950/95 pt-28 text-slate-100">
                <Container size="xl">
                    <div className="flex items-center justify-center py-20">
                        <Text size="lg" c="dimmed">
                            데이터를 불러오는 중...
                        </Text>
                    </div>
                </Container>
            </div>
        );
    }

    if (error || !videoData) {
        return (
            <div className="min-h-screen bg-slate-950/95 pt-28 text-slate-100">
                <Container size="xl">
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <Text size="lg" c="red" fw={600} mb="md">
                                오류가 발생했습니다
                            </Text>
                            <Text size="sm" c="dimmed">
                                {error?.message || '비디오 데이터를 찾을 수 없습니다.'}
                            </Text>
                        </div>
                    </div>
                </Container>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950/95 pt-28 pb-8 text-slate-100">
            <Container size="xl" className="mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(864px,1fr)_400px] gap-6 items-start justify-center max-w-full">
                    {/* 왼쪽: 헤더 */}
                    <div className="lg:sticky lg:top-28">
                        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                            <Stack gap="md">
                                <VideoHeader videoInfo={videoInfo} videoData={videoData} />
                                <VideoInfo parsedStartTime={parsedStartTime} endTime={endTime} totalDuration={totalDuration} />
                                {/* <ChatStats stats={stats} /> */}
                            </Stack>
                        </div>
                        <div className="mt-6">
                            <RelatedChannels currentChannelId={videoInfo?.channel?.channelId} />
                        </div>
                    </div>

                    {/* 가운데: VOD 영상과 차트 */}
                    <div className="min-w-0">
                        <Stack gap="xm">
                            {/* VOD 영상 */}
                            {videoInfo?.replay?.videoNo ? (
                                <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                                    <Text size="lg" fw={700} mb={6} className="text-slate-100">
                                        영상 보기
                                    </Text>
                                    <div className="relative w-full vod-iframe-wrapper" style={{ paddingBottom: '56.25%' }}>
                                        <iframe
                                            src={`https://chzzk.naver.com/video/${videoInfo.replay.videoNo}${iframeCurrentTime !== null ? `?currentTime=${iframeCurrentTime}` : ''}`}
                                            className="absolute inset-0 w-full rounded-xl border border-slate-800/60"
                                            frameBorder="0"
                                            allowFullScreen
                                            width="100%"
                                            height="1000px"
                                            allow="autoplay"
                                            title={`${videoInfo.replay.title || '비디오'} 재생`}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {/* 채팅 검색/타임라인 */}
                            {videoData.timeline && videoData.timeline.length > 0 ? (
                                <ChatSearchSection
                                    videoId={videoId}
                                    startTime={parsedStartTime}
                                    chatLogText={chatLogText}
                                    defaultTimeline={videoData.timeline}
                                    searchKeyword={searchKeyword}
                                    onSearchKeywordChange={setSearchKeyword}
                                    onTimelinePointDoubleClick={handleTimelinePointDoubleClick}
                                />
                            ) : null}

                            {/* 모바일: 키워드 -> 연관 영상 순서 */}
                            {isMobile ? (
                                <>
                                    <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                                        <PeakTimeline videoId={videoId} />
                                    </div>

                                    {hasKeywords && (
                                        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                                            <ChatKeywordRanking chatLogText={chatLogText} chatLogLoading={chatLogLoading} onKeywordClick={setSearchKeyword} />
                                        </div>
                                    )}

                                    {relatedVideosData.length > 0 && (
                                        <RelatedTimelineSection
                                            videoId={videoId}
                                            videoInfo={videoInfo}
                                            isMobile={isMobile}
                                            relatedVideosData={relatedVideosData}
                                            videoWithChatCounts={videoWithChatCounts}
                                        />
                                    )}

                                    <RelatedVideos videos={relatedVideosForCards} />
                                </>
                            ) : (
                                <>
                                    {relatedVideosData.length > 0 && (
                                        <RelatedTimelineSection
                                            videoId={videoId}
                                            videoInfo={videoInfo}
                                            isMobile={isMobile}
                                            relatedVideosData={relatedVideosData}
                                            videoWithChatCounts={videoWithChatCounts}
                                        />
                                    )}
                                    <RelatedVideos videos={relatedVideosForCards} />
                                </>
                            )}
                        </Stack>
                    </div>

                    {/* 오른쪽: 주요 키워드 헤더 (PC만) */}
                    {!isMobile && (
                        <div className="lg:sticky lg:top-28">
                            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                                <PeakTimeline videoId={videoId} />
                            </div>

                            {hasKeywords && (
                                <div className="mt-6 overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
                                    <ChatKeywordRanking chatLogText={chatLogText} chatLogLoading={chatLogLoading} onKeywordClick={setSearchKeyword} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Container >
        </div >
    );
};

export default ChatPage;

