import React, { useEffect, useState, useMemo } from 'react';
import { Text, Stack, ScrollArea, Loader, Center, Badge, Tooltip, SegmentedControl, CopyButton, Button } from '@mantine/core';

const EventItem = ({ event, index, originalIndex, formatSeconds, onDoubleClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    const handleDoubleClick = () => {
        if (onDoubleClick) {
            onDoubleClick({ time: event.event.start_sec });
        }
    };

    return (
        <div
            style={{
                backgroundColor: isHovered ? 'rgba(51, 65, 85, 0.4)' : 'rgba(30, 41, 59, 0.3)',
                borderColor: 'rgba(71, 85, 105, 0.5)',
            }}
            className="border rounded-lg p-3 transition-colors cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDoubleClick={handleDoubleClick}
        >
            <Stack gap={4}>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge
                            size="sm"
                            radius="md"
                            variant="light"
                            color={event.event.peak_z_score > 15 ? 'red' : event.event.peak_z_score > 10 ? 'orange' : 'teal'}
                            className="flex-shrink-0"
                        >
                            {originalIndex + 1}
                        </Badge>
                        {event.title && (
                            <Text
                                size="sm"
                                fw={600}
                                className="text-slate-200 truncate"
                                title={event.title}
                            >
                                {event.title}
                            </Text>
                        )}
                    </div>
                    <Tooltip label={`${formatSeconds(event.event.start_sec)} - ${formatSeconds(event.event.end_sec)}`}>
                        <Badge size="xs" variant="outline" color="gray" className="flex-shrink-0">
                            {formatSeconds(event.event.peak_sec)}
                        </Badge>
                    </Tooltip>
                </div>
                
                {event.summary && (
                    <Text size="xs" c="dimmed" className="text-slate-300 line-clamp-2">
                        {event.summary}
                    </Text>
                )}
                
                <div className="flex items-center gap-2 mt-1">
                    <Badge size="xs" variant="dot" color="cyan">
                        Z-score: {event.event.peak_z_score.toFixed(1)}
                    </Badge>
                    <Badge size="xs" variant="dot" color="blue">
                        Peak: {event.event.peak_count}
                    </Badge>
                </div>
            </Stack>
        </div>
    );
};

export const PeakTimeline = ({ videoId, onTimelinePointDoubleClick }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortMode, setSortMode] = useState('default');

    useEffect(() => {
        if (!videoId) {
            setLoading(false);
            return;
        }

        let aborted = false;

        async function loadSummary() {
            try {
                setLoading(true);
                setError(null);

                const url = `/summary/${videoId}_chat_summary.json`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`요약 데이터를 불러오지 못했습니다. 상태 코드: ${response.status}`);
                }

                const data = await response.json();
                
                if (!aborted) {
                    setEvents(data.events || []);
                    setLoading(false);
                }
            } catch (err) {
                console.warn('Chat summary 로드 실패:', err);
                if (!aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }

        loadSummary();

        return () => {
            aborted = true;
        };
    }, [videoId]);

    const formatSeconds = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const sortedEvents = useMemo(() => {
        if (!events || events.length === 0) return [];
        
        // 기본 정렬: 원래 인덱스를 함께 저장
        const eventsWithIndex = events.map((event, index) => ({
            ...event,
            originalIndex: index,
        }));
        
        switch (sortMode) {
            case 'zscore':
                return [...eventsWithIndex].sort((a, b) => b.event.peak_z_score - a.event.peak_z_score);
            case 'peak':
                return [...eventsWithIndex].sort((a, b) => b.event.peak_count - a.event.peak_count);
            case 'default':
            default:
                return eventsWithIndex;
        }
    }, [events, sortMode]);

    const sortModeLabel = useMemo(() => {
        switch (sortMode) {
            case 'zscore':
                return 'Z-score';
            case 'peak':
                return 'Peak';
            case 'default':
            default:
                return '기본';
        }
    }, [sortMode]);

    const copyText = useMemo(() => {
        if (!videoId) return '';
        if (!sortedEvents || sortedEvents.length === 0) {
            return `[피크 타임라인]\nvideoId: ${videoId}\n정렬: ${sortModeLabel}\n(이벤트 없음)`;
        }

        const lines = [];
        lines.push('[피크 타임라인]');
        lines.push(`videoId: ${videoId}`);
        lines.push(`정렬: ${sortModeLabel}`);
        lines.push(`총 ${sortedEvents.length}개`);
        lines.push('');

        for (let i = 0; i < sortedEvents.length; i++) {
            const e = sortedEvents[i];
            const originalNo = (e.originalIndex ?? 0) + 1;
            const start = formatSeconds(e.event.start_sec);
            const end = formatSeconds(e.event.end_sec);
            const z = typeof e.event.peak_z_score === 'number' ? e.event.peak_z_score.toFixed(2) : String(e.event.peak_z_score ?? '');
            const title = (e.title ?? '').trim();
            const summary = (e.summary ?? '').trim();

            const titlePart = title ? ` ${title}` : '';
            const scorePart = ` (score=${z})`;
            lines.push(
                `- #${originalNo} [${start}~${end}]${titlePart}${scorePart}`
            );
            if (summary) {
                lines.push(`  ${summary}`);
            }
            // 마지막 이벤트가 아니면 빈 줄 추가
            if (i < sortedEvents.length - 1) {
                lines.push('');
            }
        }

        return lines.join('\n');
    }, [videoId, sortedEvents, sortModeLabel]);

    if (!videoId) {
        return null;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <Text size="sm" c="dimmed" fw={600} className="uppercase tracking-wide">
                    피크 타임라인
                </Text>
                {!loading && !error && events && events.length > 0 && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <CopyButton value={copyText} timeout={1500}>
                            {({ copied, copy }) => (
                                <Button size="xs" variant="light" color={copied ? 'blue' : 'gray'} onClick={copy}>
                                    {copied ? '복사됨' : '복사'}
                                </Button>
                            )}
                        </CopyButton>
                        <SegmentedControl
                            size="xs"
                            value={sortMode}
                            onChange={setSortMode}
                            data={[
                                { label: '기본', value: 'default' },
                                { label: 'Z-score', value: 'zscore' },
                                { label: 'Peak', value: 'peak' },
                            ]}
                        />
                    </div>
                )}
            </div>
            <div style={{ height: '800px' }}>
                {loading ? (
                    <Center h="100%">
                        <Loader size="sm" color="teal" />
                    </Center>
                ) : error ? (
                    <Center h="100%">
                        <Text size="sm" c="dimmed">
                            데이터를 불러올 수 없습니다
                        </Text>
                    </Center>
                ) : sortedEvents && sortedEvents.length > 0 ? (
                    <ScrollArea h="100%" type="auto" offsetScrollbars>
                        <Stack gap={8}>
                            {sortedEvents.map((event, index) => (
                                <EventItem
                                    key={event.originalIndex ?? index}
                                    event={event}
                                    index={index}
                                    originalIndex={event.originalIndex ?? index}
                                    formatSeconds={formatSeconds}
                                    onDoubleClick={onTimelinePointDoubleClick}
                                />
                            ))}
                        </Stack>
                    </ScrollArea>
                ) : (
                    <Center h="100%">
                        <Text size="sm" c="dimmed">
                            피크 이벤트가 없습니다
                        </Text>
                    </Center>
                )}
            </div>
        </div>
    );
};

