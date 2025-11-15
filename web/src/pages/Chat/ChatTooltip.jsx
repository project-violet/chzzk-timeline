import { Badge, Loader, Group, Text } from '@mantine/core';
import { formatTime } from './utils.js';

export const ChatTooltip = ({ hoveredPoint, tooltipPosition, isFirstRender, parsedStartTime, keywords, keywordsLoading }) => {
    if (!hoveredPoint || !tooltipPosition) { return null; }

    return (
        <div
            className={`fixed pointer-events-none z-50 ${isFirstRender ? '' : 'transition-all duration-300 ease-out'}`}
            style={{
                left: `${tooltipPosition.x + 15}px`,
                top: `${tooltipPosition.y - 70}px`,
                transform: 'translateY(-50%)',
            }}
        >
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/95 px-4 py-3 shadow-lg shadow-slate-900/40 min-w-[180px]">
                <div className="space-y-2">
                    <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            다시보기 시간
                        </div>
                        <div className="text-sm font-semibold text-slate-100">
                            {formatTime(hoveredPoint.time)}
                        </div>
                    </div>
                    {parsedStartTime ? (
                        <div>
                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                시간
                            </div>
                            <div className="text-sm font-semibold text-slate-100">
                                {new Date(parsedStartTime.getTime() + hoveredPoint.time * 1000).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: false,
                                })}
                            </div>
                        </div>
                    ) : null}
                    <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            채팅 수
                        </div>
                        <div className="text-sm font-bold text-teal-300">
                            {hoveredPoint.count.toLocaleString('ko-KR')}개
                        </div>
                    </div>
                    {keywordsLoading ? (
                        <div className="mt-4 flex items-center gap-2">
                            <Loader size="xs" color="teal" />
                            <Text size="xs" c="dimmed">
                                키워드 로딩 중...
                            </Text>
                        </div>
                    ) : keywords && keywords.length > 0 ? (
                        <div className="mt-4">
                            <Text size="xs" c="dimmed" fw={600} className="uppercase tracking-wide mb-2">
                                주요 키워드
                            </Text>
                            <div className="flex flex-col gap-2">
                                {/* 첫 줄: 상위 3개 */}
                                <div className="flex gap-2 flex-wrap">
                                    {keywords.slice(0, 3).map((keyword, index) => (
                                        <Badge
                                            key={keyword.word}
                                            size="sm"
                                            radius="md"
                                            variant="light"
                                            color="teal"
                                        >
                                            {index + 1}. {keyword.word} ({keyword.count.toLocaleString('ko-KR')})
                                        </Badge>
                                    ))}
                                </div>
                                {/* 둘째 줄: 나머지 2개 */}
                                {keywords.length > 3 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {keywords.slice(3, 5).map((keyword, index) => (
                                            <Badge
                                                key={keyword.word}
                                                size="sm"
                                                radius="md"
                                                variant="light"
                                                color="cyan"
                                            >
                                                {index + 4}. {keyword.word} ({keyword.count.toLocaleString('ko-KR')})
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

