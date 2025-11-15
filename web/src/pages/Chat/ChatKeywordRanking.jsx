import React, { useMemo } from 'react';
import { Text, Badge, Stack, ScrollArea, Loader, Center } from '@mantine/core';
import { parseChatLog, extractTopKeywords } from './ChatLogParser.js';

export const ChatKeywordRanking = ({ chatLogText, chatLogLoading, onKeywordClick }) => {
    const keywords = useMemo(() => {
        if (!chatLogText) return [];
        try {
            const messages = parseChatLog(chatLogText);
            return extractTopKeywords(messages, 1000, 2);
        } catch (err) {
            console.error('Failed to extract keywords:', err);
            return [];
        }
    }, [chatLogText]);

    return (
        <div>
            <Text size="sm" c="dimmed" fw={600} mb={4} className="uppercase tracking-wide">
                주요 키워드
            </Text>
            <div style={{ height: '600px' }}>
                {chatLogLoading ? (
                    <Center h="100%">
                        <Loader size="sm" color="teal" />
                    </Center>
                ) : keywords && keywords.length > 0 ? (
                    <ScrollArea h="100%" type="auto" offsetScrollbars>
                        <Stack gap={6}>
                            {keywords.map((item, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/50 rounded-md px-2 py-1 transition-colors"
                                    onClick={() => {
                                        if (onKeywordClick) {
                                            onKeywordClick(item.word);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Badge
                                            size="sm"
                                            radius="md"
                                            variant="light"
                                            color={index < 3 ? 'teal' : index < 10 ? 'cyan' : 'gray'}
                                            className="flex-shrink-0"
                                        >
                                            {index + 1}
                                        </Badge>
                                        <Text
                                            size="sm"
                                            className="text-slate-200 truncate"
                                            title={item.word}
                                        >
                                            {item.word}
                                        </Text>
                                    </div>
                                    <Text size="xs" c="dimmed" className="flex-shrink-0">
                                        {item.count.toLocaleString('ko-KR')} ({item.uniqueUsers || 0})
                                    </Text>
                                </div>
                            ))}
                        </Stack>
                    </ScrollArea>
                ) : null}
            </div>
        </div>
    );
};

