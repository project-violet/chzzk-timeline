import { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Badge, Group, Text } from '@mantine/core';

const MIN_SEGMENT_WIDTH_PERCENT = 0.6;

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

export function TimelineTracks({
    axisTicks,
    channelRows,
    viewRange,
    viewSpan,
    rowHeight,
    formatDateRange,
    formatDuration,
    clamp,
    bounds,
    minViewSpan,
    onViewRangeChange,
    onResetView,
}) {
    const axisRef = useRef(null);
    const surfaceRef = useRef(null);
    const interactionRef = useRef(null);
    const [selectionBox, setSelectionBox] = useState(null);

    const { minTime, maxTime, span: boundsSpan } = bounds;

    const enforceRange = useCallback(
        (start, end) => {
            let nextStart = start;
            let nextEnd = end;
            let span = nextEnd - nextStart;

            if (!Number.isFinite(span) || span <= 0) {
                span = Math.max(minViewSpan, 0);
                nextStart = minTime;
                nextEnd = minTime + span;
            }

            if (span < minViewSpan) {
                const center = nextStart + span / 2;
                span = minViewSpan;
                nextStart = center - span / 2;
                nextEnd = center + span / 2;
            }

            if (span > boundsSpan) {
                return { start: minTime, end: maxTime };
            }

            if (nextStart < minTime) {
                nextStart = minTime;
                nextEnd = nextStart + span;
            }
            if (nextEnd > maxTime) {
                nextEnd = maxTime;
                nextStart = nextEnd - span;
            }

            return { start: nextStart, end: nextEnd };
        },
        [boundsSpan, maxTime, minTime, minViewSpan]
    );

    const handlePointerDown = useCallback(
        (event) => {
            if (event.button !== 0) return;
            const axisElement = axisRef.current;
            const surfaceElement = surfaceRef.current;
            if (!axisElement || !surfaceElement) return;

            const rect = axisElement.getBoundingClientRect();
            if (rect.width <= 0 || event.clientX < rect.left || event.clientX > rect.right) return;

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

            surfaceElement.setPointerCapture?.(event.pointerId);
        },
        [clamp, viewRange]
    );

    const handlePointerMove = useCallback(
        (event) => {
            const interaction = interactionRef.current;
            if (!interaction || interaction.pointerId !== event.pointerId) return;

            const axisElement = axisRef.current;
            if (!axisElement) return;

            const rect = axisElement.getBoundingClientRect();
            if (rect.width <= 0) return;

            const pointerX = clamp(event.clientX - rect.left, 0, rect.width);

            if (interaction.type === 'pan') {
                const span = interaction.viewRangeAtStart.end - interaction.viewRangeAtStart.start;
                if (span <= 0) return;

                const deltaPx = pointerX - interaction.startPx;
                const deltaTime = (deltaPx / rect.width) * span;

                const nextStart = interaction.viewRangeAtStart.start - deltaTime;
                const nextEnd = interaction.viewRangeAtStart.end - deltaTime;

                onViewRangeChange(enforceRange(nextStart, nextEnd));
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
        },
        [clamp, enforceRange, onViewRangeChange]
    );

    const finalizeInteraction = useCallback(
        (event) => {
            const interaction = interactionRef.current;
            if (!interaction || interaction.pointerId !== event.pointerId) return;

            const axisElement = axisRef.current;
            const surfaceElement = surfaceRef.current;
            if (!axisElement || !surfaceElement) {
                interactionRef.current = null;
                setSelectionBox(null);
                return;
            }

            const rect = axisElement.getBoundingClientRect();
            if (rect.width > 0) {
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
                        onViewRangeChange(enforceRange(newStart, newEnd));
                    }
                }
            }

            interactionRef.current = null;
            setSelectionBox(null);
            try {
                surfaceElement.releasePointerCapture?.(event.pointerId);
            } catch {
                // ignore
            }
        },
        [clamp, enforceRange, onViewRangeChange]
    );

    const handleResetView = useCallback(() => {
        interactionRef.current = null;
        setSelectionBox(null);
        onResetView();
    }, [onResetView]);

    if (channelRows.length === 0) {
        return (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-800/60 bg-slate-900/60">
                <Text size="sm" c="dimmed">
                    조건에 맞는 스트리머가 없습니다. 필터를 조정해 보세요.
                </Text>
            </div>
        );
    }

    return (
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

            <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4">
                <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60">
                    <div className="divide-y divide-slate-800/60">
                        {channelRows.map(({ channel }) => (
                            <Group
                                key={channel.channelId ?? channel.name}
                                gap="sm"
                                wrap="nowrap"
                                className="px-4"
                                style={{ height: rowHeight }}
                            >
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
                        ))}
                    </div>
                </div>

                <div
                    className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60"
                    style={{ height: channelRows.length * rowHeight }}
                >
                    <div className="pointer-events-none absolute inset-0">
                        {selectionBox ? (
                            <div
                                className="absolute inset-y-2 rounded-md bg-teal-300/6 ring-1 ring-teal-400/30"
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
                                    key={`v-${tick.date.getTime()}`}
                                    className="absolute inset-y-0 border-l border-slate-800/40"
                                    style={{ left: `${clamp(position, 0, 100)}%` }}
                                />
                            );
                        })}
                        {channelRows.map((_, rowIndex) => (
                            <div
                                key={`h-${rowIndex}`}
                                className="absolute left-0 right-0 border-t border-slate-800/35"
                                style={{ top: rowIndex * rowHeight }}
                            />
                        ))}
                        <div
                            className="absolute left-0 right-0 border-t border-slate-800/35"
                            style={{ top: channelRows.length * rowHeight }}
                        />
                    </div>

                    {channelRows.map(({ channel, visibleReplays }, rowIndex) =>
                        visibleReplays.map((replay, index) => {
                            const start = replay.startDate.getTime();
                            const end = replay.endDate.getTime();
                            const startClamped = Math.max(start, viewRange.start);
                            const endClamped = Math.min(Math.max(end, startClamped), viewRange.end);
                            if (endClamped <= startClamped) return null;

                            const left = clamp(((startClamped - viewRange.start) / viewSpan) * 100, 0, 100);
                            const rawWidth = ((endClamped - startClamped) / viewSpan) * 100;
                            const maxWidth = Math.max(100 - left, 0);
                            const width = Math.min(Math.max(rawWidth, MIN_SEGMENT_WIDTH_PERCENT), maxWidth);
                            const top = rowIndex * rowHeight + rowHeight / 2;

                            return (
                                <div
                                    key={`${channel.channelId ?? channel.name}-${index}-${replay.startDate.toISOString()}`}
                                    className="absolute flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-full bg-teal-400/35 shadow-[0_0_0_1px_rgba(45,212,191,0.45)] backdrop-blur-sm transition hover:bg-teal-300/50"
                                    style={{
                                        left: `${left}%`,
                                        width: `${width}%`,
                                        top,
                                    }}
                                    title={`${replay.title}\n${formatDateRange(replay.startDate, replay.endDate)}${formatDuration(replay.durationMs) ? ` · ${formatDuration(replay.durationMs)}` : ''}`}
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
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

TimelineTracks.propTypes = {
    axisTicks: PropTypes.arrayOf(PropTypes.shape({ date: PropTypes.instanceOf(Date), label: PropTypes.string })).isRequired,
    channelRows: PropTypes.arrayOf(
        PropTypes.shape({
            channel: PropTypes.object,
            visibleReplays: PropTypes.arrayOf(PropTypes.object),
        })
    ).isRequired,
    viewRange: PropTypes.shape({ start: PropTypes.number, end: PropTypes.number }).isRequired,
    viewSpan: PropTypes.number.isRequired,
    rowHeight: PropTypes.number.isRequired,
    formatDateRange: PropTypes.func.isRequired,
    formatDuration: PropTypes.func.isRequired,
    clamp: PropTypes.func.isRequired,
    bounds: PropTypes.shape({
        minTime: PropTypes.number,
        maxTime: PropTypes.number,
        span: PropTypes.number,
    }).isRequired,
    minViewSpan: PropTypes.number.isRequired,
    onViewRangeChange: PropTypes.func.isRequired,
    onResetView: PropTypes.func.isRequired,
};

