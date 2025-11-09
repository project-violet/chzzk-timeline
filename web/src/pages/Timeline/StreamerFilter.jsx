import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Checkbox, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';

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

export function StreamerFilter({
    filterText,
    onFilterTextChange,
    sidebarChannels,
    selectedChannelIds,
    onToggleChannel,
    onResetSelection,
    selectedCount,
}) {
    const containerRef = useRef(null);
    const [metrics, setMetrics] = useState({ left: 0, width: 0 });
    const [isFixedLayout, setIsFixedLayout] = useState(false);
    const viewportRef = useRef(null);

    const virtualizer = useVirtualizer({
        count: sidebarChannels.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => CHANNEL_ROW_HEIGHT,
        overscan: 8,
    });

    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const isEmpty = sidebarChannels.length === 0;
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
                onChange={(event) => onFilterTextChange(event.currentTarget.value)}
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

            <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars viewportRef={viewportRef}>
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
                            const channel = sidebarChannels[virtualRow.index];
                            if (!channel) return null;

                            const id = channel.channelId ?? channel.name ?? `channel-${virtualRow.index}`;
                            const followerLabel = Number(channel.follower ?? 0).toLocaleString('ko-KR');

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
                                            aria-label={`${channel.name} 선택`}
                                        />
                                        <Group gap="sm" wrap="nowrap" ml="sm">
                                            <Avatar src={`${channel.image}?type=f120_120_na`} radius="xl" size={40} alt={channel.name}>
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
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </Stack>
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
                ) : null}
                <div className="lg:hidden">
                    <Card
                        radius="xl"
                        padding="lg"
                        withBorder
                        className="flex flex-col"
                        style={{ ...CARD_STYLE, marginTop: NAV_OFFSET }}
                    >
                        {cardContent}
                    </Card>
                </div>
            </aside>
        );
    }

    return (
        <aside className="sticky top-0 self-start" style={{ height: '100vh' }}>
            <Card
                radius="xl"
                padding="lg"
                withBorder
                className="flex h-full flex-col"
                style={{ ...CARD_STYLE, height: FILTER_HEIGHT, marginTop: NAV_OFFSET }}
            >
                {cardContent}
            </Card>
        </aside>
    );
}

