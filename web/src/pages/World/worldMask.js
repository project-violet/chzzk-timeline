export function generateWorldMask(seed, { width, height }) {
    const seaMask = new Uint8Array(width * height);
    const heights = new Float32Array(width * height);
    const noise = createNoise2D(seed);
    const octaves = 4;
    const falloff = 0.5;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let amplitude = 1;
            let frequency = 1;
            let value = 0;
            let norm = 0;
            for (let o = 0; o < octaves; o += 1) {
                value += noise((x / width) * frequency + o * 13.13, (y / height) * frequency + o * 17.73) * amplitude;
                norm += amplitude;
                amplitude *= falloff;
                frequency *= 2;
            }
            value /= norm || 1;
            const dx = (x / width) * 2 - 1;
            const dy = (y / height) * 2 - 1;
            const radial = Math.sqrt(dx * dx + dy * dy);
            value -= radial * 0.3;
            const belt = Math.min(x, y, width - 1 - x, height - 1 - y);
            const seaLevel = 0.48 + Math.max(0, 4 - belt) * 0.015;
            const idx = y * width + x;
            heights[idx] = value;
            seaMask[idx] = value < seaLevel ? 1 : 0;
        }
    }

    return { seaMask, heights };
}

function createNoise2D(seed = 1) {
    return (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const sx = smoothStep(x - x0);
        const sy = smoothStep(y - y0);
        const n00 = hash2D(x0, y0, seed);
        const n10 = hash2D(x1, y0, seed);
        const n01 = hash2D(x0, y1, seed);
        const n11 = hash2D(x1, y1, seed);
        const ix0 = lerp(n00, n10, sx);
        const ix1 = lerp(n01, n11, sx);
        return lerp(ix0, ix1, sy);
    };
}

function hash2D(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1446647;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function smoothStep(t) {
    return t * t * (3 - 2 * t);
}

