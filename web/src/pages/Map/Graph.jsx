import { useState, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

const IMAGE_FALLBACK =
    'https://ssl.pstatic.net/cmstatic/nng/img/img_anonymous_square_gray_opacity2x.png?type=f120_120_na';

/* ---------- 클러스터 라벨링: 임계치 이상 링크만 이용해 연결요소로 cluster 부여 ---------- */
function labelClustersByThreshold(nodes, links, threshold = 0.2) {
    const strong = links.filter((l) => (l.distance ?? 0) >= threshold);

    const id2idx = new Map(nodes.map((n, i) => [n.id, i]));
    const parent = nodes.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const unite = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parent[b] = a;
    };

    strong.forEach((l) => {
        const sid = typeof l.source === 'object' ? l.source.id : l.source;
        const tid = typeof l.target === 'object' ? l.target.id : l.target;
        if (id2idx.has(sid) && id2idx.has(tid)) unite(id2idx.get(sid), id2idx.get(tid));
    });

    const root2cid = new Map();
    let cidSeq = 0;
    nodes.forEach((n, i) => {
        const r = find(i);
        if (!root2cid.has(r)) root2cid.set(r, cidSeq++);
        n.cluster = root2cid.get(r);
    });
    return nodes;
}

/* ---------- 클러스터 원(centroid, radius) 계산 ---------- */
function computeClusterCircles(nodes, pad = 40) {
    const byCluster = d3.group(nodes, (d) => d.cluster);
    const circles = new Map(); // clusterId -> { cx, cy, r }

    for (const [cid, group] of byCluster) {
        const cx = d3.mean(group, (d) => d.x) ?? 0;
        const cy = d3.mean(group, (d) => d.y) ?? 0;
        let r = 0;
        for (const n of group) {
            const dx = (n.x ?? 0) - cx;
            const dy = (n.y ?? 0) - cy;
            const dist = Math.hypot(dx, dy) + (n.r ?? 0);
            if (dist > r) r = dist;
        }
        r += pad;
        circles.set(cid, { cx, cy, r });
    }
    return circles;
}

/* ---------- 클러스터 원-원 겹침 해소 ---------- */
function resolveClusterOverlaps(circles, k = 0.7) {
    const arr = Array.from(circles.entries()); // [cid, {cx,cy,r}]
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const [ci, ai] = arr[i];
            const [cj, aj] = arr[j];
            const dx = aj.cx - ai.cx;
            const dy = aj.cy - ai.cy;
            let d = Math.hypot(dx, dy) || 1e-6;
            const minDist = ai.r + aj.r;
            if (d < minDist) {
                const overlap = (minDist - d) * k;
                const ux = dx / d;
                const uy = dy / d;
                ai.cx -= ux * overlap;
                ai.cy -= uy * overlap;
                aj.cx += ux * overlap;
                aj.cy += uy * overlap;
            }
        }
    }
}

export function GraphContainer({ data, selectedChannel, setSelectedChannel, svgRef, rootRef }) {
    return (
        <svg ref={svgRef} className="h-screen w-screen bg-slate-950/95 text-slate-100">
            <g ref={rootRef}>
                {data ? (
                    <Graph
                        data={data}
                        selectedChannel={selectedChannel}
                        setSelectedChannel={setSelectedChannel}
                    />
                ) : null}
            </g>
        </svg>
    );
}

function Graph({ data, selectedChannel, setSelectedChannel }) {
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);
    const simRef = useRef(null);

    /* ---------- 스케일 안전화 ---------- */
    const followerExtent = useMemo(() => {
        const ext = d3.extent(data.nodes, (d) => d.follower ?? 0);
        if (ext[0] === undefined || ext[1] === undefined) return [0, 1];
        if (ext[0] === ext[1]) return [ext[0], ext[0] + 1];
        return ext;
    }, [data.nodes]);

    const distanceExtent = useMemo(() => {
        const ext = d3.extent(data.links, (d) => d.distance ?? 0);
        if (ext[0] === undefined || ext[1] === undefined) return [0, 1];
        if (ext[0] === ext[1]) return [ext[0], ext[0] + 1];
        return ext;
    }, [data.links]);

    const scaleRadius = useMemo(
        () => d3.scaleLinear().domain(followerExtent).range([20, 80]).nice(),
        [followerExtent]
    );

    const scaleDistance = useMemo(
        () => d3.scalePow().exponent(0.3).domain(distanceExtent).range([2000, 100]),
        [distanceExtent]
    );

    /* ---------- 클러스터 라벨 계산 ---------- */
    const CLUSTER_TH = 0.4; // 군집 형성 임계치
    const clusteredData = useMemo(() => {
        const n = data.nodes.map((d) => ({ ...d }));
        const l = data.links.map((d) => ({ ...d }));
        labelClustersByThreshold(n, l, CLUSTER_TH);
        return { nodes: n, links: l };
    }, [data, CLUSTER_TH]);

    /* ---------- 클러스터 컬러 / 중심(격자) ---------- */
    const clusters = useMemo(
        () => Array.from(new Set(clusteredData.nodes.map((n) => n.cluster ?? 0))),
        [clusteredData.nodes]
    );
    const colorByCluster = useMemo(() => {
        const brightened = d3.schemeTableau10.map((color) =>
            d3.interpolateRgb(color, '#ffffff')(0.72)
        );
        return d3.scaleOrdinal(brightened).domain(clusters);
    }, [clusters]);

    const centersGrid = useMemo(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cols = Math.ceil(Math.sqrt(clusters.length || 1));
        const gap = 260;
        const cx0 = w / 2 - ((cols - 1) * gap) / 2;
        const cy0 = h / 2 - ((Math.ceil((clusters.length || 1) / cols) - 1) * gap) / 2;

        const map = new Map();
        clusters.forEach((c, i) => {
            const cx = cx0 + (i % cols) * gap;
            const cy = cy0 + Math.floor(i / cols) * gap;
            map.set(c, { x: cx, y: cy });
        });
        return map;
    }, [clusters]);

    /* ---------- 선택된 링크(유사도 굵기 표시) ---------- */
    const TH = 0.1;
    const selectedLink = useMemo(() => {
        if (!selectedChannel) return [];
        return links.filter((l) => {
            const s = typeof l.source === 'object' ? l.source : nodes.find((n) => n.id === l.source);
            const t = typeof l.target === 'object' ? l.target : nodes.find((n) => n.id === l.target);
            return (s?.name === selectedChannel || t?.name === selectedChannel) && (l.distance ?? 0) >= TH;
        });
    }, [links, nodes, selectedChannel]);

    const strokeScale = useMemo(() => {
        if (!selectedLink.length) return d3.scaleLinear().domain([0, 1]).range([2, 10]);
        const ext = d3.extent(selectedLink, (d) => d.distance ?? 0);
        const lo = ext[0] ?? 0;
        const hi = ext[1] ?? 1;
        const safeHi = lo === hi ? lo + 1e-6 : hi;
        return d3.scaleLinear().domain([lo, safeHi]).range([3, 14]).nice();
    }, [selectedLink]);

    /* ---------- 시뮬레이션 ---------- */
    useEffect(() => {
        // 노드를 최대 300개로 제한
        const MAX_NODES = 300;
        const limitedNodes = clusteredData.nodes
            .slice(0, MAX_NODES)
            .map((d) => ({ ...d }));

        // 제한된 노드의 ID 집합 생성
        const nodeIdSet = new Set(limitedNodes.map((n) => n.id));

        // 제한된 노드에 연결된 링크만 필터링
        const simLinks = clusteredData.links
            .filter((l) => {
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                return nodeIdSet.has(sourceId) && nodeIdSet.has(targetId);
            })
            .map((l) => ({ ...l }));

        const simNodes = limitedNodes;

        // 노드 반경을 미리 넣어두면 클러스터 반지름 계산에 유리
        simNodes.forEach((n) => {
            n.r = scaleRadius(n.follower ?? 0);
        });

        if (simRef.current) {
            simRef.current.stop();
            simRef.current = null;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        const simulation = d3
            .forceSimulation(simNodes)
            .force(
                'link',
                d3
                    .forceLink(simLinks)
                    .id((d) => d.id)
                    .distance((d) => scaleDistance(d.distance ?? 0))
                    .strength(0.8)
            )
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('many', d3.forceManyBody().strength(-50))
            .force('col', d3.forceCollide((d) => d.r).strength(0.9))
            // 초기에는 격자 중심으로 살짝 끌어당김
            .force('clusterX', d3.forceX((d) => centersGrid.get(d.cluster)?.x ?? width / 2).strength(0.12))
            .force('clusterY', d3.forceY((d) => centersGrid.get(d.cluster)?.y ?? height / 2).strength(0.12))
            .alpha(1)
            .alphaDecay(0.03);

        // tick마다: 클러스터 원 계산 -> 원-원 겹침 해소 -> 그 결과를 forceX/Y 타겟으로 사용
        let tickCount = 0;
        simulation.on('tick', () => {
            tickCount += 1;

            if (tickCount % 2 === 0) {
                const circles = computeClusterCircles(simNodes, 40);
                resolveClusterOverlaps(circles, 0.7);

                simulation
                    .force('clusterX', d3.forceX((d) => circles.get(d.cluster)?.cx ?? width / 2).strength(0.18))
                    .force('clusterY', d3.forceY((d) => circles.get(d.cluster)?.cy ?? height / 2).strength(0.18));
            }

            setNodes([...simNodes]);
            setLinks([...simLinks]);
        });

        simRef.current = simulation;

        // 리사이즈 대응
        const onResize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            simulation.force('center', d3.forceCenter(w / 2, h / 2));
            simulation.alpha(0.2).restart();
        };
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            simulation.stop();
            simRef.current = null;
        };
    }, [clusteredData, centersGrid, scaleDistance, scaleRadius]);

    /* ---------- 헐(외곽선) 계산 ---------- */
    const hulls = useMemo(() => {
        const grouped = d3.group(nodes, (d) => d.cluster);
        const result = [];
        for (const [cid, groupNodes] of grouped) {
            const pts = groupNodes
                .map((n) => [n.x, n.y])
                .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
            if (pts.length >= 3) {
                const hull = d3.polygonHull(pts);
                if (hull) {
                    const cx = d3.mean(hull, (p) => p[0]);
                    const cy = d3.mean(hull, (p) => p[1]);
                    result.push({ cid, hull, cx, cy });
                }
            }
        }
        return result;
    }, [nodes]);

    // 선택 노드가 없을 때 전체 링크를 연하게 깔아 대비를 주고 싶으면 true로 바꿔도 됨
    const SHOW_FAINT_BG_LINKS = false;

    return (
        <>
            {/* 노드 이미지 패턴 */}
            <defs>
                {nodes.map(({ id, image }) => (
                    <pattern key={`pat-${id}`} id={`pat-${id}`} width="1" height="1" patternContentUnits="objectBoundingBox">
                        <image href={image || IMAGE_FALLBACK} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                    </pattern>
                ))}
            </defs>

            {/* 클러스터 헐(겹치지 않도록 배치된 외곽) */}
            <g>
                {hulls.map(({ cid, hull }) => (
                    <path
                        key={`hull-${cid}`}
                        d={`M${hull.map((p) => p.join(',')).join('L')}Z`}
                        fill={colorByCluster(cid)}
                        opacity={0.12}
                        stroke={colorByCluster(cid)}
                        strokeWidth={1.5}
                    />
                ))}
            </g>

            {/* 배경 링크 (연하게) */}
            {SHOW_FAINT_BG_LINKS && (
                <g>
                    {links.map(({ source, target }, i) => {
                        const s = typeof source === 'object' ? source : nodes.find((n) => n.id === source);
                        const t = typeof target === 'object' ? target : nodes.find((n) => n.id === target);
                        if (!s || !t) return null;
                        return (
                            <line
                                key={`bg-${s.id}-${t.id}-${i}`}
                                x1={s.x}
                                y1={s.y}
                                x2={t.x}
                                y2={t.y}
                                stroke="currentColor"
                                className="text-gray-400"
                                strokeWidth={1}
                                opacity={0.15}
                            />
                        );
                    })}
                </g>
            )}

            {/* 선택된 링크 하이라이트 (굵기 = distance) */}
            <g>
                {selectedLink.map(({ source, target, distance }) => {
                    const s = typeof source === 'object' ? source : nodes.find((n) => n.id === source);
                    const t = typeof target === 'object' ? target : nodes.find((n) => n.id === target);
                    if (!s || !t) return null;

                    function adjustDistanceSoft(distance, k = 10) {
                        const centeredX = distance - 0.4;
                        const adjustedX = k * centeredX;
                        return 1.0 / (1.0 + Math.exp(-adjustedX));
                    }
                    const adjustedDistance = adjustDistanceSoft(distance ?? 0);

                    return (
                        <line
                            key={`hl-${s.id}-${t.id}`}
                            x1={s.x}
                            y1={s.y}
                            x2={t.x}
                            y2={t.y}
                            stroke="currentColor"
                            className="text-gray-200 dark:text-gray-300"
                            strokeWidth={strokeScale(adjustedDistance ?? 0)}
                            opacity={0.9}
                        />
                    );
                })}
            </g>

            {/* 노드 */}
            <g>
                {nodes.map(({ id, x, y, follower, name, cluster }) => (
                    <circle
                        key={`node-${id}`}
                        onClick={() => setSelectedChannel?.(name)}
                        cx={x}
                        cy={y}
                        r={scaleRadius(follower ?? 0)}
                        fill={`url(#pat-${id})`}
                        stroke={colorByCluster(cluster)}
                        strokeWidth={2}
                        className="hover:brightness-50 cursor-pointer"
                    />
                ))}
            </g>

            {/* 라벨 */}
            <g>
                {nodes.map(({ id, x, y, follower, name }) => (
                    <text
                        key={`label-${id}`}
                        x={x}
                        y={(y ?? 0) + scaleRadius(follower ?? 0) + 20}
                        textAnchor="middle"
                        className="cursor-default dark:fill-gray-300"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                        {name}
                    </text>
                ))}
            </g>

            {/* (선택) 클러스터 라벨 중앙에 찍기
      <g>
        {hulls.map(({ cid, cx, cy }) => (
          <text
            key={`clabel-${cid}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            className="text-xs dark:fill-gray-300"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            Cluster {cid}
          </text>
        ))}
      </g>
      */}
        </>
    );
}

