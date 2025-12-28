import React, { useEffect, useState } from 'react';
import { Text, Stack, ScrollArea, Loader, Center, Badge, Paper, Tooltip } from '@mantine/core';

export const PeakTimeline = ({ videoId }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!videoId) {
            setLoading(false);
            return;
        }

        let aborted = false;

        async function loadSummary() {
            try {
                setLoading(true);
                setError(null);

                const url = `/summary/${videoId}_chat_summary.json`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`요약 데이터를 불러오지 못했습니다. 상태 코드: ${response.status}`);
                }

                const data = await response.json();
                
                if (!aborted) {
                    setEvents(data.events || []);
                    setLoading(false);
                }
            } catch (err) {
                console.warn('Chat summary 로드 실패:', err);
                if (!aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }

        loadSummary();

        return () => {
            aborted = true;
        };
    }, [videoId]);

    const formatSeconds = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    if (!videoId) {
        return null;
    }

    return (
        <div>
            <Text size="sm" c="dimmed" fw={600} mb={4} className="uppercase tracking-wide">
                피크 타임라인
            </Text>
            <div style={{ height: '800px' }}>
                {loading ? (
                    <Center h="100%">
                        <Loader size="sm" color="teal" />
                    </Center>
                ) : error ? (
                    <Center h="100%">
                        <Text size="sm" c="dimmed">
                            데이터를 불러올 수 없습니다
                        </Text>
                    </Center>
                ) : events && events.length > 0 ? (
                    <ScrollArea h="100%" type="auto" offsetScrollbars>
                        <Stack gap={8}>
                            {events.map((event, index) => (
                                <Paper
                                    key={index}
                                    p="sm"
                                    className="border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition-colors rounded-lg"
                                >
                                    <Stack gap={4}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <Badge
                                                    size="sm"
                                                    radius="md"
                                                    variant="light"
                                                    color={event.event.peak_z_score > 15 ? 'red' : event.event.peak_z_score > 10 ? 'orange' : 'teal'}
                                                    className="flex-shrink-0"
                                                >
                                                    {index + 1}
                                                </Badge>
                                                {event.title && (
                                                    <Text
                                                        size="sm"
                                                        fw={600}
                                                        className="text-slate-200 truncate"
                                                        title={event.title}
                                                    >
                                                        {event.title}
                                                    </Text>
                                                )}
                                            </div>
                                            <Tooltip label={`${formatSeconds(event.event.start_sec)} - ${formatSeconds(event.event.end_sec)}`}>
                                                <Badge size="xs" variant="outline" color="gray" className="flex-shrink-0">
                                                    {formatSeconds(event.event.peak_sec)}
                                                </Badge>
                                            </Tooltip>
                                        </div>
                                        
                                        {event.summary && (
                                            <Text size="xs" c="dimmed" className="text-slate-300 line-clamp-2">
                                                {event.summary}
                                            </Text>
                                        )}
                                        
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge size="xs" variant="dot" color="cyan">
                                                Z-score: {event.event.peak_z_score.toFixed(1)}
                                            </Badge>
                                            <Badge size="xs" variant="dot" color="blue">
                                                Peak: {event.event.peak_count}
                                            </Badge>
                                        </div>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </ScrollArea>
                ) : (
                    <Center h="100%">
                        <Text size="sm" c="dimmed">
                            피크 이벤트가 없습니다
                        </Text>
                    </Center>
                )}
            </div>
        </div>
    );
};

