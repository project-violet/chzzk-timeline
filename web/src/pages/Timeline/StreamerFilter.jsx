import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Checkbox, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';

const NAV_OFFSET_REM = 6;
const NAV_OFFSET = `${NAV_OFFSET_REM}rem`;
const FILTER_HEIGHT = `calc(100vh - ${NAV_OFFSET_REM}rem)`;
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

export function StreamerFilter({
    filterText,
    onFilterTextChange,
    sidebarChannels,
    selectedChannelIds,
    onToggleChannel,
    onResetFilters,
    isFilterActive,
    selectedCount,
}) {
    const containerRef = useRef(null);
    const [metrics, setMetrics] = useState({ left: 0, width: 0 });
    const [isFixedLayout, setIsFixedLayout] = useState(false);

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
                <Group gap="xs">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        radius="lg"
                        onClick={onResetFilters}
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
                                    onChange={() => onToggleChannel(id)}
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
                            className="flex h-full flex-col border border-slate-800/60 bg-slate-900/70 backdrop-blur"
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
                        className="flex flex-col border border-slate-800/60 bg-slate-900/70 backdrop-blur"
                        style={{ marginTop: NAV_OFFSET }}
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
                className="flex h-full flex-col border border-slate-800/60 bg-slate-900/70 backdrop-blur"
                style={{ height: FILTER_HEIGHT, marginTop: NAV_OFFSET }}
            >
                {cardContent}
            </Card>
        </aside>
    );
}

