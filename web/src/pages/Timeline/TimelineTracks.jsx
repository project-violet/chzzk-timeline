import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Badge, Group, Text } from '@mantine/core';

const MIN_SEGMENT_WIDTH_PERCENT = 0.6;
const STICKY_FADE_DISTANCE = 160;

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

const EmptyTimelinePlaceholder = () => (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-800/60 bg-slate-900/60">
        <Text size="sm" c="dimmed">
            조건에 맞는 스트리머가 없습니다. 필터를 조정해 보세요.
        </Text>
    </div>
);

const TimelineAxisHeader = ({ axisRef, selectionBox, axisTicks, viewRange, viewSpan, clamp, isMobile }) => {
    const stickyRef = useRef(null);
    const stickyStartOffsetRef = useRef(0);
    const [overlayOpacity, setOverlayOpacity] = useState(0);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (!stickyRef.current) return undefined;

        const computeStickyStartOffset = () => {
            if (!stickyRef.current) return;
            const element = stickyRef.current;
            const rect = element.getBoundingClientRect();
            const computedTop = parseFloat(window.getComputedStyle(element).top || '0');
            const threshold = Number.isFinite(computedTop) ? computedTop : 0;
            stickyStartOffsetRef.current = rect.top + window.scrollY - threshold;
        };

        const handleScroll = () => {
            if (!stickyRef.current) return;
            const element = stickyRef.current;
            const rect = element.getBoundingClientRect();
            const computedTop = parseFloat(window.getComputedStyle(element).top || '0');
            const threshold = Number.isFinite(computedTop) ? computedTop : 0;

            if (rect.top > threshold) {
                stickyStartOffsetRef.current = rect.top + window.scrollY - threshold;
            }

            const startOffset = stickyStartOffsetRef.current ?? 0;
            const distance = window.scrollY + threshold - startOffset;
            const nextOpacity = Math.min(Math.max(distance / STICKY_FADE_DISTANCE, 0), 1);
            setOverlayOpacity((prev) => (Math.abs(prev - nextOpacity) < 0.01 ? prev : nextOpacity));
        };

        const handleResize = () => {
            computeStickyStartOffset();
            handleScroll();
        };

        computeStickyStartOffset();
        handleScroll();

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <div ref={stickyRef} className="sticky top-22 z-20">
            <div className="relative">
                <div
                    className="pointer-events-none absolute inset-x-0 -top-22 bottom-0 bg-slate-950/90 backdrop-blur transition-opacity duration-100 ease-out"
                    style={{ opacity: overlayOpacity }}
                    aria-hidden="true"
                />
                <div className="relative pb-3">
                    <div
                        className={`grid items-end gap-2 text-xs text-slate-400 ${isMobile ? 'grid-cols-[92px_minmax(0,1fr)]' : 'grid-cols-[220px_minmax(0,1fr)]'
                            }`}
                    >
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
                                        <span className="mt-1 whitespace-nowrap text-[11px] text-slate-400">{tick.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ChannelSidebar = ({ channelRows, rowHeight, isMobile }) => (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60">
        <div className="pointer-events-none absolute inset-0">
            {channelRows.slice(1).map((_, dividerIndex) => (
                <div
                    key={`sidebar-divider-${dividerIndex}`}
                    className="absolute left-4 right-4 border-t border-slate-800/35"
                    style={{ top: (dividerIndex + 1) * rowHeight }}
                />
            ))}
        </div>
        {channelRows.map(({ channel }) => {
            const key = channel.channelId ?? channel.name;
            const channelUrl = channel?.channelId ? `https://chzzk.naver.com/${channel.channelId}` : null;

            const content = (
                <div
                    className={isMobile ? 'flex h-full flex-col items-center justify-center px-1 text-center' : 'px-4'}
                    style={{ height: rowHeight }}
                >
                    {isMobile ? (
                        <div className="flex flex-col items-center gap-2">
                            <Avatar
                                src={`${channel.image}?type=f120_120_na`}
                                radius="xl"
                                size={42}
                                alt={channel.name}
                                className="shadow-md ring-1 ring-slate-800/60"
                            >
                                {getInitials(channel.name)}
                            </Avatar>
                            <Text size="xs" fw={600} className="max-w-[100px] truncate text-[10.5px] leading-tight">
                                {channel.name}
                            </Text>
                        </div>
                    ) : (
                        <Group gap="sm" wrap="nowrap" style={{ height: '100%' }}>
                            <Avatar
                                src={`${channel.image}?type=f120_120_na`}
                                radius="xl"
                                size={60}
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
                    )}
                </div>
            );

            if (channelUrl) {
                return (
                    <a
                        key={key}
                        href={channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block no-underline text-inherit transition hover:bg-slate-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400/70"
                    >
                        {content}
                    </a>
                );
            }

            return (
                <div key={key} className="block">
                    {content}
                </div>
            );
        })}
    </div>
);

const TimelineCanvas = ({
    channelRows,
    rowHeight,
    selectionBox,
    axisTicks,
    viewRange,
    viewSpan,
    clamp,
    formatDateRange,
    formatDuration,
    showTooltip,
    hideTooltip,
}) => {
    const timelineHeight = channelRows.length * rowHeight;

    return (
        <div
            className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/60"
            style={{ height: timelineHeight }}
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
                            className="absolute inset-y-0 border-l border-slate-800/30"
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
                <div className="absolute left-0 right-0 border-t border-slate-800/35" style={{ top: timelineHeight }} />
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

                    const dateRangeLabel = formatDateRange(replay.startDate, replay.endDate);
                    const durationLabel = formatDuration(replay.durationMs);
                    const categoryLabel = replay.categoryKo ? `카테고리 ${replay.categoryKo}` : null;
                    const tagsLabel =
                        Array.isArray(replay.tags) && replay.tags.length > 0
                            ? `태그 ${replay.tags.filter(Boolean).join(', ')}`
                            : null;
                    const ariaLabel = [replay.title, dateRangeLabel, durationLabel, categoryLabel, tagsLabel]
                        .filter(Boolean)
                        .join(' · ');

                    const hasRoomForPadding = width >= 3; // about 1% width ~ few px depending on span

                    return (
                        <a
                            key={`${channel.channelId ?? channel.name}-${index}-${replay.startDate.toISOString()}`}
                            className="absolute flex h-6 -translate-y-1/2 cursor-pointer select-none items-center overflow-hidden rounded-full bg-gradient-to-r from-emerald-400/60 via-teal-400/58 to-cyan-400/60 hover:from-emerald-300/78 hover:via-teal-300/78 hover:to-cyan-300/78 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200/80"
                            style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top,
                                boxShadow: '0 6px 14px -8px rgba(45, 212, 191, 0.45)',
                            }}
                            tabIndex={0}
                            aria-label={ariaLabel}
                            onMouseEnter={(event) => showTooltip(event, channel, replay)}
                            onFocus={(event) => showTooltip(event, channel, replay)}
                            onMouseLeave={hideTooltip}
                            onBlur={hideTooltip}
                            onClick={() => {
                                window.open(`https://chzzk.naver.com/video/${replay.videoNo}`, '_blank');
                            }}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-timeline-link="true"
                        >
                            <Text
                                size="xs"
                                fw={600}
                                className="w-full truncate text-teal-50"
                                style={{
                                    textShadow: '0 1px 2px rgba(15, 118, 110, 0.45)',
                                    paddingLeft: hasRoomForPadding ? '8px' : '0px',
                                    paddingRight: hasRoomForPadding ? '8px' : '0px',
                                }}
                            >
                                {replay.title}
                            </Text>
                        </a>
                    );
                })
            )}
        </div>
    );
};

const TimelineTooltipOverlay = ({ tooltip, formatDateRange, formatDuration }) => {
    if (!tooltip) return null;

    return (
        <div className="pointer-events-none absolute z-30" style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}>
            <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/95 p-4 shadow-lg shadow-slate-900/40">
                <div className="flex gap-5 max-sm:flex-col">
                    {tooltip.replay.thumbnail ? (
                        <img
                            src={tooltip.replay.thumbnail}
                            alt={`${tooltip.replay.title} 썸네일`}
                            className="h-52 w-80 flex-none rounded-2xl border border-slate-800/60 object-cover shadow-inner shadow-slate-900/40 max-sm:h-52 max-sm:w-full"
                            loading="lazy"
                        />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                        <Text size="sm" c="dimmed" fw={600} className="uppercase tracking-wide">
                            {tooltip.channel.name}
                        </Text>
                        <Text size="md" fw={600} className="text-slate-100">
                            {tooltip.replay.title}
                        </Text>
                        <Text size="sm" c="dimmed">
                            {formatDateRange(tooltip.replay.startDate, tooltip.replay.endDate)}
                        </Text>
                        {formatDuration(tooltip.replay.durationMs) ? (
                            <Text size="sm" c="dimmed">
                                {formatDuration(tooltip.replay.durationMs)}
                            </Text>
                        ) : null}
                        {tooltip.replay.categoryKo ? (
                            <Badge size="md" radius="md" variant="light" color="violet" className="inline-flex">
                                {tooltip.replay.categoryKo}
                            </Badge>
                        ) : null}
                        {Array.isArray(tooltip.replay.tags) && tooltip.replay.tags.length > 0 ? (
                            <Group gap={8} wrap="wrap" mt={4}>
                                {tooltip.replay.tags
                                    .filter(Boolean)
                                    .slice(0, 8)
                                    .map((tag) => (
                                        <Badge key={tag} size="md" radius="md" variant="light" color="gray">
                                            #{tag}
                                        </Badge>
                                    ))}
                            </Group>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
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
    const [draftRange, setDraftRange] = useState(null);
    const [selectionBox, setSelectionBox] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const pointerStateRef = useRef({ pointers: new Map(), pinch: null });
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return !window.matchMedia('(min-width: 1024px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const mediaQuery = window.matchMedia('(min-width: 1024px)');
        const handleChange = () => {
            setIsMobile(!mediaQuery.matches);
        };

        handleChange();
        mediaQuery.addEventListener('change', handleChange);

        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);

    const { minTime, maxTime, span: boundsSpan } = bounds;
    const activeRange = draftRange ?? viewRange;
    const activeViewSpan = draftRange ? Math.max(draftRange.end - draftRange.start, minViewSpan) : viewSpan;

    useEffect(() => {
        setDraftRange(null);
    }, [viewRange.start, viewRange.end]);

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

    const updateTouchPointer = useCallback((event) => {
        if (event.pointerType !== 'touch') return;
        pointerStateRef.current.pointers.set(event.pointerId, {
            clientX: event.clientX,
        });
    }, []);

    const removeTouchPointer = useCallback((pointerId) => {
        pointerStateRef.current.pointers.delete(pointerId);
    }, []);

    const hideTooltip = useCallback(() => {
        setTooltip(null);
    }, []);

    useEffect(() => {
        hideTooltip();
    }, [hideTooltip, viewRange.start, viewRange.end, channelRows]);

    const startPinchIfPossible = useCallback(() => {
        const pointerState = pointerStateRef.current;
        if (pointerState.pinch) return true;
        if (pointerState.pointers.size < 2) return false;

        const axisElement = axisRef.current;
        if (!axisElement) return false;
        const rect = axisElement.getBoundingClientRect();
        if (rect.width <= 0) return false;

        const entries = Array.from(pointerState.pointers.entries());
        const lastIndex = entries.length - 1;
        if (lastIndex < 1) return false;
        const [idB, pointerB] = entries[lastIndex];
        const [idA, pointerA] = entries[lastIndex - 1];

        const posA = clamp(pointerA.clientX - rect.left, 0, rect.width);
        const posB = clamp(pointerB.clientX - rect.left, 0, rect.width);
        const initialDistance = Math.abs(posA - posB);
        if (initialDistance < 8) return false;

        const centerPx = (posA + posB) / 2;
        const centerRatio = clamp(centerPx / rect.width, 0, 1);

        pointerState.pinch = {
            pointerIds: [idA, idB],
            initialDistance,
            startSpan: activeViewSpan,
            startViewRange: activeRange,
            lastRange: activeRange,
            initialCenterRatio: centerRatio,
        };

        interactionRef.current = null;
        setSelectionBox(null);
        hideTooltip();
        return true;
    }, [activeRange, activeViewSpan, clamp, hideTooltip]);

    const handlePinchMove = useCallback(() => {
        const pinch = pointerStateRef.current.pinch;
        if (!pinch) return false;
        const axisElement = axisRef.current;
        if (!axisElement) return false;
        const rect = axisElement.getBoundingClientRect();
        if (rect.width <= 0) return false;

        const pointers = pinch.pointerIds.map((id) => pointerStateRef.current.pointers.get(id));
        if (pointers.some((pointer) => !pointer)) return false;

        const posA = clamp(pointers[0].clientX - rect.left, 0, rect.width);
        const posB = clamp(pointers[1].clientX - rect.left, 0, rect.width);
        const distance = Math.max(Math.abs(posA - posB), 8);

        let nextSpan = pinch.startSpan * (pinch.initialDistance / distance);
        nextSpan = Math.max(nextSpan, minViewSpan);
        nextSpan = Math.min(nextSpan, boundsSpan);

        const centerPx = (posA + posB) / 2;
        const centerRatio = clamp(centerPx / rect.width, 0, 1);
        const centerTime = pinch.startViewRange.start + pinch.startSpan * centerRatio;
        const range = enforceRange(centerTime - nextSpan / 2, centerTime + nextSpan / 2);

        pointerStateRef.current.pinch.lastRange = range;
        setDraftRange(range);
        return true;
    }, [boundsSpan, clamp, enforceRange, minViewSpan]);

    const finishPinch = useCallback(
        (shouldCommit) => {
            const pinch = pointerStateRef.current.pinch;
            if (!pinch) return;
            const range = pinch.lastRange ?? pinch.startViewRange;
            pointerStateRef.current.pinch = null;
            setDraftRange(null);
            if (shouldCommit && range) {
                onViewRangeChange(range);
            }
        },
        [onViewRangeChange]
    );

    const showTooltip = useCallback(
        (event, channel, replay) => {
            const surfaceElement = surfaceRef.current;
            if (!surfaceElement) return;

            const surfaceRect = surfaceElement.getBoundingClientRect();
            const targetRect = event.currentTarget.getBoundingClientRect();

            const containerWidth = surfaceRect.width;
            if (containerWidth <= 0) return;

            const availableWidth = Math.max(containerWidth - 8, 0);
            const tooltipWidth = availableWidth >= 260 ? Math.min(availableWidth, 600) : availableWidth;
            if (tooltipWidth <= 0) {
                setTooltip(null);
                return;
            }

            const centerLeft = targetRect.left - surfaceRect.left + targetRect.width / 2;
            const left = clamp(centerLeft - tooltipWidth / 2, 8, Math.max(containerWidth - tooltipWidth - 8, 8));

            const belowTop = targetRect.bottom - surfaceRect.top + 12;
            const top = belowTop;

            setTooltip({
                channel,
                replay,
                left,
                top,
                width: tooltipWidth,
            });
        },
        [clamp]
    );

    const handlePointerDown = useCallback(
        (event) => {
            if (event.pointerType === 'touch') {
                updateTouchPointer(event);
                const surfaceElement = surfaceRef.current;
                surfaceElement?.setPointerCapture?.(event.pointerId);
                if (pointerStateRef.current.pinch || pointerStateRef.current.pointers.size >= 2) {
                    if (startPinchIfPossible()) {
                        event.preventDefault();
                        return;
                    }
                }
            }

            if (event.button !== 0) return;
            const axisElement = axisRef.current;
            const surfaceElement = surfaceRef.current;
            if (!axisElement || !surfaceElement) return;

            const linkTarget = event.target.closest('a[data-timeline-link="true"]');
            if (linkTarget) {
                return;
            }

            const rect = axisElement.getBoundingClientRect();
            if (rect.width <= 0 || event.clientX < rect.left || event.clientX > rect.right) return;

            hideTooltip();
            event.preventDefault();
            const pointerX = clamp(event.clientX - rect.left, 0, rect.width);
            const isAxisArea = axisElement.contains(event.target);
            const interactionType = event.shiftKey || isAxisArea ? 'select' : 'pan';

            interactionRef.current = {
                type: interactionType,
                pointerId: event.pointerId,
                startPx: pointerX,
                viewRangeAtStart: { ...activeRange },
            };

            if (interactionType === 'select') {
                setSelectionBox({
                    leftPercent: (pointerX / rect.width) * 100,
                    widthPercent: 0,
                });
            }

            surfaceElement.setPointerCapture?.(event.pointerId);
        },
        [activeRange, clamp, hideTooltip, startPinchIfPossible, updateTouchPointer]
    );

    const handlePointerMove = useCallback(
        (event) => {
            if (event.pointerType === 'touch') {
                updateTouchPointer(event);
                const pointerState = pointerStateRef.current;
                if (!pointerState.pinch && pointerState.pointers.size >= 2) {
                    if (startPinchIfPossible()) {
                        event.preventDefault();
                        handlePinchMove();
                        return;
                    }
                }
                if (pointerState.pinch) {
                    event.preventDefault();
                    handlePinchMove();
                    return;
                }
            }

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

                setDraftRange(enforceRange(nextStart, nextEnd));
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
        [clamp, enforceRange, handlePinchMove, startPinchIfPossible, updateTouchPointer]
    );

    const finalizeInteraction = useCallback(
        (event) => {
            if (event.pointerType === 'touch') {
                removeTouchPointer(event.pointerId);
                const pinch = pointerStateRef.current.pinch;
                if (pinch) {
                    const remaining = pinch.pointerIds.filter((id) => pointerStateRef.current.pointers.has(id));
                    if (remaining.length < 2) {
                        finishPinch(true);
                    }

                    const surfaceElementTouch = surfaceRef.current;
                    try {
                        surfaceElementTouch?.releasePointerCapture?.(event.pointerId);
                    } catch {
                        // ignore
                    }
                    return;
                }
            }

            const interaction = interactionRef.current;
            if (!interaction || interaction.pointerId !== event.pointerId) return;

            hideTooltip();
            const axisElement = axisRef.current;
            const surfaceElement = surfaceRef.current;
            if (!axisElement || !surfaceElement) {
                interactionRef.current = null;
                setSelectionBox(null);
                setDraftRange(null);
                return;
            }

            const rect = axisElement.getBoundingClientRect();
            if (rect.width > 0) {
                const pointerX = clamp(event.clientX - rect.left, 0, rect.width);

                if (interaction.type === 'pan') {
                    const span = interaction.viewRangeAtStart.end - interaction.viewRangeAtStart.start;
                    if (span > 0) {
                        const deltaPx = pointerX - interaction.startPx;
                        const deltaTime = (deltaPx / rect.width) * span;
                        const nextStart = interaction.viewRangeAtStart.start - deltaTime;
                        const nextEnd = interaction.viewRangeAtStart.end - deltaTime;
                        onViewRangeChange(enforceRange(nextStart, nextEnd));
                    }
                } else if (interaction.type === 'select') {
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

            setDraftRange(null);
        },
        [clamp, enforceRange, finishPinch, hideTooltip, onViewRangeChange, removeTouchPointer]
    );

    const handleResetView = useCallback(() => {
        interactionRef.current = null;
        setSelectionBox(null);
        hideTooltip();
        onResetView();
        setDraftRange(null);
    }, [hideTooltip, onResetView]);

    if (channelRows.length === 0) {
        return <EmptyTimelinePlaceholder />;
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
            <TimelineAxisHeader
                axisRef={axisRef}
                selectionBox={selectionBox}
                axisTicks={axisTicks}
                viewRange={activeRange}
                viewSpan={activeViewSpan}
                clamp={clamp}
                isMobile={isMobile}
            />

            <div
                className={`grid items-start gap-2 ${isMobile ? 'grid-cols-[92px_minmax(0,1fr)]' : 'grid-cols-[220px_minmax(0,1fr)]'
                    }`}
            >
                <ChannelSidebar channelRows={channelRows} rowHeight={rowHeight} isMobile={isMobile} />
                <TimelineCanvas
                    channelRows={channelRows}
                    rowHeight={rowHeight}
                    selectionBox={selectionBox}
                    axisTicks={axisTicks}
                    viewRange={activeRange}
                    viewSpan={activeViewSpan}
                    clamp={clamp}
                    formatDateRange={formatDateRange}
                    formatDuration={formatDuration}
                    showTooltip={showTooltip}
                    hideTooltip={hideTooltip}
                />
            </div>

            <TimelineTooltipOverlay tooltip={tooltip} formatDateRange={formatDateRange} formatDuration={formatDuration} />
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

