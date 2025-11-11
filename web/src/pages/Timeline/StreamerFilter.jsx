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

const CloseIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M6 6l12 12" />
        <path d="M6 18l12-12" />
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
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
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
        if (isFixedLayout) {
            setIsMobilePanelOpen(false);
        }
    }, [isFixedLayout]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const handleOpenRequest = () => {
            if (isFixedLayout) return;
            setIsMobilePanelOpen(true);
        };

        window.addEventListener('open-streamer-filter', handleOpenRequest);

        return () => {
            window.removeEventListener('open-streamer-filter', handleOpenRequest);
        };
    }, [isFixedLayout]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
        if (!isMobilePanelOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsMobilePanelOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = overflow;
        };
    }, [isMobilePanelOpen]);

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

    const renderFilterBody = ({ includeId = false, className = '' } = {}) => (
        <Stack
            gap="sm"
            id={includeId ? contentId : undefined}
            className={`flex-1 ${className}`.trim()}
            style={{ minHeight: 0 }}
        >
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
    );

    const desktopCardContent = (
        <div className="flex h-full flex-col">
            <Text size="sm" fw={700} className="px-1 py-1 text-slate-100">
                스트리머 필터
            </Text>
            {renderFilterBody({ includeId: true, className: 'mt-3' })}
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
                            {desktopCardContent}
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
                        {desktopCardContent}
                    </Card>
                )}
            </aside>
        );
    }

    return (
        <>
            <div
                className={`fixed inset-0 z-[60] transition-opacity duration-200 ease-out ${isMobilePanelOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isMobilePanelOpen}
            >
                <div
                    className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                    onClick={() => setIsMobilePanelOpen(false)}
                    aria-hidden="true"
                />
                <div
                    className={`absolute left-0 top-0 flex h-full max-w-full transform-gpu transition-transform duration-300 ease-out ${isMobilePanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <Card
                        radius="xl"
                        padding="lg"
                        withBorder
                        className="flex h-full w-[min(360px,90vw)] flex-col"
                        style={CARD_STYLE}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <Text size="sm" fw={700}>
                                스트리머 필터
                            </Text>
                            <button
                                type="button"
                                onClick={() => setIsMobilePanelOpen(false)}
                                className="rounded-full p-1 text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60"
                                aria-label="스트리머 필터 닫기"
                            >
                                <CloseIcon className="h-5 w-5" />
                            </button>
                        </div>
                        {renderFilterBody({ className: 'mt-2' })}
                    </Card>
                </div>
            </div>
        </>
    );
}

