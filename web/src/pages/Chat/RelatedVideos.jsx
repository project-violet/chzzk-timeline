import React, { useMemo } from 'react';
import { Text, Stack, Group, Badge } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mantine/hooks';
import { formatDateRange, formatDuration } from './utils.js';

export const RelatedVideos = ({ videos = [] }) => {
    const navigate = useNavigate();
    const isMobile = useMediaQuery('(max-width: 768px)');

    const relatedVideos = useMemo(() => {
        if (!Array.isArray(videos)) return [];
        return videos.filter(Boolean);
    }, [videos]);

    if (!relatedVideos.length) {
        return null;
    }

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
            <Text size="lg" fw={700} mb={6} className="text-slate-100">
                연관 영상
            </Text>
            <Stack gap={8}>
                {relatedVideos.map((video) => (
                    <div
                        key={video.video_no}
                        className={`flex ${isMobile ? 'flex-col' : 'items-start'} gap-6 p-4 rounded-xl border border-slate-800/50 bg-slate-800/30 cursor-pointer hover:bg-slate-800/50 transition-colors`}
                        onClick={() => navigate(`/chat/${video.video_no}`)}
                    >
                        {(() => {
                            const thumbnailSrc =
                                video.thumbnail ||
                                video.replay?.thumbnailUrl ||
                                video.replay?.thumbnail;
                            if (!thumbnailSrc) return null;
                            return (
                                <img
                                    src={thumbnailSrc}
                                    alt={video.title ? `${video.title} 썸네일` : '비디오 썸네일'}
                                    className={`${isMobile ? 'w-full' : 'h-52 w-80'} flex-shrink-0 rounded-2xl border border-slate-800/60 object-cover shadow-inner shadow-slate-900/40`}
                                    loading="lazy"
                                />
                            );
                        })()}
                        <div className="flex-1 min-w-0 space-y-2">
                            <Text size="sm" c="dimmed" fw={600} className="uppercase tracking-wide">
                                {video.channel?.name || video.channel_name}
                            </Text>
                            <Text size="md" fw={600} className="text-slate-100">
                                {video.replay?.title || video.title}
                            </Text>
                            {video.replay?.startDate && video.replay?.endDate ? (
                                <Text size="sm" c="dimmed">
                                    {formatDateRange(
                                        new Date(video.replay.startDate),
                                        new Date(video.replay.endDate)
                                    )}
                                </Text>
                            ) : video.replay?.publishDate ? (
                                <Text size="sm" c="dimmed">
                                    {new Date(video.replay.publishDate).toLocaleString('ko-KR')}
                                </Text>
                            ) : null}
                            {video.replay?.durationSec ? (
                                <Text size="sm" c="dimmed">
                                    {formatDuration(video.replay.durationSec)}
                                </Text>
                            ) : video.replay?.durationMs ? (
                                <Text size="sm" c="dimmed">
                                    {formatDuration(video.replay.durationMs / 1000)}
                                </Text>
                            ) : null}
                            {video.replay?.categoryKo ? (
                                <Badge size="md" radius="md" variant="light" color="violet" className="inline-flex">
                                    {video.replay.categoryKo}
                                </Badge>
                            ) : null}
                            {Array.isArray(video.replay?.tags) && video.replay.tags.length > 0 ? (
                                <Group gap={8} wrap="wrap" mt={4}>
                                    {video.replay.tags
                                        .filter(Boolean)
                                        .slice(0, 8)
                                        .map((tag) => (
                                            <Badge key={tag} size="md" radius="md" variant="light" color="gray">
                                                #{tag}
                                            </Badge>
                                        ))}
                                </Group>
                            ) : null}
                            <Group gap="sm" mt={4}>
                                <Badge size="sm" variant="light" color="teal">
                                    연관도: {(video.similarity * 100).toFixed(1)}%
                                </Badge>
                            </Group>
                        </div>
                    </div>
                ))}
            </Stack>
        </div>
    );
};

