import { Stack, Text } from '@mantine/core';
import { formatDuration } from './utils.js';

export const VideoInfo = ({ parsedStartTime, endTime, totalDuration }) => {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {parsedStartTime ? (
                <div>
                    <Text size="xs" c="dimmed" fw={600} mb={2}>
                        방송 시작
                    </Text>
                    <Text size="md" fw={600} className="text-slate-100">
                        {parsedStartTime.toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        })}
                    </Text>
                </div>
            ) : null}

            {endTime ? (
                <div>
                    <Text size="xs" c="dimmed" fw={600} mb={2}>
                        방송 종료
                    </Text>
                    <Text size="md" fw={600} className="text-slate-100">
                        {endTime.toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        })}
                    </Text>
                </div>
            ) : null}

            {totalDuration > 0 ? (
                <div>
                    <Text size="xs" c="dimmed" fw={600} mb={2}>
                        방송 시간
                    </Text>
                    <Text size="md" fw={600} className="text-slate-100">
                        {formatDuration(totalDuration)}
                    </Text>
                </div>
            ) : null}
        </div>
    );
};

