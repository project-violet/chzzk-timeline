import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Badge, Group, Text } from '@mantine/core';
import React, { useMemo } from 'react';

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

const TimelineAxisHeader = ({
    axisRef,
    selectionBox,
    axisTicks,
    viewRange,
    viewSpan,
    clamp,
    isMobile,
    handleTouchEnd,
    showHoverGuide,
    onToggleHoverGuide,
}) => {
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
                    {isMobile ? (
                        <div className="grid items-end gap-2 text-xs text-slate-400 grid-cols-[92px_minmax(0,1fr)]">
                            <Text size="xs" fw={600} c="dimmed" className="uppercase tracking-wide">
                                스트리머
                            </Text>
                            <div ref={axisRef} className="relative h-12" onClick={handleTouchEnd}>
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
                                    if (position < 0 || position > 98) return null;
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
                    ) : (
                        <div className="grid items-end gap-2 text-xs text-slate-400 grid-cols-[220px_minmax(0,1fr)]">
                            <div className="flex items-center justify-start">
                                <Text size="xs" fw={600} c="dimmed" className="uppercase tracking-wide">
                                    스트리머
                                </Text>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-end">
                                    <div className="flex ml-auto">
                                        <button
                                            type="button"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onPointerMove={(event) => event.stopPropagation()}
                                            onPointerUp={(event) => event.stopPropagation()}
                                            onClick={() => onToggleHoverGuide(!showHoverGuide)}
                                            aria-pressed={showHoverGuide}
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60 ${showHoverGuide
                                                ? 'border-teal-400/50 bg-teal-400/10 text-teal-100'
                                                : 'border-slate-700/70 bg-slate-800/70 text-slate-400'
                                                }`}
                                            aria-label="타임라인 가이드 선 토글"
                                        >
                                            <span>가이드 선</span>
                                            <span
                                                className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ease-out ${showHoverGuide ? 'bg-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.6)]' : 'bg-slate-500'
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                </div>
                                <div ref={axisRef} className="relative h-12" onClick={handleTouchEnd}>
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
                                        if (position < 0 || position > 98) return null;
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
                    )}
                </div>
            </div>
        </div>
    );
};

const ChannelSidebar = ({ channelRows, rowHeight, isMobile, relatedMap, channelsMeta }) => {
    const [hovered, setHovered] = useState({ channelId: null, rowIndex: null });

    const idToChannel = useMemo(() => {
        const map = new Map();
        for (const ch of channelsMeta || []) {
            if (ch?.channelId) map.set(ch.channelId, ch);
        }
        return map;
    }, [channelsMeta]);

    const relatedItems = useMemo(() => {
        if (!hovered.channelId || !relatedMap) return [];
        const list = relatedMap[hovered.channelId];
        if (!Array.isArray(list)) return [];
        return list
            .map((item) => {
                const ch = idToChannel.get(item.target);
                return ch
                    ? {
                        id: item.target,
                        name: ch.name ?? '',
                        image: ch.image,
                        similarity: typeof item.distance === 'number' ? item.distance : 0,
                    }
                    : null;
            })
            .filter(Boolean)
            .slice(0, 6);
    }, [hovered.channelId, idToChannel, relatedMap]);

    return (
        <div className="relative overflow-visible rounded-2xl border border-slate-800/70 bg-slate-900/60">
            <div className="pointer-events-none absolute inset-0">
                {channelRows.slice(1).map((_, dividerIndex) => (
                    <div
                        key={`sidebar-divider-${dividerIndex}`}
                        className="absolute left-4 right-4 border-t border-slate-800/35"
                        style={{ top: (dividerIndex + 1) * rowHeight }}
                    />
                ))}
            </div>
            {channelRows.map(({ channel }, rowIndex) => {
                const key = channel.channelId ?? channel.name;
                const channelUrl = channel?.channelId ? `/channel/${channel.channelId}` : null;

                const content = (
                    <div
                        className={isMobile ? 'flex h-full flex-col items-center justify-center px-1 text-center' : 'px-4'}
                        style={{ height: rowHeight }}
                        onMouseEnter={() => setHovered({ channelId: channel.channelId, rowIndex })}
                        onMouseLeave={() => setHovered({ channelId: null, rowIndex: null })}
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

            {/* 오른편 연관 채널 툴팁 */}
            {hovered.channelId && relatedItems.length > 0 ? (
                <div
                    className="absolute z-[70]"
                    style={{
                        top: hovered.rowIndex * rowHeight,
                        left: '50%',
                        transform: 'translate(-50%, -12px) translateY(-100%)',
                    }}
                >
                    {/* 말풍선 테일(외곽선) */}
                    <div
                        className="pointer-events-none absolute left-1/2 translate-x-[-50%]"
                        style={{
                            bottom: -9,
                            width: 0,
                            height: 0,
                            borderLeft: '10px solid transparent',
                            borderRight: '10px solid transparent',
                            borderTop: '10px solid rgba(30,41,59,0.7)', // slate-800/70
                            filter: 'drop-shadow(0 2px 6px rgba(2,6,23,0.6))',
                            zIndex: 2,
                        }}
                        aria-hidden="true"
                    />
                    {/* 말풍선 테일(채움) */}
                    <div
                        className="pointer-events-none absolute left-1/2 translate-x-[-50%]"
                        style={{
                            bottom: -8,
                            width: 0,
                            height: 0,
                            borderLeft: '9px solid transparent',
                            borderRight: '9px solid transparent',
                            borderTop: '9px solid rgba(15,23,42,0.95)', // slate-900/95
                            zIndex: 3,
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/95 p-3 shadow-lg shadow-slate-900/40"
                        style={{ width: 420 }}
                        role="tooltip"
                        aria-live="polite"
                        aria-label="연관 채널"
                    >
                        <div
                            style={{
                                position: 'relative',
                                zIndex: 1,
                            }}
                        >
                            <div className="grid grid-cols-3 gap-3">
                                {relatedItems.map((item) => (
                                    <a
                                        key={item.id}
                                        href={`/channel/${item.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex flex-col items-center rounded-xl p-2 transition-colors hover:bg-slate-800/40"
                                        aria-label={`${item.name} 채널로 이동`}
                                    >
                                        <Avatar
                                            src={item.image ? `${item.image}?type=f120_120_na` : undefined}
                                            alt={item.name}
                                            radius="xl"
                                            size={48}
                                        >
                                            {item.name.slice(0, 2)}
                                        </Avatar>
                                        <Text size="xs" fw={600} className="mt-1 w-full truncate text-center" title={item.name}>
                                            {item.name}
                                        </Text>
                                        <Badge size="xs" variant="light" color="teal">
                                            연관도 {(item.similarity * 100).toFixed(0)}%
                                        </Badge>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

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
    isMobile,
    hoverPosition,
    videoWithChatCounts,
}) => {
    const timelineHeight = channelRows.length * rowHeight;
    const linkTapRef = useRef(new Map());

    const handleTimelineLinkPointerDown = useCallback(
        (event, channel, replay, linkKey, videoUrl) => {
            if (!isMobile) {
                hideTooltip();
                window.open(videoUrl, '_blank', 'noopener,noreferrer');
                return;
            }
            event.preventDefault();

            const now = Date.now();
            const lastTap = linkTapRef.current.get(linkKey) ?? 0;
            const TAP_THRESHOLD = 320;

            if (now - lastTap < TAP_THRESHOLD) {
                linkTapRef.current.delete(linkKey);
                hideTooltip();
                window.open(videoUrl, '_blank', 'noopener,noreferrer');
                return;
            }

            linkTapRef.current.set(linkKey, now);
            showTooltip(event, channel, replay);
        },
        [hideTooltip, showTooltip]
    );

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
                {hoverPosition !== null ? (
                    <div
                        className="absolute inset-y-0 border-l border-teal-200/45"
                        style={{ left: `${clamp(hoverPosition, 0, 100)}%` }}
                    />
                ) : null}
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

                    // video_with_chat_counts.json에 해당 비디오가 있는지 확인
                    const hasChatCounts = videoWithChatCounts?.has(String(replay.videoId)) || videoWithChatCounts?.has(String(replay.videoNo));

                    const videoUrl = hasChatCounts
                        ? `/chat/${replay.videoNo}`
                        : `https://chzzk.naver.com/video/${replay.videoNo}`;
                    const linkKey = `${channel.channelId ?? channel.name}-${index}-${replay.startDate.toISOString()}`;

                    // 주황색 계열 그라데이션 클래스 (chat counts가 있는 경우)
                    const gradientClass = hasChatCounts
                        ? 'bg-gradient-to-r from-emerald-400/60 via-teal-400/58 to-cyan-400/60 hover:from-emerald-300/78 hover:via-teal-300/78 hover:to-cyan-300/78'
                        : 'bg-gradient-to-r from-orange-400/60 via-amber-400/58 to-yellow-400/60 hover:from-orange-300/78 hover:via-amber-300/78 hover:to-yellow-300/78';

                    // 주황색 계열 그림자
                    const boxShadow = hasChatCounts
                        ? '0 6px 14px -8px rgba(45, 212, 191, 0.45)'
                        : '0 6px 14px -8px rgba(251, 146, 60, 0.45)';

                    // 주황색 계열 텍스트 색상
                    const textColorClass = hasChatCounts ? 'text-teal-50' : 'text-orange-50';
                    const textShadow = hasChatCounts
                        ? '0 1px 2px rgba(15, 118, 110, 0.45)'
                        : '0 1px 2px rgba(154, 52, 18, 0.45)';

                    return (
                        <a
                            key={linkKey}
                            className={`absolute flex h-6 -translate-y-1/2 cursor-pointer select-none items-center overflow-hidden rounded-full ${gradientClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-200/80`}
                            style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top,
                                boxShadow,
                            }}
                            tabIndex={0}
                            aria-label={ariaLabel}
                            data-timeline-key={linkKey}
                            onMouseEnter={(event) => showTooltip(event, channel, replay)}
                            onFocus={(event) => showTooltip(event, channel, replay)}
                            onMouseLeave={hideTooltip}
                            onBlur={hideTooltip}
                            onPointerDown={(event) => handleTimelineLinkPointerDown(event, channel, replay, linkKey, videoUrl)}
                            data-timeline-link="true"
                        >
                            <Text
                                size="xs"
                                fw={600}
                                className={`w-full truncate ${textColorClass}`}
                                style={{
                                    textShadow,
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
    videoWithChatCounts,
    showAxisHeader = true,
    forceSidebarMobile = false,
    relatedMap,
    channelsMeta = [],
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
    const [hoverPosition, setHoverPosition] = useState(null);
    const [showHoverGuide, setShowHoverGuide] = useState(true);

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

    useEffect(() => {
        if (isMobile) {
            setShowHoverGuide(false);
        }
    }, [isMobile]);

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
            const surfaceElement = surfaceRef.current;
            if (!surfaceElement) return;

            if (event.pointerType === 'touch') {
                setHoverPosition(null);
                updateTouchPointer(event);
                surfaceElement.setPointerCapture?.(event.pointerId);
                if (pointerStateRef.current.pinch || pointerStateRef.current.pointers.size >= 2) {
                    if (startPinchIfPossible()) {
                        event.preventDefault();
                        return;
                    }
                }
            }

            if (event.button !== 0 && event.pointerType !== 'touch') return;
            const axisElement = axisRef.current;
            if (!axisElement) return;

            const linkTarget = event.target.closest('a[data-timeline-link="true"]');
            if (linkTarget) {
                return;
            }

            const rect = axisElement.getBoundingClientRect();
            if (rect.width <= 0 || event.clientX < rect.left || event.clientX > rect.right) return;

            hideTooltip();
            event.preventDefault();
            const pointerX = clamp(event.clientX - rect.left, 0, rect.width);
            const pointerY = event.clientY;
            const isAxisArea = axisElement.contains(event.target);
            const interactionType = event.shiftKey || isAxisArea ? 'select' : 'pan';

            interactionRef.current = {
                type: interactionType,
                pointerId: event.pointerId,
                startPx: pointerX,
                startClientY: pointerY,
                viewRangeAtStart: { ...activeRange },
            };

            if (interactionType === 'select') {
                setSelectionBox({
                    leftPercent: (pointerX / rect.width) * 100,
                    widthPercent: 0,
                });
            }

            if (event.pointerType === 'mouse') {
                if (!showHoverGuide) {
                    setHoverPosition(null);
                } else {
                    const surfaceRect = surfaceElement.getBoundingClientRect();
                    if (surfaceRect.width > 0) {
                        const percent = clamp((event.clientX - surfaceRect.left) / surfaceRect.width, 0, 1) * 100;
                        setHoverPosition(percent);
                    }
                }
            }

            surfaceElement.setPointerCapture?.(event.pointerId);
        },
        [activeRange, clamp, hideTooltip, isMobile, setHoverPosition, showHoverGuide, startPinchIfPossible, updateTouchPointer]
    );

    const handlePointerMove = useCallback(
        (event) => {
            const surfaceElement = surfaceRef.current;
            if (!surfaceElement) return;

            if (event.pointerType === 'touch') {
                updateTouchPointer(event);
                const pointerState = pointerStateRef.current;
                if (!pointerState.pinch && pointerState.pointers.size >= 2) {
                    if (startPinchIfPossible()) {
                        event.preventDefault();
                        handlePinchMove();
                        setHoverPosition(null);
                        return;
                    }
                }
                if (pointerState.pinch) {
                    event.preventDefault();
                    handlePinchMove();
                    setHoverPosition(null);
                    return;
                }
            }

            const axisElement = axisRef.current;
            if (!axisElement) return;

            const axisRect = axisElement.getBoundingClientRect();
            const surfaceRect = surfaceElement.getBoundingClientRect();
            if (axisRect.width <= 0 || surfaceRect.width <= 0) {
                setHoverPosition(null);
                return;
            }

            const interaction = interactionRef.current;
            if (!interaction || interaction.pointerId !== event.pointerId) {
                if (event.pointerType === 'mouse') {
                    if (!showHoverGuide || isMobile) {
                        setHoverPosition(null);
                    } else {
                        const withinBounds =
                            event.clientX >= axisRect.left &&
                            event.clientX <= axisRect.right &&
                            event.clientY >= surfaceRect.top &&
                            event.clientY <= surfaceRect.bottom;

                        if (withinBounds) {
                            const percent = clamp((event.clientX - axisRect.left) / axisRect.width, 0, 1) * 100;
                            setHoverPosition(percent);
                        } else {
                            setHoverPosition(null);
                        }
                    }
                }
                return;
            }

            if (event.pointerType === 'touch') {
                const deltaX = Math.abs(event.clientX - interaction.startPx) * window.devicePixelRatio;
                const deltaY = Math.abs(event.clientY - interaction.startClientY) * window.devicePixelRatio;
                if (deltaY > deltaX && deltaY > 6) {
                    interactionRef.current = null;
                    setSelectionBox(null);
                    try {
                        surfaceElement.releasePointerCapture?.(event.pointerId);
                    } catch {
                        // ignore errors releasing pointer capture
                    }
                    setHoverPosition(null);
                    return;
                }
            }

            const pointerX = clamp(event.clientX - axisRect.left, 0, axisRect.width);

            if (interaction.type === 'pan') {
                const span = interaction.viewRangeAtStart.end - interaction.viewRangeAtStart.start;
                if (span <= 0) return;

                const deltaPx = pointerX - interaction.startPx;
                const deltaTime = (deltaPx / axisRect.width) * span;

                const nextStart = interaction.viewRangeAtStart.start - deltaTime;
                const nextEnd = interaction.viewRangeAtStart.end - deltaTime;

                setDraftRange(enforceRange(nextStart, nextEnd));
            } else {
                const startPx = interaction.startPx;
                const leftPx = Math.min(startPx, pointerX);
                const rightPx = Math.max(startPx, pointerX);
                const leftPercent = (leftPx / axisRect.width) * 100;
                const widthPercent = ((rightPx - leftPx) / axisRect.width) * 100;

                setSelectionBox({
                    leftPercent: clamp(leftPercent, 0, 100),
                    widthPercent: clamp(widthPercent, 0, 100),
                });
            }

            if (event.pointerType === 'mouse') {
                if (showHoverGuide && !isMobile) {
                    const percent = clamp((event.clientX - axisRect.left) / axisRect.width, 0, 1) * 100;
                    setHoverPosition(percent);
                } else {
                    setHoverPosition(null);
                }
            }
        },
        [clamp, enforceRange, handlePinchMove, isMobile, setHoverPosition, showHoverGuide, startPinchIfPossible, updateTouchPointer]
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
                    setHoverPosition(null);
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
                    if (span > 0 && pointerX > 0) {
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
            if (event.pointerType === 'mouse') {
                setHoverPosition(null);
            }
        },
        [clamp, enforceRange, finishPinch, hideTooltip, onViewRangeChange, removeTouchPointer, setHoverPosition]
    );

    const handleResetView = useCallback(() => {
        interactionRef.current = null;
        setSelectionBox(null);
        hideTooltip();
        onResetView();
        setDraftRange(null);
        setHoverPosition(null);
    }, [hideTooltip, onResetView]);

    // 모바일에서 더블 클릭 허용하기 위해 
    const lastTapRef = useRef(0);
    const handleTouchEnd = () => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            handleResetView();
        }
        lastTapRef.current = now;
    };

    if (channelRows.length === 0) {
        return <EmptyTimelinePlaceholder />;
    }

    return (
        <div
            ref={surfaceRef}
            className="relative"
            style={{ touchAction: isMobile ? 'pan-y' : 'auto' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finalizeInteraction}
            onPointerCancel={finalizeInteraction}
            onPointerLeave={() => setHoverPosition(null)}
            onDoubleClick={handleResetView}
        >
            {showAxisHeader && (
                <TimelineAxisHeader
                    axisRef={axisRef}
                    selectionBox={selectionBox}
                    axisTicks={axisTicks}
                    viewRange={activeRange}
                    viewSpan={activeViewSpan}
                    clamp={clamp}
                    isMobile={isMobile}
                    handleTouchEnd={handleTouchEnd}
                    showHoverGuide={showHoverGuide}
                    onToggleHoverGuide={setShowHoverGuide}
                />
            )}

            <div
                className={`grid items-start gap-2 ${forceSidebarMobile || isMobile ? 'grid-cols-[92px_minmax(0,1fr)]' : 'grid-cols-[220px_minmax(0,1fr)]'
                    }`}
            >
                <ChannelSidebar
                    channelRows={channelRows}
                    rowHeight={rowHeight}
                    isMobile={forceSidebarMobile || isMobile}
                    relatedMap={relatedMap}
                    channelsMeta={channelsMeta}
                />
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
                    isMobile={isMobile}
                    hoverPosition={showHoverGuide ? hoverPosition : null}
                    videoWithChatCounts={videoWithChatCounts}
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
    videoWithChatCounts: PropTypes.instanceOf(Set),
    showAxisHeader: PropTypes.bool,
    forceAxisHeaderMobile: PropTypes.bool,
};

