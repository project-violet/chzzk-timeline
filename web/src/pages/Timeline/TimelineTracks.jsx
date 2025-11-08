import PropTypes from 'prop-types';
import { Avatar, Badge, Group, Text } from '@mantine/core';

const MIN_SEGMENT_WIDTH_PERCENT = 0.6;

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

export function TimelineTracks({
    axisRef,
    axisTicks,
    channelRows,
    selectionBox,
    viewRange,
    viewSpan,
    rowHeight,
    formatDateRange,
    formatDuration,
    clamp,
}) {
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
        <>
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
        </>
    );
}

TimelineTracks.propTypes = {
    axisRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
    axisTicks: PropTypes.arrayOf(PropTypes.object).isRequired,
    channelRows: PropTypes.arrayOf(PropTypes.shape({ channel: PropTypes.object, visibleReplays: PropTypes.array })).isRequired,
    selectionBox: PropTypes.shape({
        leftPercent: PropTypes.number,
        widthPercent: PropTypes.number,
    }),
    viewRange: PropTypes.shape({ start: PropTypes.number, end: PropTypes.number }).isRequired,
    viewSpan: PropTypes.number.isRequired,
    rowHeight: PropTypes.number.isRequired,
    formatDateRange: PropTypes.func.isRequired,
    formatDuration: PropTypes.func.isRequired,
    clamp: PropTypes.func.isRequired,
};

TimelineTracks.defaultProps = {
    selectionBox: null,
};

