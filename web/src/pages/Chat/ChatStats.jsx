import { Group, Text } from '@mantine/core';

export const ChatStats = ({ stats }) => {
    if (!stats || stats.total === 0) return null;

    return (
        <div className="mt-3 pt-4 border-t border-slate-800/60">
            <Text size="sm" c="dimmed" fw={600} mb={4} className="uppercase tracking-wide">
                채팅 통계
            </Text>
            <Group gap="xl" wrap="wrap">
                <div>
                    <Text size="xs" c="dimmed">총 채팅 수</Text>
                    <Text size="xl" fw={700} className="text-teal-300">
                        {stats.total.toLocaleString('ko-KR')}개
                    </Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">최대 채팅 수</Text>
                    <Text size="xl" fw={700} className="text-teal-300">
                        {stats.max.toLocaleString('ko-KR')}개
                    </Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">평균 채팅 수</Text>
                    <Text size="xl" fw={700} className="text-teal-300">
                        {stats.avg.toLocaleString('ko-KR')}개
                    </Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">최소 채팅 수</Text>
                    <Text size="xl" fw={700} className="text-teal-300">
                        {stats.min.toLocaleString('ko-KR')}개
                    </Text>
                </div>
            </Group>
        </div>
    );
};

