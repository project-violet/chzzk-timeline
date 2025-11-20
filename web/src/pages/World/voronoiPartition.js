export function buildVoronoiForKings(kings, { width, height }) {
    const totalCells = width * height;
    const assignments = new Int32Array(totalCells).fill(-1);
    if (!kings.length) return assignments;

    const kingPositions = kings.map((king, index) => ({
        index,
        x: clamp((king.normX ?? 0.5) * (width - 1), 0, width - 1),
        y: clamp((king.normY ?? 0.5) * (height - 1), 0, height - 1),
    }));

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const idx = y * width + x;
            let best = null;
            for (let i = 0; i < kingPositions.length; i += 1) {
                const kp = kingPositions[i];
                const dx = kp.x - x;
                const dy = kp.y - y;
                const dist2 = dx * dx + dy * dy;
                if (best === null || dist2 < best.dist2) {
                    best = { dist2, index: kp.index };
                }
            }
            assignments[idx] = best?.index ?? -1;
        }
    }
    return assignments;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value ?? 0, min), max);
}

