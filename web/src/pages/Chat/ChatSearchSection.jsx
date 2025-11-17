import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, Button, Text, Stack, NumberInput } from '@mantine/core';
import ChatTimelineChart from './ChatTimelineChart.jsx';
import { ChatTooltip } from './ChatTooltip.jsx';
import { parseChatLog, filterMessagesByKeyword, createTimelineFromMessages, extractTopKeywords } from './ChatLogParser.js';

export const ChatSearchSection = ({ videoId, startTime, chatLogText, defaultTimeline, searchKeyword: externalSearchKeyword, onSearchKeywordChange }) => {
    const [searchKeyword, setSearchKeyword] = useState(externalSearchKeyword || '');
    const [samplingInterval, setSamplingInterval] = useState(10); // 분 단위, 기본값 10분

    // 외부에서 전달된 검색어가 변경되면 내부 상태도 업데이트
    useEffect(() => {
        if (externalSearchKeyword !== undefined) {
            setSearchKeyword(externalSearchKeyword);
        }
    }, [externalSearchKeyword]);
    const [filteredTimeline, setFilteredTimeline] = useState(null);
    const [loading, setLoading] = useState(false);
    const chartContainerRef = useRef(null);
    const chartSvgRef = useRef(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState(null);
    const [isFirstRender, setIsFirstRender] = useState(true);
    const [hoveredKeywords, setHoveredKeywords] = useState(null);
    const [keywordsLoading, setKeywordsLoading] = useState(false);
    const keywordsCacheRef = useRef(new Map()); // 키워드 캐시
    const [containerWidth, setContainerWidth] = useState(null);

    // chat log 파싱
    const parsedMessages = useMemo(() => {
        if (!chatLogText) return [];
        try {
            return parseChatLog(chatLogText);
        } catch (err) {
            console.error('Failed to parse chat log:', err);
            return [];
        }
    }, [chatLogText]);

    // 검색어로 필터링된 메시지 또는 전체 메시지
    const filteredMessages = useMemo(() => {
        if (!searchKeyword.trim()) {
            // 검색어가 없으면 전체 메시지 반환
            return parsedMessages;
        }
        return filterMessagesByKeyword(parsedMessages, searchKeyword);
    }, [parsedMessages, searchKeyword]);

    // 필터링된 메시지로 타임라인 생성
    useEffect(() => {
        // parsedMessages가 있으면 항상 샘플링 간격을 적용해서 타임라인 생성
        if (filteredMessages.length > 0 && startTime) {
            setLoading(true);
            try {
                const intervalSeconds = samplingInterval * 60; // 분을 초로 변환
                const timeline = createTimelineFromMessages(filteredMessages, startTime, intervalSeconds);
                setFilteredTimeline(timeline);
            } catch (err) {
                console.error('Failed to create timeline:', err);
                setFilteredTimeline(null);
            } finally {
                setLoading(false);
            }
            return;
        }

        // parsedMessages가 없고 defaultTimeline이 있으면 그것을 사용 (fallback)
        if (!searchKeyword.trim() && defaultTimeline && defaultTimeline.length > 0 && parsedMessages.length === 0) {
            setFilteredTimeline(defaultTimeline);
            return;
        }

        // 조건에 맞지 않으면 빈 배열로 설정 (빈 차트 표시를 위해)
        if (searchKeyword.trim()) {
            // 검색어가 있지만 결과가 없으면 빈 배열
            setFilteredTimeline([]);
        } else {
            setFilteredTimeline(null);
        }
    }, [filteredMessages, startTime, searchKeyword, defaultTimeline, parsedMessages, samplingInterval]);

    // 컨테이너 너비 계산 (차트가 표시될 때만)
    useEffect(() => {
        if (!chartContainerRef.current || (filteredTimeline === null && (!searchKeyword.trim() || !startTime))) {
            return;
        }

        const updateWidth = () => {
            const container = chartContainerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            setContainerWidth(rect.width);
        };

        updateWidth();

        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(chartContainerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, [filteredTimeline, searchKeyword, startTime]);

    // 툴팁 위치 업데이트
    const handlePointScreenPosition = useCallback((pos) => {
        if (pos && pos.x > 0 && pos.y > 0) {
            setTooltipPosition(pos);
            setIsFirstRender(false);
        } else {
            setTooltipPosition(null);
            setIsFirstRender(true);
        }
    }, []);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const resultCount = filteredMessages.length;

    // 총 채팅 수 계산 (timeline의 count 합계)
    const totalCount = useMemo(() => {
        if (!filteredTimeline || filteredTimeline.length === 0) return 0;
        return filteredTimeline.reduce((sum, item) => sum + (item.count || 0), 0);
    }, [filteredTimeline]);

    // hoveredPoint 변경 시 해당 시간 범위의 키워드 추출 (캐싱 적용)
    useEffect(() => {
        if (!hoveredPoint || !startTime || !parsedMessages.length) {
            setHoveredKeywords(null);
            setKeywordsLoading(false);
            return;
        }

        // 캐시 키 생성 (time, samplingInterval, searchKeyword 조합)
        const cacheKey = `${hoveredPoint.time}_${samplingInterval}_${searchKeyword.trim()}`;

        // 캐시 확인
        const cachedKeywords = keywordsCacheRef.current.get(cacheKey);
        if (cachedKeywords !== undefined) {
            // 캐시에 있으면 즉시 표시 (로딩 없음)
            setHoveredKeywords(cachedKeywords);
            setKeywordsLoading(false);
            return;
        }

        // 캐시에 없으면 로딩 시작
        setKeywordsLoading(true);

        // 비동기로 처리하여 UI 블로킹 방지
        const timeoutId = setTimeout(() => {
            // 해당 시간 범위의 메시지 필터링
            const intervalSeconds = samplingInterval * 60;
            const startTimestamp = startTime.getTime() + hoveredPoint.time * 1000;
            const endTimestamp = startTimestamp + intervalSeconds * 1000;

            const timeRangeMessages = parsedMessages.filter((msg) => {
                return msg.timestamp >= startTimestamp && msg.timestamp < endTimestamp;
            });

            // 키워드 추출
            const keywords = extractTopKeywords(timeRangeMessages, 5, 2);

            // 캐시에 저장
            keywordsCacheRef.current.set(cacheKey, keywords);

            setHoveredKeywords(keywords);
            setKeywordsLoading(false);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hoveredPoint, startTime, samplingInterval, searchKeyword, chatLogText]);

    // 검색어나 샘플링 간격이 변경되면 캐시 초기화
    useEffect(() => {
        keywordsCacheRef.current.clear();
    }, [searchKeyword, samplingInterval]);

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-6 shadow-lg shadow-slate-900/40">
            <Text size="lg" fw={700} mb={6} className="text-slate-100">
                채팅 타임라인
            </Text>
            <Text size="sm" c="dimmed" mb={8}>
                {searchKeyword.trim()
                    ? '검색 결과의 시간별 분포'
                    : '시간별 채팅 수 변화'}
                {totalCount > 0 && (
                    <span className="ml-2">
                        (총 {totalCount.toLocaleString('ko-KR')}개)
                    </span>
                )}
            </Text>

            <Stack gap="md">
                <div className="flex gap-2 items-center">
                    <TextInput
                        placeholder="검색어를 입력하세요..."
                        value={searchKeyword}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchKeyword(value);
                            if (onSearchKeywordChange) {
                                onSearchKeywordChange(value);
                            }
                        }}
                        onKeyPress={handleKeyPress}
                        className="flex-1"
                        styles={{
                            input: {
                                backgroundColor: 'rgb(15, 23, 42)',
                                borderColor: 'rgb(51, 65, 85)',
                                color: 'rgb(241, 245, 249)',
                                '&:focus': {
                                    borderColor: 'rgb(94, 234, 212)',
                                },
                            },
                        }}
                    />
                    <div className="flex items-center gap-1.5">
                        <NumberInput
                            value={samplingInterval}
                            onChange={(value) => setSamplingInterval(typeof value === 'number' ? value : 10)}
                            min={1}
                            max={60}
                            step={1}
                            size="xs"
                            w={70}
                            styles={{
                                input: {
                                    backgroundColor: 'rgb(15, 23, 42)',
                                    borderColor: 'rgb(51, 65, 85)',
                                    color: 'rgb(241, 245, 249)',
                                    height: '36px',
                                    '&:focus': {
                                        borderColor: 'rgb(94, 234, 212)',
                                    },
                                },
                            }}
                        />
                        <Text size="sm" c="dimmed">
                            분
                        </Text>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Text size="sm" c="dimmed">
                            차트를 생성하는 중...
                        </Text>
                    </div>
                ) : (filteredTimeline !== null || (searchKeyword.trim() && startTime)) ? (
                    <div ref={chartContainerRef} className="w-full">
                        {containerWidth && (
                            <ChatTimelineChart
                                ref={chartSvgRef}
                                timeline={filteredTimeline || []}
                                width={containerWidth}
                                height={350}
                                startTime={startTime}
                                hoveredPoint={hoveredPoint}
                                onHover={(point) => {
                                    setHoveredPoint(point);
                                }}
                                onPointScreenPosition={handlePointScreenPosition}
                                onMouseMove={(pos) => {
                                    // 차트 위에서는 즉시 업데이트, tooltipPosition은 hoveredPoint 변경 시 업데이트됨
                                }}
                                onMouseLeave={() => {
                                    setHoveredPoint(null);
                                }}
                            />
                        )}
                    </div>
                ) : null}
            </Stack>

            {/* 툴팁 */}
            <ChatTooltip
                hoveredPoint={hoveredPoint}
                tooltipPosition={tooltipPosition}
                isFirstRender={isFirstRender}
                parsedStartTime={startTime}
                keywords={hoveredKeywords}
                keywordsLoading={keywordsLoading}
            />
        </div>
    );
};

