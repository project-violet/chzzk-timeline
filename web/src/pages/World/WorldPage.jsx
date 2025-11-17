import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildWorld } from './buildWorld.js';
import { drawWorld } from './drawWorld.js';

const CELL_SIZE = 14;
const WORLD_WIDTH = 220;
const WORLD_HEIGHT = 140;
const DETAIL_THRESHOLD = 18;
const MID_THRESHOLD = 12;
const NAME_THRESHOLD = 24;
const SEA_COLOR = '#031222';
const LAND_COLOR = '#071a2e';

const RENDER_OPTIONS = {
    cellSize: CELL_SIZE,
    detailThreshold: DETAIL_THRESHOLD,
    midThreshold: MID_THRESHOLD,
    nameThreshold: NAME_THRESHOLD,
    seaColor: SEA_COLOR,
    landColor: LAND_COLOR,
};

export default function WorldPage() {
    const [data, setData] = useState(null);
    const [seed, setSeed] = useState(() => Math.floor(Math.random() * 10_000));
    const [seedDraft, setSeedDraft] = useState('');
    const [hoverInfo, setHoverInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const canvasRef = useRef(null);
    const transformRef = useRef(d3.zoomIdentity);
    const imageCacheRef = useRef(new Map());

    useEffect(() => {
        let mounted = true;
        async function fetchData() {
            try {
                setLoading(true);
                const res = await fetch('/data.json');
                if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
                const json = await res.json();
                if (mounted) setData(json);
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchData();
        return () => {
            mounted = false;
        };
    }, []);

    const world = useMemo(() => {
        if (!data) return null;
        return buildWorld(data, { seed, width: WORLD_WIDTH, height: WORLD_HEIGHT });
    }, [data, seed]);

    useCanvasRenderer({
        canvasRef,
        world,
        transformRef,
        imageCacheRef,
        onHoverCell: setHoverInfo,
    });

    useEffect(() => {
        setSeedDraft(String(seed));
    }, [seed]);

    const commitSeed = (nextValue) => {
        if (!nextValue?.length) return;
        const parsed = Number(nextValue);
        if (Number.isNaN(parsed)) return;
        setSeed(parsed);
    };

    const handleSeedShuffle = () => {
        setSeed(Math.floor(Math.random() * 1_000_000));
    };

    return (
        <div className="relative min-h-screen bg-slate-950 text-slate-100">
            <canvas ref={canvasRef} className="block h-screen w-screen cursor-grab active:cursor-grabbing" />

            <div className="pointer-events-none absolute inset-0">
                <div className="pointer-events-auto absolute left-6 top-6 w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-slate-900/85 p-6 backdrop-blur">
                    <header className="space-y-1">
                        <p className="text-sm uppercase tracking-[0.3em] text-teal-300/80">Streamer World Map</p>
                        <h1 className="text-2xl font-bold text-white">World Map 실험실</h1>
                        <p className="text-sm text-slate-300">
                            스트리머 간 유사도와 팔로워 계층을 기반으로 생성한 가상 세계 지도입니다. 시드 값에 따라 지형이 재구성됩니다.
                        </p>
                    </header>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <InfoBadge label="왕국 수" value={world?.kingdoms.length ?? '-'} />
                        <InfoBadge label="스트리머 수" value={data?.nodes?.length ?? '-'} />
                        <InfoBadge label="월드 셀" value={`${WORLD_WIDTH} × ${WORLD_HEIGHT}`} />
                        <InfoBadge label="데이터 업데이트" value={formatUpdateTime(data?.updateTime)} />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <label htmlFor="seed-input" className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                            월드 시드
                        </label>
                        <div className="mt-2 flex gap-2">
                            <input
                                id="seed-input"
                                type="text"
                                inputMode="numeric"
                                value={seedDraft}
                                onChange={(event) => setSeedDraft(event.target.value.replace(/[^\d-]/g, ''))}
                                onBlur={() => commitSeed(seedDraft)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') commitSeed(seedDraft);
                                }}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-teal-300/70"
                            />
                            <button
                                type="button"
                                onClick={handleSeedShuffle}
                                className="rounded-xl bg-teal-500/90 px-4 text-sm font-semibold text-slate-950 transition hover:bg-teal-400/90"
                            >
                                재생성
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">동일한 시드에서는 항상 같은 지형이 만들어집니다.</p>
                    </div>
                </div>

                {hoverInfo ? <HoverCard info={hoverInfo} /> : null}

                {loading ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60">
                        <p className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200">
                            데이터 로딩 중...
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function InfoBadge({ label, value }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
        </div>
    );
}

function HoverCard({ info }) {
    const { cell, streamer, kingdom } = info;
    if (!cell) return null;

    return (
        <div className="pointer-events-none absolute bottom-6 right-6 max-w-xs rounded-3xl border border-white/10 bg-slate-900/85 p-4 text-sm text-slate-100 shadow-2xl">
            {cell.isSea ? (
                <>
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Sea of Silence</p>
                    <p className="mt-2 text-lg font-semibold text-slate-100">바다 구역</p>
                    <p className="mt-1 text-xs text-slate-400">
                        좌표 ({cell.x}, {cell.y}) — 항해 불가
                    </p>
                </>
            ) : streamer ? (
                <>
                    <div className="flex items-center gap-3">
                        <img
                            src={streamer.image}
                            alt=""
                            className="h-12 w-12 rounded-2xl border border-white/10 object-cover"
                            loading="lazy"
                        />
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.4em] text-teal-300">{streamer.role}</p>
                            <p className="truncate text-lg font-semibold text-white">{streamer.name}</p>
                        </div>
                    </div>
                    {kingdom ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">소속 왕국</p>
                            <p className="text-base font-semibold" style={{ color: kingdom.color }}>
                                {kingdom.name}
                            </p>
                        </div>
                    ) : null}
                    <dl className="mt-3 space-y-1 text-xs text-slate-300">
                        <div className="flex justify-between">
                            <dt className="text-slate-400">팔로워</dt>
                            <dd>{formatNumber(streamer.follower)}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-slate-400">채팅량</dt>
                            <dd>{formatNumber(streamer.chat_count)}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-slate-400">좌표</dt>
                            <dd>
                                ({cell.x}, {cell.y})
                            </dd>
                        </div>
                    </dl>
                </>
            ) : null}
        </div>
    );
}

function useCanvasRenderer({ canvasRef, world, transformRef, imageCacheRef, onHoverCell }) {
    const requestRef = useRef(null);
    const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
    const zoomRef = useRef(null);
    const selectionRef = useRef(null);

    const scheduleRender = useCallback(() => {
        if (!world || !canvasRef.current) return;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(() => {
            drawWorld({
                canvas: canvasRef.current,
                world,
                transform: transformRef.current,
                size: sizeRef.current,
                imageCache: imageCacheRef.current,
                onImageLoad: () => scheduleRender(),
                options: RENDER_OPTIONS,
            });
        });
    }, [canvasRef, imageCacheRef, world, transformRef]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = window.innerWidth;
            const height = window.innerHeight;
            sizeRef.current = { width, height, dpr };
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            scheduleRender();
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [canvasRef, scheduleRender]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const zoom = d3
            .zoom()
            .scaleExtent([0.25, 18])
            .on('zoom', (event) => {
                transformRef.current = event.transform;
                scheduleRender();
            });
        const selection = d3.select(canvas);
        selection.call(zoom);
        selection.on('dblclick.zoom', null);
        zoomRef.current = zoom;
        selectionRef.current = selection;
        return () => {
            selectionRef.current = null;
            selection.on('.zoom', null);
        };
    }, [canvasRef, scheduleRender, transformRef]);

    useEffect(() => {
        if (!world || !zoomRef.current || !selectionRef.current) return;
        const { width, height } = sizeRef.current;
        if (!width || !height) return;
        const worldWidthPx = world.grid.width * CELL_SIZE;
        const worldHeightPx = world.grid.height * CELL_SIZE;
        const padding = 120;
        const scaleX = width / (worldWidthPx + padding);
        const scaleY = height / (worldHeightPx + padding);
        const baseScale = clamp(Math.min(scaleX, scaleY), 0.3, 1.2);
        const tx = width / 2 - (worldWidthPx * baseScale) / 2;
        const ty = height / 2 - (worldHeightPx * baseScale) / 2;
        const initialTransform = d3.zoomIdentity.translate(tx, ty).scale(baseScale);
        zoomRef.current.extent([
            [0, 0],
            [width, height],
        ]);
        selectionRef.current.call(zoomRef.current.transform, initialTransform);
        transformRef.current = initialTransform;
        scheduleRender();
    }, [world, scheduleRender, transformRef]);

    useEffect(() => {
        if (!canvasRef.current) return undefined;
        const canvas = canvasRef.current;
        const handleMove = (event) => {
            if (!world) {
                onHoverCell(null);
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const cssX = event.clientX - rect.left;
            const cssY = event.clientY - rect.top;
            const hover = locateCell(cssX, cssY, world, transformRef.current);
            onHoverCell(hover);
        };
        const handleLeave = () => onHoverCell(null);
        canvas.addEventListener('pointermove', handleMove);
        canvas.addEventListener('pointerleave', handleLeave);
        return () => {
            canvas.removeEventListener('pointermove', handleMove);
            canvas.removeEventListener('pointerleave', handleLeave);
        };
    }, [canvasRef, onHoverCell, world, transformRef]);

    useEffect(() => {
        scheduleRender();
    }, [world, scheduleRender]);

    useEffect(() => {
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);
}

function locateCell(cssX, cssY, world, transform) {
    if (!world) return null;
    const {
        grid: { width, height, seaMask, ownerByIndex, kingByIndex },
        streamers,
        kingdoms,
    } = world;
    const worldX = (cssX - transform.x) / transform.k;
    const worldY = (cssY - transform.y) / transform.k;
    const cellX = Math.floor(worldX / CELL_SIZE);
    const cellY = Math.floor(worldY / CELL_SIZE);
    if (cellX < 0 || cellY < 0 || cellX >= width || cellY >= height) return null;
    const idx = cellY * width + cellX;
    if (seaMask[idx]) {
        return { cell: { x: cellX, y: cellY, isSea: true } };
    }
    const ownerIndex = ownerByIndex[idx];
    const kingIndex = kingByIndex[idx];
    const kingdom = kingIndex >= 0 ? kingdoms[kingIndex] : null;
    if (ownerIndex < 0) {
        return { cell: { x: cellX, y: cellY, isSea: false }, kingdom };
    }
    const streamer = streamers[ownerIndex];
    return { cell: { x: cellX, y: cellY, isSea: false }, streamer, kingdom };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value ?? 0, min), max);
}

function formatNumber(value) {
    if (value === undefined || value === null) return '-';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
}

function formatUpdateTime(updateTime) {
    if (!updateTime) return '알 수 없음';
    const date = new Date(updateTime);
    if (Number.isNaN(date.getTime())) return '알 수 없음';
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

