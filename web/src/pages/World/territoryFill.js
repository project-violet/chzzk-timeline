export function combineTerritory(voronoiAssignments, seaMask) {
    const kingByIndex = new Int32Array(voronoiAssignments.length);
    for (let i = 0; i < voronoiAssignments.length; i += 1) {
        kingByIndex[i] = seaMask[i] ? -1 : voronoiAssignments[i];
    }
    return { kingByIndex };
}

