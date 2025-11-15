import { Stack, Text } from '@mantine/core';
import { formatDateRange, formatDuration } from './utils.js';

export const VideoInfo = ({ parsedStartTime, endTime, totalDuration }) => {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {totalDuration > 0 ? (
                <div>
                    <Text size="xs" c="dimmed" fw={600} mb={2}>
                        방송 길이
                    </Text>
                    <Text size="md" fw={600} className="text-slate-100">
                        {formatDuration(totalDuration)}
                    </Text>
                </div>
            ) : null}

            {parsedStartTime && endTime ? (
                <div>
                    <Text size="xs" c="dimmed" fw={600} mb={2}>
                        방송 기간
                    </Text>
                    <Text size="md" fw={600} className="text-slate-100">
                        {formatDateRange(parsedStartTime, endTime)}
                    </Text>
                </div>
            ) : null}
        </div>
    );
};

