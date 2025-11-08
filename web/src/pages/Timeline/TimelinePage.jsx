import { useCallback, useEffect, useMemo, useState } from 'react';
import timelineRaw from '../../../../data/channel_with_replays.json?raw';
import { Button, Container, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { StreamerFilter } from './StreamerFilter.jsx';
import { TimelineTracks } from './TimelineTracks.jsx';

const TIMELINE_BATCH = 20;
const MIN_VIEW_SPAN = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ROW_HEIGHT = 84;

const parseDate = (value) => {
    if (!value) return null;
    const safe = value.replace(' ', 'T');
    const date = new Date(safe);
    return Number.isNaN(date.getTime()) ? null : date;
};

const DATE_RANGE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const MONTH_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
});

const DAY_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
});

const DAY_HOUR_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
});

const HOUR_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    hour12: false,
});

const HOUR_MINUTE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const DAY_HOUR_MINUTE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const formatDateRange = (startDate, endDate) => {
    if (!startDate && !endDate) return '시간 정보 없음';
    if (startDate && !endDate) return `${DATE_RANGE_FORMAT.format(startDate)} 시작`;
    if (!startDate && endDate) return `${DATE_RANGE_FORMAT.format(endDate)} 종료`;

    return `${DATE_RANGE_FORMAT.format(startDate)} ~ ${DATE_RANGE_FORMAT.format(endDate)}`;
};

const formatDuration = (durationMs) => {
    if (typeof durationMs !== 'number') return null;

    const totalMinutes = Math.max(Math.round(durationMs / MINUTE_MS), 0);
    if (totalMinutes <= 0) return '1분 미만';

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}시간`);
    if (minutes > 0) parts.push(`${minutes}분`);

    return parts.join(' ') || '1분 미만';
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTickConfig = (spanMs) => {
    if (spanMs > 540 * DAY_MS) return { unit: 'month', step: 3, showDate: true };
    if (spanMs > 270 * DAY_MS) return { unit: 'month', step: 2, showDate: true };
    if (spanMs > 120 * DAY_MS) return { unit: 'month', step: 1, showDate: true };
    if (spanMs > 45 * DAY_MS) return { unit: 'day', step: 5, showDate: true };
    if (spanMs > 21 * DAY_MS) return { unit: 'day', step: 2, showDate: true };
    if (spanMs > 7 * DAY_MS) return { unit: 'day', step: 1, showDate: true };
    if (spanMs > 48 * HOUR_MS) return { unit: 'hour', step: 6, showDate: true };
    if (spanMs > 24 * HOUR_MS) return { unit: 'hour', step: 3, showDate: true };
    if (spanMs > 12 * HOUR_MS) return { unit: 'hour', step: 2, showDate: true };
    if (spanMs > 6 * HOUR_MS) return { unit: 'hour', step: 1, showDate: true };
    if (spanMs > 3 * HOUR_MS) return { unit: 'minute', step: 30, showDate: true };
    if (spanMs > 2 * HOUR_MS) return { unit: 'minute', step: 15, showDate: true };
    if (spanMs > 60 * MINUTE_MS) return { unit: 'minute', step: 5, showDate: true };
    if (spanMs > 30 * MINUTE_MS) return { unit: 'minute', step: 2, showDate: true };
    return { unit: 'minute', step: 1, showDate: spanMs > 15 * MINUTE_MS };
};

const alignToStep = (time, unit, step) => {
    const aligned = new Date(time);

    if (unit === 'month') {
        aligned.setDate(1);
        aligned.setHours(0, 0, 0, 0);
        const month = aligned.getMonth();
        const alignedMonth = Math.floor(month / step) * step;
        aligned.setMonth(alignedMonth);
    } else if (unit === 'day') {
        aligned.setHours(0, 0, 0, 0);
        const day = aligned.getDate();
        const alignedDay = day - ((day - 1) % step);
        aligned.setDate(alignedDay);
    } else if (unit === 'hour') {
        aligned.setMinutes(0, 0, 0);
        const hour = aligned.getHours();
        aligned.setHours(Math.floor(hour / step) * step);
    } else {
        aligned.setSeconds(0, 0);
        const minute = aligned.getMinutes();
        aligned.setMinutes(Math.floor(minute / step) * step);
    }

    return aligned;
};

const incrementDate = (date, unit, step) => {
    if (unit === 'month') {
        date.setMonth(date.getMonth() + step);
    } else if (unit === 'day') {
        date.setDate(date.getDate() + step);
    } else if (unit === 'hour') {
        date.setHours(date.getHours() + step);
    } else {
        date.setMinutes(date.getMinutes() + step);
    }
};

const generateTicks = (start, end, unit, step) => {
    const ticks = [];
    if (!(Number.isFinite(start) && Number.isFinite(end)) || start >= end) return ticks;

    const current = alignToStep(start, unit, step);

    while (current.getTime() > start) {
        incrementDate(current, unit, -step);
    }

    while (current.getTime() <= end) {
        const tickTime = current.getTime();
        if (tickTime >= start) {
            ticks.push(new Date(tickTime));
        }
        incrementDate(current, unit, step);
    }

    if (!ticks.length || ticks[ticks.length - 1].getTime() < end) {
        ticks.push(new Date(end));
    }

    return ticks;
};

const formatTickLabel = (date, unit, showDate, spanMs) => {
    if (unit === 'month') {
        return MONTH_FORMAT.format(date);
    }
    if (unit === 'day') {
        return DAY_FORMAT.format(date);
    }
    if (unit === 'hour') {
        return showDate && spanMs > 6 * HOUR_MS ? DAY_HOUR_FORMAT.format(date) : `${HOUR_FORMAT.format(date)}시`;
    }

    if (showDate && spanMs > 2 * HOUR_MS) {
        return DAY_HOUR_MINUTE_FORMAT.format(date);
    }
    return HOUR_MINUTE_FORMAT.format(date);
};

const TimelinePage = () => {
    const timelineData = useMemo(() => {
        const parsed = JSON.parse(timelineRaw ?? '[]');
        return parsed
            .map((channel) => {
                const replays = Array.isArray(channel?.replays)
                    ? channel.replays
                        .map((replay) => {
                            const startDate = parseDate(replay.start);
                            const endDate = parseDate(replay.end);
                            if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) return null;
                            return {
                                ...replay,
                                startDate,
                                endDate,
                                durationMs: endDate.getTime() - startDate.getTime(),
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
                    : [];

                return { ...channel, replays };
            })
            .sort((a, b) => (b?.follower ?? 0) - (a?.follower ?? 0));
    }, []);

    const bounds = useMemo(() => {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        timelineData.forEach((channel) => {
            channel.replays.forEach((replay) => {
                const start = replay.startDate.getTime();
                const end = replay.endDate.getTime();
                if (Number.isFinite(start) && start < min) min = start;
                if (Number.isFinite(end) && end > max) max = end;
            });
        });

        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
            const now = Date.now();
            return {
                minTime: now - DAY_MS,
                maxTime: now,
                span: Math.max(DAY_MS, MIN_VIEW_SPAN),
            };
        }

        return {
            minTime: min,
            maxTime: max,
            span: Math.max(max - min, MIN_VIEW_SPAN),
        };
    }, [timelineData]);

    const [viewRange, setViewRange] = useState(() => ({
        start: bounds.minTime,
        end: bounds.maxTime,
    }));

    useEffect(() => {
        setViewRange({ start: bounds.minTime, end: bounds.maxTime });
    }, [bounds.minTime, bounds.maxTime]);

    const [filterText, setFilterText] = useState('');
    const [selectedChannelIds, setSelectedChannelIds] = useState([]);
    const [replayTitleFilter, setReplayTitleFilter] = useState('');

    const filteredTimeline = useMemo(() => {
        const text = filterText.trim().toLowerCase();
        const selectedSet = new Set(selectedChannelIds);

        return timelineData.filter((channel) => {
            const id = channel.channelId ?? channel.name;
            const matchesText = !text || channel.name.toLowerCase().includes(text);
            const matchesSelection = selectedChannelIds.length === 0 || selectedSet.has(id);
            return matchesText && matchesSelection;
        });
    }, [timelineData, filterText, selectedChannelIds]);

    const replayKeywords = useMemo(
        () =>
            replayTitleFilter
                .split(',')
                .map((keyword) => keyword.trim().toLowerCase())
                .filter(Boolean),
        [replayTitleFilter]
    );

    const replayFilteredTimeline = useMemo(() => {
        if (replayKeywords.length === 0) return filteredTimeline;

        return filteredTimeline
            .map((channel) => {
                const matchingReplays = channel.replays.filter((replay) => {
                    const title = (replay?.title ?? '').toLowerCase();
                    return replayKeywords.every((keyword) => title.includes(keyword));
                });

                if (matchingReplays.length === 0) return null;
                return { ...channel, replays: matchingReplays };
            })
            .filter(Boolean);
    }, [filteredTimeline, replayKeywords]);

    const sidebarChannels = useMemo(() => {
        const text = filterText.trim().toLowerCase();
        if (!text) return timelineData;

        const selectedSet = new Set(selectedChannelIds);
        return timelineData.filter((channel) => {
            const id = channel.channelId ?? channel.name;
            if (selectedSet.has(id)) return true;
            return channel.name.toLowerCase().includes(text);
        });
    }, [timelineData, filterText, selectedChannelIds]);

    const [visibleCount, setVisibleCount] = useState(TIMELINE_BATCH);

    useEffect(() => {
        setVisibleCount(TIMELINE_BATCH);
    }, [filterText, selectedChannelIds, replayKeywords]);

    const viewSpan = Math.max(viewRange.end - viewRange.start, MIN_VIEW_SPAN);
    const tickConfig = useMemo(() => getTickConfig(viewSpan), [viewSpan]);
    const axisTicks = useMemo(
        () =>
            generateTicks(viewRange.start, viewRange.end, tickConfig.unit, tickConfig.step).map((date) => ({
                date,
                label: formatTickLabel(date, tickConfig.unit, tickConfig.showDate, viewSpan),
            })),
        [viewRange.start, viewRange.end, tickConfig.unit, tickConfig.step, tickConfig.showDate, viewSpan]
    );

    const visibleChannels = useMemo(
        () => replayFilteredTimeline.slice(0, Math.min(visibleCount, replayFilteredTimeline.length)),
        [replayFilteredTimeline, visibleCount]
    );

    const channelRows = useMemo(
        () =>
            visibleChannels.map((channel) => ({
                channel,
                visibleReplays: channel.replays.filter((replay) => {
                    const start = replay.startDate.getTime();
                    const end = replay.endDate.getTime();
                    return end >= viewRange.start && start <= viewRange.end;
                }),
            })),
        [visibleChannels, viewRange.start, viewRange.end]
    );

    const canLoadMore = visibleCount < replayFilteredTimeline.length;
    const isFilterActive =
        filterText.trim().length > 0 || selectedChannelIds.length > 0 || replayTitleFilter.trim().length > 0;
    const selectedCount = selectedChannelIds.length;

    const resetView = useCallback(() => {
        setViewRange({ start: bounds.minTime, end: bounds.maxTime });
    }, [bounds.maxTime, bounds.minTime]);

    const handleResetFilters = () => {
        setFilterText('');
        setSelectedChannelIds([]);
        setReplayTitleFilter('');
    };

    const toggleChannelSelection = (id) => {
        setSelectedChannelIds((prev) => {
            if (prev.includes(id)) {
                return prev.filter((value) => value !== id);
            }
            return [...prev, id];
        });
    };

    const isZoomed =
        Math.round(viewRange.start) !== Math.round(bounds.minTime) ||
        Math.round(viewRange.end) !== Math.round(bounds.maxTime);

    return (
        <div className="min-h-screen bg-slate-950/95 pb-20 pt-28 text-slate-100">
            <Container size="100%">
                <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
                    <StreamerFilter
                        filterText={filterText}
                        onFilterTextChange={setFilterText}
                        sidebarChannels={sidebarChannels}
                        selectedChannelIds={selectedChannelIds}
                        onToggleChannel={toggleChannelSelection}
                        onResetFilters={handleResetFilters}
                        isFilterActive={isFilterActive}
                        selectedCount={selectedCount}
                    />
                    <Stack gap="xl">
                        <Group justify="space-between" align="flex-end">
                            <div>
                                <Title order={1} size={36} fw={800}>
                                    치지직 타임라인
                                </Title>
                                <Text size="md" c="dimmed" mt={6}>
                                    팔로워 수 순으로 정렬된 스트리머 방송 시간을 하나의 축에서 비교해 보세요.
                                </Text>
                                <Text size="xs" c="dimmed" mt={6}>
                                    현재 {replayFilteredTimeline.length.toLocaleString('ko-KR')}명의 스트리머가 조건에 맞습니다.
                                </Text>
                            </div>
                            <Group gap="xs">
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    radius="lg"
                                    size="sm"
                                    onClick={resetView}
                                    disabled={!isZoomed}
                                >
                                    전체 범위 보기
                                </Button>
                            </Group>
                        </Group>
                        <Group align="flex-end" gap="sm" wrap="wrap">
                            <TextInput
                                label="방제 키워드 필터"
                                placeholder="쉼표(,)로 구분된 키워드를 모두 포함하는 리플레이만 표시"
                                value={replayTitleFilter}
                                onChange={(event) => setReplayTitleFilter(event.currentTarget.value)}
                                radius="lg"
                                size="sm"
                                className="w-full max-w-xl"
                            />
                            <Button
                                variant="subtle"
                                color="gray"
                                radius="lg"
                                size="xs"
                                onClick={() => setReplayTitleFilter('')}
                                disabled={replayKeywords.length === 0}
                            >
                                키워드 초기화
                            </Button>
                        </Group>

                        <Text size="xs" c="dimmed">
                            좌측 필터에서 스트리머를 선택하거나 검색할 수 있습니다. 시간축(회색 영역)을 드래그하면 확대, 타임라인 영역을 드래그하면 이동하며 Shift+드래그도 확대 기능으로 동작합니다. 더블클릭 시 전체 범위로 복귀합니다. 아래 키워드 필터를 사용하면 입력한 모든 키워드를 포함한 방송 제목만 표시됩니다.
                        </Text>

                        <TimelineTracks
                            axisTicks={axisTicks}
                            channelRows={channelRows}
                            viewRange={viewRange}
                            viewSpan={viewSpan}
                            rowHeight={ROW_HEIGHT}
                            formatDateRange={formatDateRange}
                            formatDuration={formatDuration}
                            clamp={clamp}
                            bounds={bounds}
                            minViewSpan={MIN_VIEW_SPAN}
                            onViewRangeChange={setViewRange}
                            onResetView={resetView}
                        />

                        {canLoadMore ? (
                            <Button
                                variant="light"
                                color="teal"
                                radius="lg"
                                size="md"
                                className="mx-auto mt-4 w-full max-w-sm"
                                onClick={() => setVisibleCount((count) => count + TIMELINE_BATCH)}
                            >
                                더 보기
                            </Button>
                        ) : null}
                    </Stack>
                </div>
            </Container>
        </div>
    );
};

export default TimelinePage;

