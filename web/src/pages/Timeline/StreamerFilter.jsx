import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Checkbox, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { hangulToKeystrokes, levenshteinDistance } from '../../utils/hangul';

const NAV_OFFSET_REM = 6;
const NAV_OFFSET = `${NAV_OFFSET_REM}rem`;
const FILTER_HEIGHT = `calc(100vh - ${NAV_OFFSET_REM}rem)`;
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

const CARD_STYLE = {
    background: 'linear-gradient(155deg, rgba(15,23,42,0.92), rgba(30,41,59,0.88))',
    borderColor: 'rgba(45, 212, 191, 0.18)',
    boxShadow: '0 14px 32px -18px rgba(13, 148, 136, 0.4)',
};

const EMPTY_STATE_STYLE = {
    borderColor: 'rgba(148, 163, 184, 0.28)',
    background: 'rgba(15, 23, 42, 0.82)',
};

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

const CHANNEL_ROW_HEIGHT = 60;

const ChevronIcon = ({ collapsed }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 flex-none transition-transform duration-150 ease-out ${collapsed ? '-rotate-90' : 'rotate-0'}`}
        aria-hidden="true"
    >
        <path d="M6 9l6 6 6-6" />
    </svg>
);

export function StreamerFilter({
    channels = [],
    selectedChannelIds,
    onToggleChannel,
    onResetSelection,
    selectedCount,
}) {
    const containerRef = useRef(null);
    const [metrics, setMetrics] = useState({ left: 0, width: 0 });
    const [isFixedLayout, setIsFixedLayout] = useState(false);
    const viewportRef = useRef(null);

    const [filterText, setFilterText] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return !window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
    });
    const contentId = useId();

    const channelMetadata = useMemo(() => {
        return channels.map((channel, index) => {
            const name = typeof channel?.name === 'string' ? channel.name : '';
            const condensedName = name.replace(/\s+/g, '');
            return {
                channel,
                id: channel.channelId ?? name ?? `channel-${index}`,
                nameLower: name.toLowerCase(),
                keystrokes: hangulToKeystrokes(condensedName),
            };
        });
    }, [channels]);

    const sidebarItems = useMemo(() => {
        const trimmedFilter = filterText.trim().toLowerCase();
        const condensedFilter = trimmedFilter.replace(/\s+/g, '');

        if (!condensedFilter) {
            return channelMetadata;
        }

        const selectedSet = new Set(selectedChannelIds);
        const filterKeystrokes = hangulToKeystrokes(condensedFilter);

        return channelMetadata.filter((item) => {
            if (selectedSet.has(item.id)) return true;
            if (trimmedFilter && item.nameLower.includes(trimmedFilter)) return true;
            if (item.keystrokes.includes(filterKeystrokes)) return true;
            if (!filterKeystrokes) return false;
            return levenshteinDistance(item.keystrokes, filterKeystrokes, 2) <= 1;
        });
    }, [channelMetadata, filterText, selectedChannelIds]);

    const virtualizer = useVirtualizer({
        count: sidebarItems.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => CHANNEL_ROW_HEIGHT,
        overscan: 8,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const isEmpty = sidebarItems.length === 0;
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
        const handleMediaChange = () => {
            setIsFixedLayout(mediaQuery.matches);
        };

        handleMediaChange();
        mediaQuery.addEventListener('change', handleMediaChange);

        return () => {
            mediaQuery.removeEventListener('change', handleMediaChange);
        };
    }, []);

    useEffect(() => {
        setIsCollapsed((prev) => {
            const next = !isFixedLayout;
            return prev === next ? prev : next;
        });
    }, [isFixedLayout]);

    useLayoutEffect(() => {
        if (!isFixedLayout || typeof window === 'undefined') return undefined;

        const updateMetrics = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setMetrics((prev) => {
                if (prev.left === rect.left && prev.width === rect.width) return prev;
                return { left: rect.left, width: rect.width };
            });
        };

        updateMetrics();

        const resizeObserver = new ResizeObserver(updateMetrics);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        window.addEventListener('resize', updateMetrics);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateMetrics);
        };
    }, [isFixedLayout]);

    const cardContent = (
        <div className="flex h-full flex-col">
            <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                aria-expanded={!isCollapsed}
                aria-controls={contentId}
                className="flex items-center justify-between rounded-lg px-1 py-1 text-left text-slate-100 transition hover:text-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60"
            >
                <Text size="sm" fw={700}>
                    스트리머 필터
                </Text>
                <ChevronIcon collapsed={isCollapsed} />
            </button>

            {!isCollapsed ? (
                <Stack gap="sm" id={contentId} className="mt-3 flex-1" style={{ minHeight: 0 }}>
                    <Text size="xs" c="dimmed">
                        검색하거나 체크해 원하는 스트리머만 타임라인에 표시해 보세요.
                    </Text>

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
                        <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            radius="lg"
                            onClick={() => onResetSelection?.()}
                            disabled={selectedChannelIds.length === 0}
                        >
                            선택 초기화
                        </Button>
                    </Group>

                    <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars viewportRef={viewportRef}>
                        {isEmpty ? (
                            <div
                                className="flex h-32 items-center justify-center rounded-xl border"
                                style={EMPTY_STATE_STYLE}
                            >
                                <Text size="xs" c="dimmed">
                                    검색 결과가 없습니다.
                                </Text>
                            </div>
                        ) : (
                            <div style={{ height: totalSize, position: 'relative', paddingRight: '0.5rem' }}>
                                {virtualItems.map((virtualRow) => {
                                    const item = sidebarItems[virtualRow.index];
                                    if (!item || !item.channel) return null;

                                    const { channel, id } = item;
                                    const channelName = typeof channel?.name === 'string' ? channel.name : '';
                                    const followerLabel = Number(channel?.follower ?? 0).toLocaleString('ko-KR');

                                    return (
                                        <div
                                            key={id}
                                            data-index={virtualRow.index}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: virtualRow.size,
                                                transform: `translateY(${virtualRow.start}px)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '4px 0',
                                            }}
                                        >
                                            <label
                                                htmlFor={`channel-${id}`}
                                                className="flex h-full w-full cursor-pointer select-none items-center rounded-lg px-2 py-2 transition hover:bg-slate-800/50"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={(event) => {
                                                    if (event.target instanceof HTMLInputElement) return;
                                                    event.preventDefault();
                                                    onToggleChannel(id);
                                                }}
                                            >
                                                <Checkbox
                                                    id={`channel-${id}`}
                                                    checked={selectedChannelIds.includes(id)}
                                                    onChange={() => onToggleChannel(id)}
                                                    radius="md"
                                                    styles={{
                                                        input: { cursor: 'pointer' },
                                                    }}
                                                    aria-label={`${channelName} 선택`}
                                                />
                                                <Group gap="sm" wrap="nowrap" ml="sm">
                                                    <Avatar
                                                        src={channel?.image ? `${channel.image}?type=f120_120_na` : undefined}
                                                        radius="xl"
                                                        size={40}
                                                        alt={channelName}
                                                    >
                                                        {getInitials(channelName)}
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <Text size="sm" fw={600} className="truncate">
                                                            {channelName}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            팔로워 {followerLabel}
                                                        </Text>
                                                    </div>
                                                </Group>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </Stack>
            ) : null}
        </div>
    );

    if (isFixedLayout) {
        return (
            <aside ref={containerRef} className="relative" style={{ minHeight: '100vh' }}>
                <div aria-hidden="true" style={{ height: FILTER_HEIGHT, marginTop: NAV_OFFSET }} />
                {metrics.width > 0 ? (
                    <div
                        className="z-40 hidden lg:block"
                        style={{
                            position: 'fixed',
                            top: NAV_OFFSET,
                            left: metrics.left,
                            width: metrics.width,
                            height: `calc(100vh - 7rem)`,
                        }}
                    >
                        <Card
                            radius="xl"
                            padding="lg"
                            withBorder
                            className="flex h-full flex-col"
                            style={CARD_STYLE}
                        >
                            {cardContent}
                        </Card>
                    </div>
                ) : (
                    <Card
                        radius="xl"
                        padding="lg"
                        withBorder
                        className="flex flex-col"
                        style={{ ...CARD_STYLE, marginTop: NAV_OFFSET, maxHeight: FILTER_HEIGHT }}
                    >
                        {cardContent}
                    </Card>
                )}
            </aside>
        );
    }

    return (
        <aside>
            <Card
                radius="xl"
                padding="lg"
                withBorder
                className="flex w-full flex-col"
                style={{ ...CARD_STYLE, marginTop: NAV_OFFSET, maxHeight: FILTER_HEIGHT }}
            >
                {cardContent}
            </Card>
        </aside>
    );
}

