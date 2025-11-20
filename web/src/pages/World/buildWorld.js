import { assignKingdoms } from './kingdomAssign.js';
import { computeLayout } from './layout2D.js';
import { buildVoronoiForKings } from './voronoiPartition.js';
import { generateWorldMask } from './worldMask.js';
import { combineTerritory } from './territoryFill.js';
import { placeVassalsInKingZones } from './vassalPlacement.js';

export function buildWorld(rawData, { seed, width, height }) {
    const nodes = (rawData?.nodes ?? []).map((node, index) => ({
        ...node,
        index,
        kingId: null,
        role: 'VASSAL',
        tier: 0,
    }));
    const links = rawData?.links ?? [];

    assignKingdoms(nodes, links);
    computeLayout(nodes, links);

    const kings = nodes.filter((node) => node.role === 'KING');
    const voronoi = buildVoronoiForKings(kings, { width, height });
    const { seaMask, heights } = generateWorldMask(seed, { width, height });
    const { kingByIndex } = combineTerritory(voronoi, seaMask);

    const { ownerByIndex, kingStats } = placeVassalsInKingZones({
        streamers: nodes,
        kings,
        kingByIndex,
        seaMask,
        seed,
        width,
        height,
    });

    const kingdoms = kings.map((king, index) => {
        const stats = kingStats[index];
        return {
            id: king.id,
            name: king.name,
            follower: king.follower,
            color: king.color,
            kingIndex: index,
            cellCount: stats.count,
            centroid: stats.count
                ? {
                      x: stats.x / stats.count,
                      y: stats.y / stats.count,
                  }
                : null,
        };
    });

    return {
        streamers: nodes,
        kingdoms,
        grid: {
            width,
            height,
            seaMask,
            ownerByIndex,
            kingByIndex,
            heights,
        },
    };
}

