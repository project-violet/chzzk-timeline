import * as d3 from 'd3';

export function computeLayout(streamers, links, options = {}) {
    const { iterations = 280, maxLinks = 120_000 } = options;
    if (!streamers.length) return;

    const nodes = streamers.map((s) => ({
        id: s.id,
        follower: s.follower ?? 0,
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 400,
    }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const normalizedLinks = [];
    for (let i = 0; i < links.length && normalizedLinks.length < maxLinks; i += 1) {
        const raw = links[i];
        const source = typeof raw.source === 'object' ? raw.source.id : raw.source;
        const target = typeof raw.target === 'object' ? raw.target.id : raw.target;
        if (!nodeById.has(source) || !nodeById.has(target)) continue;
        normalizedLinks.push({
            source,
            target,
            distance: raw.distance ?? 0.25,
        });
    }

    const simulation = d3
        .forceSimulation(nodes)
        .force(
            'link',
            d3
                .forceLink(normalizedLinks)
                .id((d) => d.id)
                .distance((link) => 120 - Math.min(Math.max(link.distance ?? 0, 0), 1) * 80)
                .strength(0.65)
        )
        .force('charge', d3.forceManyBody().strength(-18))
        .force('collision', d3.forceCollide((d) => 6 + (d.follower ?? 0) ** 0.3 * 0.015))
        .force('center', d3.forceCenter(0, 0))
        .alpha(1);

    simulation.stop();
    for (let i = 0; i < iterations; i += 1) simulation.tick();

    const xExtent = d3.extent(nodes, (n) => n.x ?? 0);
    const yExtent = d3.extent(nodes, (n) => n.y ?? 0);
    const xRange = Math.max(1e-3, (xExtent[1] ?? 0) - (xExtent[0] ?? 0));
    const yRange = Math.max(1e-3, (yExtent[1] ?? 0) - (yExtent[0] ?? 0));

    nodes.forEach((node) => {
        const original = streamers.find((s) => s.id === node.id);
        if (!original) return;
        const normX = ((node.x ?? 0) - (xExtent[0] ?? 0)) / xRange;
        const normY = ((node.y ?? 0) - (yExtent[0] ?? 0)) / yRange;
        original.normX = clamp(normX, 0, 1);
        original.normY = clamp(normY, 0, 1);
    });
}

function clamp(value, min, max) {
    return Math.min(Math.max(value ?? 0, min), max);
}

