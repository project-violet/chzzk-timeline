import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Container, Group, MultiSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { StreamerFilter } from './StreamerFilter.jsx';
import { TimelineTracks } from './TimelineTracks.jsx';

const TIMELINE_BATCH = 20;
const MIN_VIEW_SPAN = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ROW_HEIGHT = 84;
const TOP_CATEGORY_LIMIT = 24;
const TOP_TAG_LIMIT = 48;

const toDateInputValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value, endOfDay = false) => {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
    const [year, month, day] = parts;
    return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day);
};

const createDefaultDateRange = () => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
    return {
        start: toDateInputValue(ninetyDaysAgo),
        end: toDateInputValue(now),
    };
};

const ReplaySummaryCard = ({
    summary,
    selectedCategories = [],
    selectedTags = [],
    onCategoryToggle,
    onTagToggle,
}) => (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5">
        {summary.total > 0 ? (
            <Stack gap="md">
                <div>
                    <Text size="sm" fw={700}>
                        총 리플레이 {summary.total.toLocaleString('ko-KR')}개
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                        필터 조건에 부합하는 전체 리플레이 수집 결과입니다. (더 보기 데이터 포함)
                    </Text>
                </div>

                {summary.categories.length > 0 ? (
                    <div>
                        <Text size="xs" fw={600} c="dimmed">
                            카테고리 TOP {summary.categories.length}
                        </Text>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {summary.categories.map(({ label, count }) => (
                                <Badge
                                    key={label}
                                    variant="light"
                                    color={selectedCategories.includes(label) ? 'teal' : 'gray'}
                                    radius="lg"
                                    size="md"
                                    className="cursor-pointer transition-colors hover:bg-teal-400/20"
                                    onClick={() => onCategoryToggle(label)}
                                >
                                    {label} · {count.toLocaleString('ko-KR')}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ) : null}

                {summary.tags.length > 0 ? (
                    <div>
                        <Text size="xs" fw={600} c="dimmed">
                            태그 TOP {summary.tags.length}
                        </Text>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {summary.tags.map(({ label, count }) => (
                                <Badge
                                    key={label}
                                    variant="light"
                                    color={selectedTags.includes(label) ? 'teal' : 'gray'}
                                    radius="lg"
                                    size="md"
                                    className="cursor-pointer transition-colors hover:bg-teal-400/20"
                                    onClick={() => onTagToggle(label)}
                                >
                                    #{label} · {count.toLocaleString('ko-KR')}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ) : null}
            </Stack>
        ) : (
            <div className="py-4 text-center">
                <Text size="sm" c="dimmed">
                    현재 선택한 범위와 필터에 해당하는 리플레이가 없습니다.
                </Text>
            </div>
        )}
    </div>
);

const parseDate = (value) => {
    if (!value) return null;
    const safe = value.replace(' ', 'T');
    const date = new Date(safe);
    return Number.isNaN(date.getTime()) ? null : date;
};

const DATE_RANGE_FORMAT = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
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
    const [rawTimeline, setRawTimeline] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const defaultDateRangeRef = useRef(createDefaultDateRange());
    const [startDateFilter, setStartDateFilter] = useState(defaultDateRangeRef.current.start);
    const [endDateFilter, setEndDateFilter] = useState(defaultDateRangeRef.current.end);

    useEffect(() => {
        let aborted = false;

        async function load() {
            try {
                const files = ['/channel_with_replays_0.json', '/channel_with_replays_1.json'];
                const responses = await Promise.all(
                    files.map(async (file) => {
                        const res = await fetch(file);
                        if (!res.ok) {
                            throw new Error(`타임라인 데이터를 불러오지 못했습니다. 상태 코드: ${res.status} (${file})`);
                        }
                        return res.json();
                    })
                );
                const merged = responses.flat();
                if (!aborted) {
                    setRawTimeline(Array.isArray(merged) ? merged : []);
                    setLoadError(null);
                }
            } catch (error) {
                console.error(error);
                if (!aborted) {
                    setRawTimeline([]);
                    setLoadError(error);
                }
            }
        }

        load();
        return () => {
            aborted = true;
        };
    }, []);

    const timelineData = useMemo(() => {
        const parsed = Array.isArray(rawTimeline) ? rawTimeline : [];
        const startFilter = parseDateInputValue(startDateFilter, false);
        const endFilter = parseDateInputValue(endDateFilter, true);
        let startTime = startFilter ? startFilter.getTime() : null;
        let endTime = endFilter ? endFilter.getTime() : null;

        if (startTime && endTime && startTime > endTime) {
            const temp = startTime;
            startTime = endTime;
            endTime = temp;
        }

        return parsed
            .map((channel) => {
                const replays = Array.isArray(channel?.replays)
                    ? channel.replays
                        .map((replay) => {
                            const startDate = parseDate(replay.start);
                            const endDate = parseDate(replay.end);
                            if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) return null;
                            // 가끔 이상한 리플들 있어서 24시간 초과 시 제외
                            if (endDate.getTime() - startDate.getTime() > 24 * 60 * 60 * 1000) return null;
                            const startMs = startDate.getTime();
                            if (startTime && startMs < startTime) return null;
                            if (endTime && startMs > endTime) return null;
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
            .filter((channel) => channel.replays.length > 0)
            .sort((a, b) => (b?.follower ?? 0) - (a?.follower ?? 0));
    }, [rawTimeline, startDateFilter, endDateFilter]);

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

    const applyPresetRange = useCallback(
        (days) => {
            const end = new Date();
            let start = new Date(end.getTime() - days * DAY_MS);
            setStartDateFilter(toDateInputValue(start));
            setEndDateFilter(toDateInputValue(end));
        },
        []
    );

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
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);

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

    const { categoryOptions, tagOptions } = useMemo(() => {
        const categoryCounter = new Map();
        const tagCounter = new Map();

        timelineData.forEach((channel) => {
            channel.replays.forEach((replay) => {
                const category = (replay?.categoryKo ?? '').trim();
                if (category) {
                    categoryCounter.set(category, (categoryCounter.get(category) ?? 0) + 1);
                }
                if (Array.isArray(replay?.tags)) {
                    replay.tags
                        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
                        .filter(Boolean)
                        .forEach((tag) => {
                            tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + 1);
                        });
                }
            });
        });

        const categories = Array.from(categoryCounter.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.value.localeCompare(b.value, 'ko-KR');
            })
            .map(({ value, count }) => ({
                value,
                label: `${value} (${count.toLocaleString('ko-KR')}개)`,
            }));

        const tags = Array.from(tagCounter.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.value.localeCompare(b.value, 'ko-KR');
            })
            .map(({ value, count }) => ({
                value,
                label: `${value} (${count.toLocaleString('ko-KR')}개)`,
            }));

        return { categoryOptions: categories, tagOptions: tags };
    }, [timelineData]);

    const replayFilteredTimeline = useMemo(() => {
        const categorySet = new Set(selectedCategories.map((item) => item.trim()).filter(Boolean));
        const tagList = selectedTags.map((item) => item.trim()).filter(Boolean);
        const requireCategory = categorySet.size > 0;
        const requireTags = tagList.length > 0;

        if (
            replayKeywords.length === 0 &&
            !requireCategory &&
            !requireTags
        ) {
            return filteredTimeline;
        }

        return filteredTimeline
            .map((channel) => {
                const matchingReplays = channel.replays.filter((replay) => {
                    const title = (replay?.title ?? '').toLowerCase();
                    if (!replayKeywords.every((keyword) => title.includes(keyword))) return false;

                    if (requireCategory) {
                        const categoryValue = (replay?.categoryKo ?? '').trim();
                        if (!categorySet.has(categoryValue)) return false;
                    }

                    if (requireTags) {
                        if (!Array.isArray(replay?.tags)) return false;
                        const normalizedTags = replay.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean);
                        return tagList.every((tag) => normalizedTags.includes(tag));
                    }

                    return true;
                });

                if (matchingReplays.length === 0) return null;
                return { ...channel, replays: matchingReplays };
            })
            .filter(Boolean);
    }, [filteredTimeline, replayKeywords, selectedCategories, selectedTags]);

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
    }, [filterText, selectedChannelIds, replayKeywords, selectedCategories, selectedTags]);

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

    const replaySummary = useMemo(() => {
        const categoryCounter = new Map();
        const tagCounter = new Map();
        let total = 0;

        replayFilteredTimeline.forEach((channel) => {
            channel.replays.forEach((replay) => {
                total += 1;

                const category = (replay?.categoryKo ?? '').trim();
                if (category) {
                    categoryCounter.set(category, (categoryCounter.get(category) ?? 0) + 1);
                }

                if (Array.isArray(replay?.tags)) {
                    replay.tags
                        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
                        .filter(Boolean)
                        .forEach((tag) => {
                            tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + 1);
                        });
                }
            });
        });

        const categories = Array.from(categoryCounter.entries())
            .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0].localeCompare(b[0], 'ko-KR');
            })
            .slice(0, TOP_CATEGORY_LIMIT)
            .map(([label, count]) => ({ label, count }));

        const tags = Array.from(tagCounter.entries())
            .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0].localeCompare(b[0], 'ko-KR');
            })
            .slice(0, TOP_TAG_LIMIT)
            .map(([label, count]) => ({ label, count }));

        return {
            total,
            categories,
            tags,
        };
    }, [replayFilteredTimeline]);

    const canLoadMore = visibleCount < replayFilteredTimeline.length;
    const isDefaultDateRange =
        startDateFilter === defaultDateRangeRef.current.start &&
        endDateFilter === defaultDateRangeRef.current.end;
    const isFilterActive =
        filterText.trim().length > 0 ||
        selectedChannelIds.length > 0 ||
        replayTitleFilter.trim().length > 0 ||
        selectedCategories.length > 0 ||
        selectedTags.length > 0 ||
        !isDefaultDateRange;
    const selectedCount = selectedChannelIds.length;

    const resetView = useCallback(() => {
        setViewRange({ start: bounds.minTime, end: bounds.maxTime });
    }, [bounds.maxTime, bounds.minTime]);

    const handleResetFilters = () => {
        setFilterText('');
        setSelectedChannelIds([]);
        setReplayTitleFilter('');
        setSelectedCategories([]);
        setSelectedTags([]);
        const defaults = createDefaultDateRange();
        defaultDateRangeRef.current = defaults;
        setStartDateFilter(defaults.start);
        setEndDateFilter(defaults.end);
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
                                {loadError && (
                                    <Text c="red.4" size="sm" mt={6}>
                                        타임라인 데이터를 불러오지 못했습니다. 새로고침하거나 나중에 다시 시도해주세요.
                                    </Text>
                                )}
                                <Text size="md" c="dimmed" mt={6}>
                                    팔로워 수 순으로 정렬된 스트리머 방송 시간을 하나의 축에서 비교해 보세요.
                                </Text>
                                <Text size="xs" c="dimmed" mt={6}>
                                    현재 {replayFilteredTimeline.length.toLocaleString('ko-KR')}명의 스트리머가 조건에 맞습니다.
                                </Text>
                            </div>
                        </Group>
                        <Group align="flex-start" justify="space-between" gap="xl" wrap="wrap">
                            <Stack gap="xs" className="w-full max-w-5xl">
                                <Group align="flex-end" gap="sm" wrap="wrap" className="w-full">
                                    <div className="flex w-full flex-1 min-w-[240px]">
                                        <TextInput
                                            label="방제 키워드 필터"
                                            placeholder="쉼표(,)로 구분된 키워드를 모두 포함하는 리플레이만 표시"
                                            value={replayTitleFilter}
                                            onChange={(event) => setReplayTitleFilter(event.currentTarget.value)}
                                            radius="lg"
                                            size="sm"
                                            className="w-full max-w-xl"
                                        />
                                    </div>
                                    <div className="flex w-full flex-1 min-w-[240px]">
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
                                    </div>
                                </Group>
                                <Group gap="sm" align="end" className="w-full">
                                    <div className="flex w-full flex-1 min-w-[240px]">
                                        <MultiSelect
                                            data={categoryOptions}
                                            value={selectedCategories}
                                            onChange={setSelectedCategories}
                                            label="카테고리 필터"
                                            placeholder="카테고리를 선택하세요"
                                            searchable
                                            clearable
                                            radius="lg"
                                            size="sm"
                                            className="w-full max-w-xl"
                                            nothingFoundMessage="일치하는 카테고리가 없습니다."
                                            maxDropdownHeight={280}
                                        />
                                    </div>
                                    <div className="flex w-full flex-1 min-w-[240px]">
                                        <MultiSelect
                                            data={tagOptions}
                                            value={selectedTags}
                                            onChange={setSelectedTags}
                                            label="태그 필터"
                                            placeholder="태그를 선택하세요"
                                            searchable
                                            clearable
                                            radius="lg"
                                            size="sm"
                                            className="w-full max-w-xl"
                                            nothingFoundMessage="일치하는 태그가 없습니다."
                                            maxDropdownHeight={280}
                                        />
                                    </div>
                                </Group>
                            </Stack>

                            <Stack gap="xs" className="w-full max-w-sm">
                                <div className="flex items-end gap-3">
                                    <label className="flex flex-1 flex-col text-xs font-semibold text-slate-300">
                                        <span>시작일</span>
                                        <input
                                            type="date"
                                            value={startDateFilter}
                                            onChange={(event) => setStartDateFilter(event.currentTarget.value)}
                                            className="mt-1 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
                                        />
                                    </label>
                                    <span className="pb-2 text-sm text-slate-400">~</span>
                                    <label className="flex flex-1 flex-col text-xs font-semibold text-slate-300">
                                        <span>종료일</span>
                                        <input
                                            type="date"
                                            value={endDateFilter}
                                            onChange={(event) => setEndDateFilter(event.currentTarget.value)}
                                            className="mt-1 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
                                        />
                                    </label>
                                </div>
                                <Group gap="xs" wrap="nowrap">
                                    <Button
                                        variant="subtle"
                                        color="teal"
                                        radius="lg"
                                        size="xs"
                                        onClick={() => applyPresetRange(90)}
                                    >
                                        최근 3개월
                                    </Button>
                                    <Button
                                        variant="subtle"
                                        color="teal"
                                        radius="lg"
                                        size="xs"
                                        onClick={() => applyPresetRange(180)}
                                    >
                                        최근 6개월
                                    </Button>
                                    <Button
                                        variant="subtle"
                                        color="teal"
                                        radius="lg"
                                        size="xs"
                                        onClick={() => applyPresetRange(365)}
                                    >
                                        최근 1년
                                    </Button>
                                    <Button
                                        variant="subtle"
                                        color="gray"
                                        radius="lg"
                                        size="xs"
                                        onClick={() => applyPresetRange(Infinity)}
                                    >
                                        전체 기간
                                    </Button>
                                </Group>
                            </Stack>
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

                        <ReplaySummaryCard
                            summary={replaySummary}
                            selectedCategories={selectedCategories}
                            selectedTags={selectedTags}
                            onCategoryToggle={(label) => {
                                setSelectedCategories((prev) =>
                                    prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
                                );
                            }}
                            onTagToggle={(label) => {
                                setSelectedTags((prev) =>
                                    prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
                                );
                            }}
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

