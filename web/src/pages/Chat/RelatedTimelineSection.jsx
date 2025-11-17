import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from '@mantine/core';
import { TimelineTracks } from '../Timeline/TimelineTracks.jsx';

const MIN_VIEW_SPAN = 5 * 60 * 1000;

export const RelatedTimelineSection = ({
    videoId,
    videoInfo,
    isMobile,
    relatedVideosData = [],
    videoWithChatCounts,
}) => {

    const formatDateRange = useCallback((startDate, endDate) => {
        if (!startDate && !endDate) return '시간 정보 없음';
        if (startDate && !endDate) return `${startDate.toLocaleString('ko-KR')} 시작`;
        if (!startDate && endDate) return `${endDate.toLocaleString('ko-KR')} 종료`;
        return `${startDate.toLocaleString('ko-KR')} ~ ${endDate.toLocaleString('ko-KR')}`;
    }, []);

    const formatDuration = useCallback((durationMs) => {
        if (typeof durationMs !== 'number') return null;
        const totalMinutes = Math.max(Math.round(durationMs / (60 * 1000)), 0);
        if (totalMinutes <= 0) return '1분 미만';
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const parts = [];
        if (hours > 0) parts.push(`${hours}시간`);
        if (minutes > 0) parts.push(`${minutes}분`);
        return parts.join(' ') || '1분 미만';
    }, []);

    const clamp = useCallback((value, min, max) => Math.min(Math.max(value, min), max), []);

    // 현재 영상 포함한 연관 비디오 목록
    const combinedVideos = useMemo(() => {
        const list = Array.isArray(relatedVideosData) ? [...relatedVideosData] : [];
        if (videoInfo?.replay && videoInfo?.channel) {
            const currentId = String(videoInfo.replay.videoNo ?? videoId);
            const exists = list.some((video) => {
                const replayId = video?.replay?.videoNo ?? video?.video_no;
                return String(replayId) === currentId;
            });
            if (!exists) {
                list.unshift({
                    video_no: currentId,
                    replay: videoInfo.replay,
                    channel: videoInfo.channel,
                    similarity: 1,
                });
            }
        }
        return list;
    }, [relatedVideosData, videoInfo, videoId]);

    // 관련 비디오를 channelRows 형식으로 변환
    const relatedChannelRows = useMemo(() => {
        if (!combinedVideos || combinedVideos.length === 0) return [];

        const channelMap = new Map();
        combinedVideos.forEach((video) => {
            if (!video.channel || !video.replay) return;
            const channelId = video.channel.channelId || video.channel.name;
            if (!channelMap.has(channelId)) {
                channelMap.set(channelId, {
                    channel: video.channel,
                    replays: [],
                    maxSimilarity: Number.isFinite(video.similarity) ? video.similarity : 0,
                });
            }
            const entry = channelMap.get(channelId);
            entry.maxSimilarity = Math.max(
                entry.maxSimilarity,
                Number.isFinite(video.similarity) ? video.similarity : 0
            );

            const replay = video.replay;
            let startDate;
            let endDate;
            if (replay.start && replay.end) {
                startDate = new Date(replay.start);
                endDate = new Date(replay.end);
            } else if (replay.publishDate) {
                const publishDate = new Date(replay.publishDate);
                const durationMs = (replay.durationSec || 0) * 1000;
                startDate = publishDate;
                endDate = new Date(publishDate.getTime() + durationMs);
            } else {
                return;
            }
            entry.replays.push({
                ...replay,
                startDate,
                endDate,
            });
        });

        return Array.from(channelMap.values())
            .filter((item) => item.replays.length > 0)
            .sort((a, b) => {
                const simDiff = (b.maxSimilarity ?? 0) - (a.maxSimilarity ?? 0);
                if (simDiff !== 0) return simDiff;
                return (b.channel?.follower ?? 0) - (a.channel?.follower ?? 0);
            })
            .map((item) => ({
                channel: item.channel,
                visibleReplays: item.replays.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
            }));
    }, [combinedVideos]);

    const relatedBounds = useMemo(() => {
        if (relatedChannelRows.length === 0) {
            const now = Date.now();
            return {
                minTime: now - 24 * 60 * 60 * 1000,
                maxTime: now,
                span: 24 * 60 * 60 * 1000,
            };
        }

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        relatedChannelRows.forEach((row) => {
            row.visibleReplays.forEach((replay) => {
                const start = replay.startDate.getTime();
                const end = replay.endDate.getTime();
                if (Number.isFinite(start) && start < min) min = start;
                if (Number.isFinite(end) && end > max) max = end;
            });
        });

        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            const now = Date.now();
            return {
                minTime: now - 24 * 60 * 60 * 1000,
                maxTime: now,
                span: 24 * 60 * 60 * 1000,
            };
        }

        return {
            minTime: min,
            maxTime: max,
            span: Math.max(max - min, MIN_VIEW_SPAN),
        };
    }, [relatedChannelRows]);

    const [relatedViewRange, setRelatedViewRange] = useState(() => {
        const now = Date.now();
        return {
            start: now - 24 * 60 * 60 * 1000,
            end: now,
        };
    });

    useEffect(() => {
        if (relatedBounds.minTime && relatedBounds.maxTime) {
            setRelatedViewRange({ start: relatedBounds.minTime, end: relatedBounds.maxTime });
        }
    }, [relatedBounds.minTime, relatedBounds.maxTime]);

    const resetRelatedView = useCallback(() => {
        setRelatedViewRange({ start: relatedBounds.minTime, end: relatedBounds.maxTime });
    }, [relatedBounds.minTime, relatedBounds.maxTime]);

    const relatedAxisTicks = useMemo(() => {
        if (relatedChannelRows.length === 0) return [];
        const { start, end } = relatedViewRange;
        const span = end - start;
        const tickCount = isMobile ? 5 : 10;
        const ticks = [];
        for (let i = 0; i <= tickCount; i++) {
            const time = start + (span * i) / tickCount;
            const date = new Date(time);
            ticks.push({
                date,
                label: date.toLocaleString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                }),
            });
        }
        return ticks;
    }, [relatedViewRange, isMobile, relatedChannelRows.length]);

    if (relatedChannelRows.length === 0) return null;

    return (
        <div className="relative overflow-visible rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
            <Text size="lg" fw={700} mb={6} className="text-slate-100">
                연관 타임라인
            </Text>
            <TimelineTracks
                axisTicks={relatedAxisTicks}
                channelRows={relatedChannelRows}
                viewRange={relatedViewRange}
                viewSpan={relatedViewRange.end - relatedViewRange.start}
                rowHeight={84}
                formatDateRange={formatDateRange}
                formatDuration={formatDuration}
                clamp={clamp}
                bounds={relatedBounds}
                minViewSpan={MIN_VIEW_SPAN}
                onViewRangeChange={setRelatedViewRange}
                onResetView={resetRelatedView}
                showAxisHeader={false}
                forceSidebarMobile
                videoWithChatCounts={videoWithChatCounts}
            />
        </div>
    );
};

