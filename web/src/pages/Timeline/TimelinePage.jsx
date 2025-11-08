import { useEffect, useMemo, useRef, useState } from 'react';
import timelineRaw from '../../../../data/channel_with_replays.json?raw';
import {
    Avatar,
    Badge,
    Button,
    Card,
    Checkbox,
    Container,
    Group,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';

const TIMELINE_BATCH = 20;
const MIN_SEGMENT_WIDTH_PERCENT = 0.6;
const MIN_VIEW_SPAN = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
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
    }, [filterText, selectedChannelIds]);

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
        () => filteredTimeline.slice(0, Math.min(visibleCount, filteredTimeline.length)),
        [filteredTimeline, visibleCount]
    );

    const canLoadMore = visibleCount < filteredTimeline.length;
    const isFilterActive = filterText.trim().length > 0 || selectedChannelIds.length > 0;
    const selectedCount = selectedChannelIds.length;

    const axisRef = useRef(null);
    const surfaceRef = useRef(null);
    const interactionRef = useRef(null);
    const [selectionBox, setSelectionBox] = useState(null);

    const enforceRange = (start, end) => {
        let span = end - start;
        if (!Number.isFinite(span) || span <= 0) {
            span = MIN_VIEW_SPAN;
            start = bounds.minTime;
            end = bounds.minTime + span;
        }

        if (span < MIN_VIEW_SPAN) {
            const center = start + span / 2;
            span = MIN_VIEW_SPAN;
            start = center - span / 2;
            end = center + span / 2;
        }

        if (span > bounds.span) {
            return { start: bounds.minTime, end: bounds.maxTime };
        }

        if (start < bounds.minTime) {
            start = bounds.minTime;
            end = start + span;
        }
        if (end > bounds.maxTime) {
            end = bounds.maxTime;
            start = end - span;
        }

        return { start, end };
    };

    const handlePointerDown = (event) => {
        if (event.button !== 0) return;
        const axisElement = axisRef.current;
        if (!axisElement) return;

        const rect = axisElement.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right) return;

        event.preventDefault();
        const pointerX = clamp(event.clientX - rect.left, 0, rect.width);
        const isAxisArea = axisElement.contains(event.target);
        const interactionType = event.shiftKey || isAxisArea ? 'select' : 'pan';

        interactionRef.current = {
            type: interactionType,
            pointerId: event.pointerId,
            startPx: pointerX,
            viewRangeAtStart: { ...viewRange },
        };

        if (interactionType === 'select') {
            setSelectionBox({
                leftPercent: (pointerX / rect.width) * 100,
                widthPercent: 0,
            });
        }

        surfaceRef.current?.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const axisElement = axisRef.current;
        if (!axisElement) return;

        const rect = axisElement.getBoundingClientRect();
        const pointerX = clamp(event.clientX - rect.left, 0, rect.width);

        if (interaction.type === 'pan') {
            const span = interaction.viewRangeAtStart.end - interaction.viewRangeAtStart.start;
            if (span <= 0) return;

            const deltaPx = pointerX - interaction.startPx;
            const deltaTime = (deltaPx / rect.width) * span;

            const nextStart = interaction.viewRangeAtStart.start - deltaTime;
            const nextEnd = interaction.viewRangeAtStart.end - deltaTime;
            setViewRange(enforceRange(nextStart, nextEnd));
        } else {
            const startPx = interaction.startPx;
            const leftPx = Math.min(startPx, pointerX);
            const rightPx = Math.max(startPx, pointerX);
            const leftPercent = (leftPx / rect.width) * 100;
            const widthPercent = ((rightPx - leftPx) / rect.width) * 100;

            setSelectionBox({
                leftPercent: clamp(leftPercent, 0, 100),
                widthPercent: clamp(widthPercent, 0, 100),
            });
        }
    };

    const finalizeInteraction = (event) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const axisElement = axisRef.current;
        if (!axisElement) {
            interactionRef.current = null;
            setSelectionBox(null);
            return;
        }

        const rect = axisElement.getBoundingClientRect();
        const pointerX = clamp(event.clientX - rect.left, 0, rect.width);

        if (interaction.type === 'select') {
            const startPx = interaction.startPx;
            const leftPx = Math.min(startPx, pointerX);
            const rightPx = Math.max(startPx, pointerX);

            if (Math.abs(rightPx - leftPx) > 6) {
                const baseStart = interaction.viewRangeAtStart.start;
                const baseEnd = interaction.viewRangeAtStart.end;
                const baseSpan = baseEnd - baseStart;

                const newStart = baseStart + (leftPx / rect.width) * baseSpan;
                const newEnd = baseStart + (rightPx / rect.width) * baseSpan;
                setViewRange(enforceRange(newStart, newEnd));
            }
        }

        interactionRef.current = null;
        setSelectionBox(null);
        try {
            surfaceRef.current?.releasePointerCapture(event.pointerId);
        } catch {
            // ignore
        }
    };

    const handleResetView = () => {
        setViewRange({ start: bounds.minTime, end: bounds.maxTime });
    };

    const handleResetFilters = () => {
        setFilterText('');
        setSelectedChannelIds([]);
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
                    <aside className="sticky top-24 self-start">
                        <Card
                            radius="xl"
                            padding="lg"
                            withBorder
                            className="flex flex-col border border-slate-800/60 bg-slate-900/70 backdrop-blur"
                            style={{ height: 'calc(100vh - 6rem)' }}
                        >
                            <Stack gap="sm" className="h-full">
                                <div>
                                    <Text size="sm" fw={700}>
                                        스트리머 필터
                                    </Text>
                                    <Text size="xs" c="dimmed" mt={4}>
                                        검색하거나 체크해 원하는 스트리머만 타임라인에 표시해 보세요.
                                    </Text>
                                </div>

                                <TextInput
                                    value={filterText}
                                    onChange={(event) => setFilterText(event.currentTarget.value)}
                                    placeholder="스트리머 검색"
                                    radius="lg"
                                    size="sm"
                                    variant="filled"
                                />

                                <Group justify="space-between" align="center" gap="xs">
                                    <Badge size="sm" radius="lg" variant="light" color={selectedCount ? 'teal' : 'gray'}>
                                        선택 {selectedCount.toLocaleString('ko-KR')}명
                                    </Badge>
                                    <Group gap="xs">
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            size="xs"
                                            radius="lg"
                                            onClick={handleResetFilters}
                                            disabled={!isFilterActive}
                                        >
                                            필터 초기화
                                        </Button>
                                    </Group>
                                </Group>

                                <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
                                    <Stack gap="xs" pr="sm">
                                        {sidebarChannels.length === 0 ? (
                                            <div className="flex h-32 items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/40">
                                                <Text size="xs" c="dimmed">
                                                    검색 결과가 없습니다.
                                                </Text>
                                            </div>
                                        ) : (
                                            sidebarChannels.map((channel) => {
                                                const id = channel.channelId ?? channel.name;
                                                const followerLabel = Number(channel.follower ?? 0).toLocaleString('ko-KR');
                                                return (
                                                    <Checkbox
                                                        key={id}
                                                        checked={selectedChannelIds.includes(id)}
                                                        onChange={() => toggleChannelSelection(id)}
                                                        radius="md"
                                                        className="rounded-lg px-2 py-2 transition hover:bg-slate-800/50"
                                                        styles={{
                                                            input: { cursor: 'pointer' },
                                                            label: { width: '100%' },
                                                        }}
                                                        label={
                                                            <Group gap="sm" wrap="nowrap">
                                                                <Avatar src={channel.image} radius="xl" size={32} alt={channel.name}>
                                                                    {getInitials(channel.name)}
                                                                </Avatar>
                                                                <div className="min-w-0">
                                                                    <Text size="sm" fw={600} className="truncate">
                                                                        {channel.name}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        팔로워 {followerLabel}
                                                                    </Text>
                                                                </div>
                                                            </Group>
                                                        }
                                                    />
                                                );
                                            })
                                        )}
                                    </Stack>
                                </ScrollArea>
                            </Stack>
                        </Card>
                    </aside>

                    <Stack gap="xl">
                        <Group justify="space-between" align="flex-end">
                            <div>
                                <Title order={1} size={36} fw={800}>
                                    스트리머 타임라인
                                </Title>
                                <Text size="md" c="dimmed" mt={6}>
                                    팔로워 수 순으로 정렬된 스트리머 방송 시간을 하나의 축에서 비교해 보세요.
                                </Text>
                                <Text size="xs" c="dimmed" mt={6}>
                                    현재 {filteredTimeline.length.toLocaleString('ko-KR')}명의 스트리머가 조건에 맞습니다.
                                </Text>
                            </div>
                            <Group gap="xs">
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    radius="lg"
                                    size="sm"
                                    onClick={handleResetView}
                                    disabled={!isZoomed}
                                >
                                    전체 범위 보기
                                </Button>
                            </Group>
                        </Group>
                        <Text size="xs" c="dimmed">
                            좌측 필터에서 스트리머를 선택하거나 검색할 수 있습니다. 시간축(회색 영역)을 드래그하면 확대, 타임라인 영역을 드래그하면 이동하며 Shift+드래그도 확대 기능으로 동작합니다. 더블클릭 시 전체 범위로 복귀합니다.
                        </Text>

                        <div
                            ref={surfaceRef}
                            className="relative"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={finalizeInteraction}
                            onPointerCancel={finalizeInteraction}
                            onDoubleClick={handleResetView}
                        >
                            <div className="sticky top-20 z-20 bg-slate-950/90 pb-3 pt-4 backdrop-blur">
                                <div className="grid grid-cols-[220px_minmax(0,1fr)] items-end gap-4 text-xs text-slate-400">
                                    <Text size="xs" fw={600} c="dimmed" className="uppercase tracking-wide">
                                        Streamer
                                    </Text>
                                    <div ref={axisRef} className="relative h-12">
                                        {selectionBox ? (
                                            <div
                                                className="pointer-events-none absolute inset-y-0 rounded-md bg-teal-400/10 ring-1 ring-teal-400/40"
                                                style={{
                                                    left: `${clamp(selectionBox.leftPercent, 0, 100)}%`,
                                                    width: `${clamp(selectionBox.widthPercent, 0, 100)}%`,
                                                }}
                                            />
                                        ) : null}
                                        <div className="absolute bottom-0 left-0 right-0 border-b border-slate-800" />
                                        {axisTicks.map((tick) => {
                                            const position = ((tick.date.getTime() - viewRange.start) / viewSpan) * 100;
                                            return (
                                                <div
                                                    key={tick.date.getTime()}
                                                    className="absolute bottom-0 flex translate-x-[-50%] flex-col items-center"
                                                    style={{ left: `${clamp(position, 0, 100)}%` }}
                                                >
                                                    <div className="h-3 w-px bg-slate-700" />
                                                    <span className="mt-1 whitespace-nowrap text-[11px] text-slate-400">
                                                        {tick.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-y-3">
                                {visibleChannels.length === 0 ? (
                                    <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-800/60 bg-slate-900/60">
                                        <Text size="sm" c="dimmed">
                                            조건에 맞는 스트리머가 없습니다. 필터를 조정해 보세요.
                                        </Text>
                                    </div>
                                ) : (
                                    <>
                                        {visibleChannels.map((channel) => {
                                            const visibleReplays = channel.replays.filter((replay) => {
                                                const start = replay.startDate.getTime();
                                                const end = replay.endDate.getTime();
                                                return end >= viewRange.start && start <= viewRange.end;
                                            });

                                            return (
                                                <div
                                                    key={channel.channelId ?? channel.name}
                                                    className="grid grid-cols-[220px_minmax(0,1fr)] items-center gap-4"
                                                >
                                                    <Group gap="sm" wrap="nowrap">
                                                        <Avatar
                                                            src={channel.image}
                                                            radius="xl"
                                                            size={46}
                                                            alt={channel.name}
                                                            className="shadow-md ring-1 ring-slate-800/60"
                                                        >
                                                            {getInitials(channel.name)}
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <Text size="sm" fw={600} className="truncate">
                                                                {channel.name}
                                                            </Text>
                                                            <Group gap={6} mt={4} wrap="wrap">
                                                                <Badge size="sm" radius="lg" variant="light" color="teal">
                                                                    팔로워 {Number(channel.follower ?? 0).toLocaleString('ko-KR')}
                                                                </Badge>
                                                                <Badge size="sm" radius="lg" variant="light" color="blue">
                                                                    리플레이 {channel.replays.length.toLocaleString('ko-KR')}개
                                                                </Badge>
                                                            </Group>
                                                        </div>
                                                    </Group>

                                                    <div className="relative h-12 overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60">
                                                        <div className="pointer-events-none absolute inset-0">
                                                            {selectionBox ? (
                                                                <div
                                                                    className="absolute inset-y-1 rounded-md bg-teal-300/8 ring-1 ring-teal-400/30"
                                                                    style={{
                                                                        left: `${clamp(selectionBox.leftPercent, 0, 100)}%`,
                                                                        width: `${clamp(selectionBox.widthPercent, 0, 100)}%`,
                                                                    }}
                                                                />
                                                            ) : null}
                                                            {axisTicks.map((tick) => {
                                                                const position = ((tick.date.getTime() - viewRange.start) / viewSpan) * 100;
                                                                return (
                                                                    <div
                                                                        key={tick.date.getTime()}
                                                                        className="absolute inset-y-0 border-l border-slate-800/40"
                                                                        style={{ left: `${clamp(position, 0, 100)}%` }}
                                                                    />
                                                                );
                                                            })}
                                                        </div>

                                                        {visibleReplays.map((replay, index) => {
                                                            const start = replay.startDate.getTime();
                                                            const end = replay.endDate.getTime();
                                                            const startClamped = Math.max(start, viewRange.start);
                                                            const endClamped = Math.min(Math.max(end, startClamped), viewRange.end);
                                                            if (endClamped <= startClamped) return null;

                                                            const left = clamp(((startClamped - viewRange.start) / viewSpan) * 100, 0, 100);
                                                            const rawWidth = ((endClamped - startClamped) / viewSpan) * 100;
                                                            const maxWidth = Math.max(100 - left, 0);
                                                            const width = Math.min(Math.max(rawWidth, MIN_SEGMENT_WIDTH_PERCENT), maxWidth);

                                                            return (
                                                                <div
                                                                    key={`${channel.channelId ?? channel.name}-${index}-${replay.startDate.toISOString()}`}
                                                                    className="absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-full bg-teal-400/35 shadow-[0_0_0_1px_rgba(45,212,191,0.45)] backdrop-blur-sm transition hover:bg-teal-300/50"
                                                                    style={{
                                                                        left: `${left}%`,
                                                                        width: `${width}%`,
                                                                    }}
                                                                    title={`${replay.title}\n${formatDateRange(replay.startDate, replay.endDate)}${formatDuration(replay.durationMs) ? ` · ${formatDuration(replay.durationMs)}` : ''
                                                                        }`}
                                                                >
                                                                    <Text
                                                                        size="xs"
                                                                        fw={600}
                                                                        className="w-full truncate px-3 text-teal-50 drop-shadow-[0_0_6px_rgba(15,118,110,0.4)]"
                                                                    >
                                                                        {replay.title}
                                                                    </Text>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </div>

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

