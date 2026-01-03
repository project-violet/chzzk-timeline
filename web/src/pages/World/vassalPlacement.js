const DEFAULT_COLOR_PALETTE = [
    '#10b981',
    '#0ea5e9',
    '#6366f1',
    '#f97316',
    '#facc15',
    '#ec4899',
    '#ef4444',
    '#a855f7',
    '#14b8a6',
    '#1d4ed8',
    '#f43f5e',
    '#0f172a',
];

export function placeVassalsInKingZones({ streamers, kings, kingByIndex, seaMask, seed, width, height }) {
    const rng = createRng(seed);
    const totalCells = width * height;
    const ownerByIndex = new Int32Array(totalCells).fill(-1);
    const kingStats = kings.map(() => ({ x: 0, y: 0, count: 0 }));

    const cellsByKing = kings.map(() => []);
    for (let idx = 0; idx < totalCells; idx += 1) {
        if (seaMask[idx]) continue;
        const kingIndex = kingByIndex[idx];
        if (kingIndex < 0 || !cellsByKing[kingIndex]) continue;
        cellsByKing[kingIndex].push(idx);
    }

    const membersByKing = new Map();
    streamers.forEach((streamer) => {
        const key = streamer.kingId ?? streamer.id;
        if (!membersByKing.has(key)) membersByKing.set(key, []);
        membersByKing.get(key).push(streamer);
    });

    kings.forEach((king, kingIndex) => {
        const members = membersByKing.get(king.id) ?? [];
        const sortedMembers = members
            .slice()
            .sort((a, b) => (a.id === king.id ? -1 : b.id === king.id ? 1 : (b.follower ?? 0) - (a.follower ?? 0)));
        const pool = cellsByKing[kingIndex];

        if (!pool?.length) return;
        shuffleInPlace(pool, rng);
        const centroid = computeCellCentroid(pool, width);
        let kingCell = findClosestCell(pool, centroid, width);
        if (kingCell === null) {
            kingCell = pool.pop() ?? null;
        } else {
            removeValue(pool, kingCell);
        }
        if (kingCell !== null) {
            assignCell({
                idx: kingCell,
                kingIndex,
                streamer: members.find((m) => m.id === king.id) ?? king,
                ownerByIndex,
                kingStats,
                width,
            });
        }

        const vassals = sortedMembers.filter((m) => m.id !== king.id);
        vassals.forEach((vassal) => {
            let cell = pool.pop() ?? null;
            if (cell === null) {
                cell = findFallbackCell(ownerByIndex, seaMask, kingByIndex, kingIndex);
            }
            if (cell !== null) {
                assignCell({ idx: cell, kingIndex, streamer: vassal, ownerByIndex, kingStats, width });
            }
        });
    });

    for (let idx = 0; idx < totalCells; idx += 1) {
        if (!seaMask[idx] && ownerByIndex[idx] < 0) {
            seaMask[idx] = 1;
            kingByIndex[idx] = -1;
        }
    }

    assignKingColors(streamers, kings);

    return { ownerByIndex, kingStats };
}

function assignCell({ idx, kingIndex, streamer, ownerByIndex, kingStats, width }) {
    if (!streamer) return;
    ownerByIndex[idx] = streamer.index;
    const stats = kingStats[kingIndex];
    const x = idx % width;
    const y = Math.floor(idx / width);
    stats.x += x;
    stats.y += y;
    stats.count += 1;
}

function computeCellCentroid(pool, width) {
    if (!pool.length) return { x: 0, y: 0 };
    let sumX = 0;
    let sumY = 0;
    pool.forEach((idx) => {
        sumX += idx % width;
        sumY += Math.floor(idx / width);
    });
    return { x: sumX / pool.length, y: sumY / pool.length };
}

function findClosestCell(pool, centroid, width) {
    let bestIdx = null;
    let bestDist = Infinity;
    pool.forEach((idx) => {
        const x = idx % width;
        const y = Math.floor(idx / width);
        const dx = x - centroid.x;
        const dy = y - centroid.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
        }
    });
    return bestIdx;
}

function findFallbackCell(ownerByIndex, seaMask, kingByIndex, kingIndex) {
    for (let idx = 0; idx < ownerByIndex.length; idx += 1) {
        if (seaMask[idx]) continue;
        if (kingByIndex[idx] !== kingIndex) continue;
        if (ownerByIndex[idx] >= 0) continue;
        return idx;
    }
    return null;
}

function removeValue(arr, value) {
    const index = arr.indexOf(value);
    if (index >= 0) {
        arr.splice(index, 1);
    }
}

function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function createRng(seed = 1) {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) | 0;
        let t = Math.imul(value ^ (value >>> 15), 1 | value);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function assignKingColors(streamers, kings) {
    const palette = new Map();
    kings.forEach((king, index) => {
        const base = DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
        const tone = Math.floor(index / DEFAULT_COLOR_PALETTE.length);
        palette.set(king.id, adjustColorTone(base, tone));
    });
    streamers.forEach((streamer) => {
        streamer.color = palette.get(streamer.kingId) ?? '#94a3b8';
    });
    kings.forEach((king) => {
        king.color = palette.get(king.id) ?? '#94a3b8';
    });
}

function adjustColorTone(hex, offset) {
    if (!hex) return '#94a3b8';
    const parsed = hex.replace('#', '');
    const r = parseInt(parsed.substring(0, 2), 16);
    const g = parseInt(parsed.substring(2, 4), 16);
    const b = parseInt(parsed.substring(4, 6), 16);
    const factor = 1 + offset * 0.08;
    const toHex = (value) => {
        const next = Math.max(0, Math.min(255, Math.round(value * factor)));
        return next.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

