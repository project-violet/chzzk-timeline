import { useState, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

const IMAGE_FALLBACK = 'https://ssl.pstatic.net/cmstatic/nng/img/img_anonymous_square_gray_opacity2x.png?type=f120_120_na';

// ====== 유틸: 연결요소로 클러스터 라벨링 (임계치 이상 링크만) ======
function labelClustersByThreshold(nodes, links, threshold = 0.2) {
  const strong = links.filter(l => (l.distance ?? 0) >= threshold);

  const id2idx = new Map(nodes.map((n, i) => [n.id, i]));
  const parent = nodes.map((_, i) => i);
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  strong.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (id2idx.has(s) && id2idx.has(t)) unite(id2idx.get(s), id2idx.get(t));
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

export function GraphContainer({ data, selectedChannel, setSelectedChannel, svgRef, rootRef }) {
  return (
    <svg ref={svgRef} className="w-screen h-screen dark:bg-gray-700">
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

  // ====== 스케일 안전화 ======
  const followerExtent = useMemo(() => {
    const ext = d3.extent(data.nodes, d => d.follower ?? 0);
    if (ext[0] === undefined || ext[1] === undefined) return [0, 1];
    if (ext[0] === ext[1]) return [ext[0], ext[0] + 1];
    return ext;
  }, [data.nodes]);

  const distanceExtent = useMemo(() => {
    const ext = d3.extent(data.links, d => d.distance ?? 0);
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

  // ====== 선택 링크(하이라이트) ======
  const selectedLink = useMemo(() => {
    if (!selectedChannel) return [];
    const TH = 0.05;
    return links.filter(l => {
      const s = typeof l.source === 'object' ? l.source : nodes.find(n => n.id === l.source);
      const t = typeof l.target === 'object' ? l.target : nodes.find(n => n.id === l.target);
      return (s?.name === selectedChannel || t?.name === selectedChannel) && (l.distance ?? 0) >= TH;
    });
  }, [links, nodes, selectedChannel]);

  // ====== 클러스터 라벨 계산 (임계치 조정 가능) ======
  const CLUSTER_TH = 0.3; // 군집을 만들 강한 링크 기준
  const clusteredData = useMemo(() => {
    // 원본 변형 방지
    const n = data.nodes.map(d => ({ ...d }));
    const l = data.links.map(d => ({ ...d }));
    labelClustersByThreshold(n, l, CLUSTER_TH);
    return { nodes: n, links: l };
  }, [data, CLUSTER_TH]);

  // ====== 클러스터 색상 스케일 ======
  const clusters = useMemo(
    () => Array.from(new Set(clusteredData.nodes.map(n => n.cluster ?? 0))),
    [clusteredData.nodes]
  );
  const colorByCluster = useMemo(
    () => d3.scaleOrdinal(d3.schemeTableau10).domain(clusters),
    [clusters]
  );

  // ====== 클러스터 중심(격자) 생성 및 끌어당기는 force ======
  const centers = useMemo(() => {
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

  // ====== 시뮬레이션 ======
  useEffect(() => {
    const simNodes = clusteredData.nodes.map(d => ({ ...d }));
    const simLinks = clusteredData.links.map(l => ({ ...l }));

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
          .id(d => d.id)
          .distance(d => scaleDistance(d.distance ?? 0))
          .strength(0.8)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('many', d3.forceManyBody().strength(-50))
      .force('col', d3.forceCollide(d => scaleRadius(d.follower ?? 0)).strength(0.9))
      // 클러스터 중심으로 살짝 끌어당김
      .force('clusterX', d3.forceX(d => centers.get(d.cluster)?.x ?? width / 2).strength(0.15))
      .force('clusterY', d3.forceY(d => centers.get(d.cluster)?.y ?? height / 2).strength(0.15))
      .alpha(1)
      .alphaDecay(0.03)
      .on('tick', () => {
        setNodes([...simNodes]);
        setLinks([...simLinks]);
      });

    simRef.current = simulation;

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
  }, [clusteredData, centers, scaleDistance, scaleRadius]);

  // ====== 헐(외곽선) 데이터 계산 ======
  const hulls = useMemo(() => {
    const grouped = d3.group(nodes, d => d.cluster);
    const result = [];
    for (const [cid, groupNodes] of grouped) {
      const pts = groupNodes
        .map(n => [n.x, n.y])
        .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length >= 3) {
        const hull = d3.polygonHull(pts);
        if (hull) {
          // 라벨 위치용 중심 (센트로이드)
          const cx = d3.mean(hull, p => p[0]);
          const cy = d3.mean(hull, p => p[1]);
          result.push({ cid, hull, cx, cy });
        }
      }
    }
    return result;
  }, [nodes]);

  return (
    <>
      {/* 패턴: 노드 이미지 */}
      <defs>
        {nodes.map(({ id, image }) => (
          <pattern key={`pat-${id}`} id={`pat-${id}`} width="1" height="1" patternContentUnits="objectBoundingBox">
            <image href={image || IMAGE_FALLBACK} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
      </defs>

      {/* 클러스터 헐 (노드 뒤에 깔기) */}
      <g>
        {hulls.map(({ cid, hull }) => (
          <path
            key={`hull-${cid}`}
            d={`M${hull.map(p => p.join(',')).join('L')}Z`}
            fill={colorByCluster(cid)}
            opacity={0.08}
            stroke={colorByCluster(cid)}
            strokeWidth={1.5}
          />
        ))}
      </g>

      {/* 선택된 링크 하이라이트 */}
      <g>
        {selectedLink.map(({ source, target }) => {
          const s = typeof source === 'object' ? source : nodes.find(n => n.id === source);
          const t = typeof target === 'object' ? target : nodes.find(n => n.id === target);
          if (!s || !t) return null;
          return (
            <line
              key={`hl-${s.id}-${t.id}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              className="stroke-gray-400"
              strokeWidth={5}
              opacity={0.9}
            />
          );
        })}
      </g>

      {/* (선택) 전체 링크를 흐리게 깔고 싶다면 여기에 links.map 렌더 추가 */}

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

      {/* (선택) 클러스터 라벨 */}
      {/* <g>
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
      </g> */}
    </>
  );
}
