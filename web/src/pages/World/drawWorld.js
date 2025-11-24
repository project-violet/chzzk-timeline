const IMAGE_FALLBACK =
    'https://ssl.pstatic.net/cmstatic/nng/img/img_anonymous_square_gray_opacity2x.png?type=f120_120_na';

export function drawWorld({ canvas, world, transform, size, imageCache, onImageLoad, options }) {
    if (!canvas || !world) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { grid, streamers, kingdoms } = world;
    const { cellSize, seaColor, landColor, detailThreshold, nameThreshold, midThreshold } = options;
    const { width, height, seaMask, ownerByIndex, kingByIndex } = grid;
    const { width: screenWidth, height: screenHeight, dpr } = size;

    const worldX0 = (0 - transform.x) / transform.k;
    const worldY0 = (0 - transform.y) / transform.k;
    const worldX1 = (screenWidth - transform.x) / transform.k;
    const worldY1 = (screenHeight - transform.y) / transform.k;
    const minCellX = Math.max(0, Math.floor(worldX0 / cellSize));
    const maxCellX = Math.min(width - 1, Math.ceil(worldX1 / cellSize));
    const minCellY = Math.max(0, Math.floor(worldY0 / cellSize));
    const maxCellY = Math.min(height - 1, Math.ceil(worldY1 / cellSize));
    const cellScreenSize = cellSize * transform.k;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    for (let y = minCellY; y <= maxCellY; y += 1) {
        for (let x = minCellX; x <= maxCellX; x += 1) {
            const idx = y * width + x;
            const px = x * cellSize;
            const py = y * cellSize;
            const kingIndex = kingByIndex[idx];
            if (seaMask[idx]) {
                ctx.fillStyle = seaColor;
            } else {
                const kingdom = kingIndex >= 0 ? kingdoms[kingIndex] : null;
                ctx.fillStyle = kingdom?.color ?? landColor;
            }
            ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
        }
    }

    if (cellScreenSize >= midThreshold) {
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.lineWidth = 0.65 / transform.k;
        for (let y = minCellY; y <= maxCellY; y += 1) {
            const py = y * cellSize;
            ctx.beginPath();
            ctx.moveTo(minCellX * cellSize, py);
            ctx.lineTo((maxCellX + 1) * cellSize, py);
            ctx.stroke();
        }
        for (let x = minCellX; x <= maxCellX; x += 1) {
            const px = x * cellSize;
            ctx.beginPath();
            ctx.moveTo(px, minCellY * cellSize);
            ctx.lineTo(px, (maxCellY + 1) * cellSize);
            ctx.stroke();
        }
    }

    if (cellScreenSize >= detailThreshold) {
        for (let y = minCellY; y <= maxCellY; y += 1) {
            for (let x = minCellX; x <= maxCellX; x += 1) {
                const idx = y * width + x;
                if (seaMask[idx]) continue;
                const ownerIndex = ownerByIndex[idx];
                if (ownerIndex < 0) continue;
                const streamer = streamers[ownerIndex];
                const image = fetchImage(streamer.image, streamer.id, imageCache, onImageLoad);
                if (!image || !image.complete || image.__broken || !image.naturalWidth) continue;
                const px = x * cellSize + 0.2;
                const py = y * cellSize + 0.2;
                ctx.save();
                ctx.beginPath();
                ctx.rect(px, py, cellSize - 0.4, cellSize - 0.4);
                ctx.clip();
                ctx.drawImage(image, px, py, cellSize - 0.4, cellSize - 0.4);
                ctx.restore();

                if (cellScreenSize >= nameThreshold) {
                    const labelHeight = Math.min(cellSize * 0.55, 6.2);
                    ctx.save();
                    ctx.fillStyle = 'rgba(3, 7, 18, 0.78)';
                    ctx.fillRect(px, py + cellSize - labelHeight, cellSize, labelHeight);
                    ctx.fillStyle = '#f8fafc';
                    ctx.font = `${Math.max(4, labelHeight - 1)}px "Pretendard",-apple-system,BlinkMacSystemFont,sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(streamer.name ?? '알 수 없음', px + cellSize / 2, py + cellSize - labelHeight / 2);
                    ctx.restore();
                }
            }
        }
    }
    ctx.restore();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 13px "Pretendard",-apple-system,BlinkMacSystemFont,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    kingdoms.forEach((kingdom) => {
        if (!kingdom.centroid || kingdom.cellCount < 6) return;
        const screenX = kingdom.centroid.x * cellSize * transform.k + transform.x;
        const screenY = kingdom.centroid.y * cellSize * transform.k + transform.y;
        if (screenX < -60 || screenX > screenWidth + 60 || screenY < -60 || screenY > screenHeight + 60) return;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.fillRect(screenX - 52, screenY - 18, 104, 32);
        ctx.fillStyle = '#fff';
        ctx.fillText(kingdom.name, screenX, screenY - 2);
        ctx.font = '600 10px "Pretendard",-apple-system,BlinkMacSystemFont,sans-serif';
        ctx.fillStyle = kingdom.color ?? '#f8fafc';
        ctx.fillText('KING', screenX, screenY + 10);
        ctx.font = '600 13px "Pretendard",-apple-system,BlinkMacSystemFont,sans-serif';
    });
    ctx.restore();
}

function fetchImage(url, key, cache, onImageLoad) {
    if (!url) return null;
    const cached = cache.get(key);
    if (cached) {
        if (cached.__broken) return null;
        return cached;
    }
    const safeUrl = toCorsSafeUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
        img.__broken = false;
        onImageLoad?.();
    };
    img.onerror = () => {
        img.__broken = true;
    };
    img.src = safeUrl ?? IMAGE_FALLBACK;
    cache.set(key, img);
    return img;
}

function toCorsSafeUrl(url) {
    if (!url) return IMAGE_FALLBACK;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    if (url.includes('images.weserv.nl/?url=')) return url;
    try {
        const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined);
        if (typeof window === 'undefined' || parsed.origin === window.location.origin) {
            return parsed.toString();
        }
    } catch {
        return IMAGE_FALLBACK;
    }
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
}

