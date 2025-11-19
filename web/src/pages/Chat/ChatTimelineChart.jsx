import React, { useEffect, useRef, useState } from 'react';
import { formatTime, formatTimeShort } from './utils.js';

const ChatTimelineChart = React.forwardRef(({ timeline, width, height, onHover, onMouseMove, onMouseLeave, hoveredPoint, onPointScreenPosition, startTime, onPointDoubleClick }, ref) => {
    const svgRef = useRef(null);
    const [mouseX, setMouseX] = useState(0);
    const [closestPoint, setClosestPoint] = useState(null);

    // ref 전달
    React.useImperativeHandle(ref, () => svgRef.current);

    // 빈 배열인 경우 빈 차트 표시를 위한 더미 데이터
    const displayTimeline = (!timeline || timeline.length === 0) ? [{ time: 0, count: 0 }] : timeline;

    const maxCount = Math.max(...displayTimeline.map((d) => d.count));
    const minCount = 0; // Y축은 항상 0부터 시작
    const maxTime = Math.max(...displayTimeline.map((d) => d.time)) || 3600; // 기본값 1시간
    const padding = { top: 40, right: 0, bottom: 60, left: 30 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (time) => (time / maxTime) * chartWidth;
    const yScale = (count) => chartHeight - (count / (maxCount || 1)) * chartHeight;

    const points = displayTimeline.map((d) => ({
        x: xScale(d.time),
        y: yScale(d.count),
        time: d.time,
        count: d.count,
    }));

    const handleMouseMove = (event) => {
        if (!svgRef.current) return;

        const svg = svgRef.current;
        const svgRect = svg.getBoundingClientRect();
        const x = event.clientX - svgRect.left - padding.left;
        const y = event.clientY - svgRect.top - padding.top;

        // 마우스 위치를 화면 전체 기준으로 전달
        if (onMouseMove) {
            onMouseMove({ x: event.clientX, y: event.clientY });
        }

        // 차트 영역 내부인지 확인
        if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) {
            setMouseX(-1); // 차트 영역 밖
            if (onHover) {
                onHover(null);
            }
            return;
        }

        // 마우스 X 위치 저장 (차트 내부 좌표)
        setMouseX(x);

        // 가장 가까운 데이터 포인트 찾기
        let closestPoint = null;
        let minDistance = Infinity;

        points.forEach((point) => {
            const distance = Math.abs(point.x - x);
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = point;
            }
        });

        if (closestPoint && minDistance < chartWidth / (points.length * 2)) {
            if (onHover) {
                onHover(closestPoint);
                setClosestPoint(closestPoint);
            }
        }
    };

    const handleMouseLeave = () => {
        setMouseX(-1); // 차트 영역 밖
        if (onHover) {
            onHover(null);
        }
        if (onMouseLeave) {
            onMouseLeave();
        }
    };

    const handleDoubleClick = (event) => {
        if (!onPointDoubleClick) {
            return;
        }
        if (closestPoint) {
            onPointDoubleClick(closestPoint);
        }
    };

    // hoveredPoint 변경 시 화면 좌표 전달
    useEffect(() => {
        if (!hoveredPoint || !svgRef.current || !onPointScreenPosition) {
            // hoveredPoint가 없을 때는 좌표를 전달하지 않음
            return;
        }

        const svg = svgRef.current;
        const svgRect = svg.getBoundingClientRect();
        const screenX = svgRect.left + padding.left + hoveredPoint.x;
        const screenY = svgRect.top + padding.top + hoveredPoint.y;

        onPointScreenPosition({ x: screenX, y: screenY });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hoveredPoint, onPointScreenPosition]);

    // 차트 영역 그리기
    const pathData = points
        .map((point, index) => {
            if (index === 0) return `M ${point.x} ${point.y}`;
            return `L ${point.x} ${point.y}`;
        })
        .join(' ');

    // 영역 채우기
    const areaPath = `${pathData} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

    // X축 틱 생성 (최대 10개)
    const tickCount = Math.min(10, displayTimeline.length);
    const timeTicks = [];
    for (let i = 0; i < tickCount; i++) {
        const index = Math.floor((i / (tickCount - 1)) * (displayTimeline.length - 1));
        if (displayTimeline[index]) {
            const relativeTime = displayTimeline[index].time;
            const absoluteTime = startTime ? new Date(startTime.getTime() + relativeTime * 1000) : null;

            timeTicks.push({
                time: relativeTime,
                label: absoluteTime
                    ? absoluteTime.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    })
                    : formatTimeShort(relativeTime),
            });
        }
    }

    // Y축 틱 생성
    const yTickCount = 5;
    const yTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
        const value = (maxCount / yTickCount) * i;
        yTicks.push(Math.round(value));
    }

    return (
        <svg
            ref={svgRef}
            width={width}
            height={height}
            className="overflow-visible cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
        >
            <defs>
                <linearGradient id="chatGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgb(94, 234, 212)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(94, 234, 212)" stopOpacity="0.05" />
                </linearGradient>
            </defs>

            {/* 배경 그리드 */}
            <g transform={`translate(${padding.left}, ${padding.top})`}>
                {yTicks.map((tick, i) => {
                    const y = yScale(tick);
                    return (
                        <g key={`grid-${i}`}>
                            <line
                                x1={0}
                                y1={y}
                                x2={chartWidth}
                                y2={y}
                                stroke="rgb(51, 65, 85)"
                                strokeWidth="1"
                                strokeDasharray="2,2"
                                opacity="0.3"
                            />
                            <text
                                x={-10}
                                y={y + 4}
                                fill="rgb(148, 163, 184)"
                                fontSize="12"
                                textAnchor="end"
                                alignmentBaseline="middle"
                            >
                                {tick}
                            </text>
                        </g>
                    );
                })}

                {/* X축 그리드 */}
                {timeTicks.map((tick, i) => {
                    const x = xScale(tick.time);
                    return (
                        <g key={`x-grid-${i}`}>
                            <line
                                x1={x}
                                y1={0}
                                x2={x}
                                y2={chartHeight}
                                stroke="rgb(51, 65, 85)"
                                strokeWidth="1"
                                strokeDasharray="2,2"
                                opacity="0.3"
                            />
                            <text
                                x={x}
                                y={chartHeight + 20}
                                fill="rgb(148, 163, 184)"
                                fontSize="12"
                                textAnchor="middle"
                            >
                                {tick.label}
                            </text>
                        </g>
                    );
                })}
            </g>

            {/* 영역 채우기 */}
            <g transform={`translate(${padding.left}, ${padding.top})`}>
                <path
                    d={areaPath}
                    fill="url(#chatGradient)"
                    stroke="none"
                />
            </g>

            {/* 라인 */}
            <g transform={`translate(${padding.left}, ${padding.top})`}>
                <path
                    d={pathData}
                    fill="none"
                    stroke="rgb(94, 234, 212)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </g>

            {/* 포인트 */}
            <g transform={`translate(${padding.left}, ${padding.top})`}>
                {points.map((point, index) => {
                    const isHovered = hoveredPoint && hoveredPoint.time === point.time;
                    return (
                        <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r={isHovered ? "6" : "4"}
                            fill="rgb(94, 234, 212)"
                            stroke="rgb(15, 118, 110)"
                            strokeWidth={isHovered ? "3" : "2"}
                            className="transition-all cursor-pointer"
                            style={{
                                filter: isHovered ? 'drop-shadow(0 0 4px rgba(94, 234, 212, 0.8))' : 'none',
                            }}
                        >
                            <title>{`시간: ${formatTime(point.time)}, 채팅: ${point.count}개`}</title>
                        </circle>
                    );
                })}
            </g>

            {/* 수직 가이드 라인 (호버 시) - 데이터 포인트 위치에 표시 */}
            {hoveredPoint ? (
                <g transform={`translate(${padding.left}, ${padding.top})`}>
                    <line
                        x1={hoveredPoint.x}
                        y1={0}
                        x2={hoveredPoint.x}
                        y2={chartHeight}
                        stroke="rgb(94, 234, 212)"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                        opacity="0.6"
                        pointerEvents="none"
                        className="transition-all duration-300 ease-out"
                    />
                    <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="8"
                        fill="rgb(94, 234, 212)"
                        stroke="rgb(15, 118, 110)"
                        strokeWidth="2"
                        opacity="0.9"
                        pointerEvents="none"
                        className="transition-all duration-300 ease-out"
                        style={{
                            filter: 'drop-shadow(0 0 4px rgba(94, 234, 212, 0.8))',
                        }}
                    />
                </g>
            ) : null}

            {/* 축 레이블 */}
            <text
                x={width / 2}
                y={height - 10}
                fill="rgb(148, 163, 184)"
                fontSize="14"
                fontWeight="600"
                textAnchor="middle"
            >
                시간
            </text>
        </svg>
    );
});

ChatTimelineChart.displayName = 'ChatTimelineChart';

export default ChatTimelineChart;

