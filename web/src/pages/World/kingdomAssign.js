import * as d3 from 'd3';

const DEFAULTS = {
    kingPercentile: 0.08,
    followerFloor: 180_000,
    minSimilarity: 0.15,
};

export function assignKingdoms(streamers, links, options = {}) {
    const { kingPercentile, followerFloor, minSimilarity } = { ...DEFAULTS, ...options };
    const adjacency = buildAdjacency(links, { minSimilarity: minSimilarity * 0.75, maxNeighbors: 12 });
    const byId = new Map(streamers.map((s, index) => [s.id, { streamer: s, index }]));

    const sorted = [...streamers].sort((a, b) => (b.follower ?? 0) - (a.follower ?? 0));
    const followerValues = sorted.map((s) => s.follower ?? 0);
    const percentileIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * kingPercentile));
    const dynamicThreshold = followerValues[percentileIndex] ?? followerFloor;
    const threshold = Math.min(Math.max(dynamicThreshold, followerFloor), followerValues[0] ?? followerFloor);

    sorted.forEach((node) => {
        const isKing = (node.follower ?? 0) >= threshold || !adjacency.has(node.id);
        if (isKing) {
            node.role = 'KING';
            node.kingId = node.id;
            node.parentId = null;
            node.tier = 0;
            return;
        }

        const neighbors = adjacency.get(node.id) ?? [];
        let best = null;
        neighbors.forEach((neighborInfo) => {
            const candidate = byId.get(neighborInfo.id)?.streamer;
            if (!candidate || (candidate.follower ?? 0) <= (node.follower ?? 0)) return;
            if (!candidate.kingId) return;
            if ((neighborInfo.similarity ?? 0) < minSimilarity) return;
            const score =
                (neighborInfo.similarity ?? 0) * 0.85 +
                ((candidate.follower ?? 0) / Math.max(node.follower ?? 1, 1)) * 0.15;
            if (!best || score > best.score) {
                best = { candidate, score };
            }
        });

        if (best) {
            node.role = 'VASSAL';
            node.kingId = best.candidate.kingId ?? best.candidate.id;
            node.parentId = best.candidate.id;
            node.tier = (best.candidate.tier ?? 0) + 1;
        } else {
            node.role = 'KING';
            node.kingId = node.id;
            node.parentId = null;
            node.tier = 0;
        }
    });
}

function buildAdjacency(links, { minSimilarity = 0.05, maxNeighbors = 8 }) {
    const adjacency = new Map();
    links.forEach((link) => {
        const similarity = link.distance ?? 0;
        if (similarity < minSimilarity) return;
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        if (!source || !target) return;
        if (!adjacency.has(source)) adjacency.set(source, []);
        if (!adjacency.has(target)) adjacency.set(target, []);
        adjacency.get(source).push({ id: target, similarity });
        adjacency.get(target).push({ id: source, similarity });
    });
    adjacency.forEach((list) => {
        list.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
        if (list.length > maxNeighbors) list.length = maxNeighbors;
    });
    return adjacency;
}

