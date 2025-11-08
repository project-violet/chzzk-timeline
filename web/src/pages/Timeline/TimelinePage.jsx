import { useMemo, useState } from 'react';
import timelineRaw from '../../../../data/channel_with_replays.json?raw';
import {
    Avatar,
    Badge,
    Button,
    Card,
    Container,
    Group,
    Stack,
    Text,
    Timeline,
    Title,
} from '@mantine/core';

const TIMELINE_BATCH = 16;

const parseDate = (value) => {
    if (!value) return null;
    const safe = value.replace(' ', 'T');
    const date = new Date(safe);
    return Number.isNaN(date.getTime()) ? null : date;
};

const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const formatDateRange = (start, end) => {
    const startDate = parseDate(start);
    const endDate = parseDate(end);

    if (!startDate && !endDate) return '시간 정보 없음';
    if (startDate && !endDate) return `${DATE_FORMATTER.format(startDate)} 시작`;
    if (!startDate && endDate) return `${DATE_FORMATTER.format(endDate)} 종료`;

    return `${DATE_FORMATTER.format(startDate)} ~ ${DATE_FORMATTER.format(endDate)}`;
};

const formatDuration = (start, end) => {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate) return null;

    const diff = Math.max(endDate.getTime() - startDate.getTime(), 0);
    const totalMinutes = Math.round(diff / 60000);
    if (totalMinutes <= 0) return '1분 미만';

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}시간`);
    if (minutes > 0) parts.push(`${minutes}분`);

    return parts.join(' ') || '1분 미만';
};

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

const TimelinePage = () => {
    const timelineData = useMemo(() => {
        const parsed = JSON.parse(timelineRaw ?? '[]');
        return parsed
            .map((channel) => ({
                ...channel,
                replays: Array.isArray(channel?.replays)
                    ? [...channel.replays].sort(
                        (a, b) => (parseDate(b?.start)?.getTime() ?? 0) - (parseDate(a?.start)?.getTime() ?? 0)
                    )
                    : [],
            }))
            .sort((a, b) => (b?.follower ?? 0) - (a?.follower ?? 0));
    }, []);

    const [visibleCount, setVisibleCount] = useState(TIMELINE_BATCH);
    const visibleChannels = useMemo(
        () => timelineData.slice(0, Math.min(visibleCount, timelineData.length)),
        [timelineData, visibleCount]
    );

    return (
        <div className="min-h-screen bg-slate-950/95 pb-24 pt-32 text-slate-100">
            <Container size="xl">
                <Stack gap="md">
                    <div>
                        <Title order={1} size={38} fw={800}>
                            스트리머 타임라인
                        </Title>
                        <Text size="lg" c="dimmed" mt={8}>
                            최근 리플레이를 팔로워 수 기준으로 정렬해 시간 순으로 확인하세요.
                        </Text>
                    </div>

                    <Stack gap="xl" mt="lg">
                        {visibleChannels.map((channel) => (
                            <Card
                                key={channel.channelId}
                                radius="xl"
                                padding="xl"
                                shadow="xl"
                                className="border border-slate-800/80 bg-slate-900/70 backdrop-blur"
                            >
                                <Group gap="lg" align="center" wrap="nowrap">
                                    <Avatar
                                        src={channel.image}
                                        radius="xl"
                                        size={80}
                                        alt={channel.name}
                                        className="shadow-lg"
                                    >
                                        {getInitials(channel.name)}
                                    </Avatar>
                                    <div>
                                        <Title order={2} size={28}>
                                            {channel.name}
                                        </Title>
                                        <Group gap="xs" mt={8}>
                                            <Badge size="lg" radius="lg" variant="light" color="teal">
                                                팔로워 {Number(channel.follower ?? 0).toLocaleString('ko-KR')}
                                            </Badge>
                                            <Badge size="lg" radius="lg" variant="light" color="blue">
                                                리플레이 {channel.replays.length.toLocaleString('ko-KR')}개
                                            </Badge>
                                        </Group>
                                    </div>
                                </Group>

                                <Timeline
                                    className="mt-8"
                                    color="teal"
                                    active={-1}
                                    bulletSize={16}
                                    lineWidth={2}
                                >
                                    {channel.replays.map((replay, index) => (
                                        <Timeline.Item
                                            key={`${channel.channelId}-${index}-${replay.start}`}
                                            title={
                                                <Text fw={600} size="lg">
                                                    {replay.title}
                                                </Text>
                                            }
                                        >
                                            <Text size="sm" c="dimmed">
                                                {formatDateRange(replay.start, replay.end)}
                                            </Text>
                                            {formatDuration(replay.start, replay.end) ? (
                                                <Text size="sm" mt={4} c="gray.3">
                                                    방송 길이 {formatDuration(replay.start, replay.end)}
                                                </Text>
                                            ) : null}
                                        </Timeline.Item>
                                    ))}
                                </Timeline>
                            </Card>
                        ))}
                    </Stack>

                    {visibleCount < timelineData.length ? (
                        <Button
                            variant="light"
                            color="teal"
                            radius="lg"
                            size="md"
                            className="mx-auto mt-6 w-full max-w-sm"
                            onClick={() => setVisibleCount((count) => count + TIMELINE_BATCH)}
                        >
                            더 보기
                        </Button>
                    ) : null}
                </Stack>
            </Container>
        </div>
    );
};

export default TimelinePage;
