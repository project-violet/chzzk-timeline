import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Checkbox, Group, ScrollArea, Stack, Text, TextInput, Tabs } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { hangulToKeystrokes, levenshteinDistance } from '../../utils/hangul';

// 컨텐츠 필터 설정 (코드에서 수동으로 설정)
// label: 각 필터 그룹을 식별하는 고유 식별자 (선택 상태 관리에 사용)
// group: 필터 그룹의 분류 (예: "스트리머 서버", "그룹")
// category: 필터 그룹 설명을 위한 카테고리 (필터링에는 사용되지 않음)
// description: 필터 그룹에 대한 추가 설명
// keywords: 제목에서 검색할 키워드 배열
// tags: 태그에서 검색할 태그 배열
export const CONTENT_FILTER_GROUPS = [
    { label: '멋사 공책 RPG', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['멋사 공책', '멋사공책', '멋사 공책 RPG'], tags: ['멋사공책RPG'] },
    { label: '큰별수양관', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['큰별', '큰별수양관'], tags: ['큰별수양관'] },
    { label: '쿠롬이네 민박집', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['쿠롬님 서버', '쿠롬이네', '민박집'], tags: [] },
    { label: '봉부락', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['봉부락'], tags: ['봉부락'] },
    { label: '다피스', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['다피스'], tags: ['다피스'] },
    { label: '마카오톡', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['마카오톡'], tags: ['마카오톡'] },
    { label: '멋봉리', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['멋봉리'], tags: [] },
    { label: '마통대', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['마통대'], tags: [] },
    { label: '연밥리', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['연밥리'], tags: [] },
    { label: '두라기 공원', group: '스트리머 서버', category: '아크: 서바이벌 이볼브드', description: '', keywords: ['두라기', '두라기공원'], tags: ['두라기공원'] },
    { label: '쌀멋서버', group: '스트리머 서버', category: '마인크래프트', description: '', keywords: ['쌀멋', '쌀멋서버'], tags: ['쌀멋서버'] },
    { label: '콩밥특별시', group: '스트리머 서버', category: 'Grand Theft Auto V', description: '', keywords: ['콩밥', '콩밥특별시'], tags: ['콩밥특별시'] },
    { label: '봉누도', group: '스트리머 서버', category: 'Grand Theft Auto V', description: 'GTA5 기반 RP 서버', keywords: ['봉누도'], tags: [] },
    { label: '인챈트', group: '그룹', category: '', description: '', keywords: ['인챈트'], tags: ['인챈트'] },
    { label: '픽셀네트워크', group: '그룹', category: '', description: '', keywords: [], tags: ['픽셀네트워크'] },
    { label: '카론 크리에이티브', group: '그룹', category: '', description: '', keywords: ['카론'], tags: ['카론'] },
    { label: '스텔라이브', group: '그룹', category: '', description: '', keywords: [], tags: ['스텔라이브'] },
    { label: '오버더월', group: '그룹', category: '', description: '', keywords: ['오버더월'], tags: ['오버더월'] },
    { label: '허니즈', group: '그룹', category: '', description: '', keywords: ['허니즈'], tags: ['허니즈'] },
    { label: '아카시아', group: '그룹', category: '', description: '', keywords: ['아카시아'], tags: ['아카시아'] },
    { label: '리스텔라', group: '그룹', category: '', description: '', keywords: ['리스텔라'], tags: ['리스텔라'] },
    { label: '스타데이즈', group: '그룹', category: '', description: '', keywords: ['스타데이즈'], tags: ['스타데이즈'] },
    { label: '하나비', group: '그룹', category: '', description: '', keywords: ['하나비'], tags: ['하나비'] },
    { label: '메이비', group: '그룹', category: '', description: '', keywords: ['메이비'], tags: ['메이비'] },
    { label: '리액트kr', group: '그룹', category: '', description: '', keywords: ['리액트kr'], tags: ['리액트kr'] },
    { label: '프로젝트아이', group: '그룹', category: '', description: '', keywords: ['프로젝트아이'], tags: ['프로젝트아이'] },
    { label: '에스더', group: '그룹', category: '', description: '', keywords: ['에스더'], tags: ['에스더'] },
    { label: '그림프로덕션', group: '그룹', category: '', description: '', keywords: ['그림프로덕션'], tags: ['그림프로덕션'] },
];

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
    activeTab = 'streamer',
    onTabChange,
    selectedContentGroups = [],
    onToggleContentGroup,
    onResetContentSelection,
    contentSelectedCount = 0,
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

    const renderStreamerFilter = ({ includeId = false, className = '' } = {}) => (
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

    const renderContentFilter = ({ includeId = false, className = '' } = {}) => (
        <Stack
            gap="sm"
            id={includeId ? contentId : undefined}
            className={`flex-1 ${className}`.trim()}
            style={{ minHeight: 0 }}
        >
            <Text size="xs" c="dimmed">
                원하는 제목 또는 태그 그룹을 선택하면 해당하는 리플레이만 표시됩니다.
            </Text>

            <Group justify="space-between" align="center" gap="xs">
                <Badge size="sm" radius="lg" variant="light" color={contentSelectedCount ? 'teal' : 'gray'}>
                    선택 {contentSelectedCount.toLocaleString('ko-KR')}개
                </Badge>
                <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    radius="lg"
                    onClick={() => onResetContentSelection?.()}
                    disabled={selectedContentGroups.length === 0}
                >
                    선택 초기화
                </Button>
            </Group>

            <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                <Stack gap="md">
                    {Object.entries(
                        CONTENT_FILTER_GROUPS.reduce((acc, item) => {
                            if (!acc[item.group]) {
                                acc[item.group] = [];
                            }
                            acc[item.group].push(item);
                            return acc;
                        }, {})
                    ).map(([groupName, items]) => (
                        <div key={groupName}>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">
                                {groupName}
                            </Text>
                            <Stack gap="xs">
                                {items.map((item) => (
                                    <label
                                        key={item.label}
                                        className="flex cursor-pointer select-none items-start rounded-lg px-2 py-2 transition hover:bg-slate-800/50"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={(event) => {
                                            if (event.target instanceof HTMLInputElement) return;
                                            event.preventDefault();
                                            onToggleContentGroup?.(item.label);
                                        }}
                                    >
                                        <Checkbox
                                            checked={selectedContentGroups.includes(item.label)}
                                            onChange={() => onToggleContentGroup?.(item.label)}
                                            radius="md"
                                            styles={{
                                                input: { cursor: 'pointer' },
                                            }}
                                            aria-label={`${item.label} 선택`}
                                            className="mt-0.5"
                                        />
                                        <div className="ml-2 flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Text size="sm" fw={600}>
                                                    {item.label}
                                                </Text>
                                                {item.category ? (
                                                    <Badge size="xs" variant="light" color="violet">
                                                        {item.category}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {item.description ? (
                                                <Text size="xs" c="dimmed" mt={2}>
                                                    {item.description}
                                                </Text>
                                            ) : null}
                                        </div>
                                    </label>
                                ))}
                            </Stack>
                        </div>
                    ))}
                </Stack>
            </ScrollArea>
        </Stack>
    );

    const desktopCardContent = (
        <div className="flex h-full flex-col">
            <Tabs value={activeTab} onChange={onTabChange} className="flex h-full flex-col" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Tabs.List>
                    <Tabs.Tab value="streamer">스트리머</Tabs.Tab>
                    <Tabs.Tab value="group">그룹</Tabs.Tab>
                </Tabs.List>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Tabs.Panel value="streamer" pt="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {renderStreamerFilter({ includeId: true })}
                    </Tabs.Panel>

                    <Tabs.Panel value="group" pt="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {renderContentFilter({ includeId: true })}
                    </Tabs.Panel>
                </div>
            </Tabs>
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
                            <Tabs value={activeTab} onChange={onTabChange} className="flex-1">
                                <Tabs.List>
                                    <Tabs.Tab value="streamer">스트리머</Tabs.Tab>
                                    <Tabs.Tab value="content">컨텐츠</Tabs.Tab>
                                </Tabs.List>
                            </Tabs>
                            <button
                                type="button"
                                onClick={() => setIsMobilePanelOpen(false)}
                                className="ml-2 rounded-full p-1 text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60"
                                aria-label="필터 닫기"
                            >
                                <CloseIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <Tabs value={activeTab} onChange={onTabChange} className="flex h-full flex-col" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <Tabs.Panel value="streamer" pt="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    {renderStreamerFilter({ className: 'mt-2' })}
                                </Tabs.Panel>
                                <Tabs.Panel value="content" pt="md" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    {renderContentFilter({ className: 'mt-2' })}
                                </Tabs.Panel>
                            </div>
                        </Tabs>
                    </Card>
                </div>
            </div>
        </>
    );
}

