import { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { GraphContainer } from './Graph.jsx';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import rawData from '../../../../server/dd.json?raw';

const data = JSON.parse(rawData);

function useD3Zoom(svgRef, rootRef, zoomRef) {
    useEffect(() => {
        const svg = d3.select(svgRef.current);
        const root = d3.select(rootRef.current);

        zoomRef.current = d3.zoom().on('zoom', (event) => {
            root.attr('transform', event.transform);
        });

        svg.call(zoomRef.current);
    }, [svgRef, rootRef, zoomRef]);
}

export function MapPage() {
    const [selectedChannel, setSelectedChannel] = useState('');
    const svgRef = useRef();
    const rootRef = useRef();
    const zoomRef = useRef();

    useD3Zoom(svgRef, rootRef, zoomRef);

    const handleChannelSearch = (e) => {
        const channelName = e.target.value;
        setSelectedChannel(channelName);

        const selectedNode = data.nodes.find((node) => node.name === channelName);
        if (!selectedNode) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const svg = d3.select(svgRef.current);

        svg.transition().duration(1000).call(
            zoomRef.current.transform,
            d3.zoomIdentity
                .translate(width / 2, height / 2)
                .translate(-selectedNode.x, -selectedNode.y)
        );
    };

    return (
        <>
            <GraphContainer
                data={data}
                selectedChannel={selectedChannel}
                setSelectedChannel={setSelectedChannel}
                svgRef={svgRef}
                rootRef={rootRef}
            />
            <Sidebar
                data={data}
                selectedChannel={selectedChannel}
                handleChannelSearch={handleChannelSearch}
            />
            <Header data={data} />
        </>
    );
}

export default MapPage;

