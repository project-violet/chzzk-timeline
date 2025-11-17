import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Grid, Modal, Stack, Text, Tooltip } from '@mantine/core';

const RelatedChannelsDialog = ({ opened, onClose, items }) => {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="연관 채널"
            size="xl"
            styles={{
                title: { color: 'var(--mantine-color-slate-0)', fontWeight: 700 },
                content: { backgroundColor: 'rgb(15 23 42 / 0.95)' },
                header: { backgroundColor: 'rgb(15 23 42 / 0.95)', borderBottom: '1px solid rgba(51, 65, 85, 0.7)' },
                body: { backgroundColor: 'rgb(15 23 42 / 0.95)' },
            }}
        >
            <Grid columns={4} gutter="md">
                {items.map((item) => (
                    <Grid.Col key={item.id} span={1}>
                        <a
                            href={`/channel/${item.id}`}
                            className="block rounded-xl p-3 transition-colors hover:bg-slate-800/40"
                            aria-label={`${item.name} 채널로 이동`}
                            onClick={onClose}
                        >
                            <Stack gap={6} align="center">
                                <Tooltip label={`${item.name}`} openDelay={300}>
                                    <Avatar
                                        src={item.image ? `${item.image}?type=f120_120_na` : undefined}
                                        alt={item.name}
                                        radius="xl"
                                        size={64}
                                    >
                                        {item.name.slice(0, 2)}
                                    </Avatar>
                                </Tooltip>
                                <Text size="sm" fw={600} className="text-center truncate w-full" title={item.name}>
                                    {item.name}
                                </Text>
                                <Badge size="sm" variant="light" color="teal">
                                    연관도 {(item.similarity * 100).toFixed(1)}%
                                </Badge>
                            </Stack>
                        </a>
                    </Grid.Col>
                ))}
            </Grid>
        </Modal>
    );
};

export const RelatedChannels = ({ currentChannelId }) => {
    const [relatedMap, setRelatedMap] = useState(null);
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dialogOpened, setDialogOpened] = useState(false);

    useEffect(() => {
        let aborted = false;

        async function loadData() {
            try {
                setLoading(true);
                setError(null);

                // related_channels.json 우선 시도, 실패 시 @ 파일명 시도
                const tryUrls = ['/related_channels.json', '/@related_channels.json'];
                let related = null;
                for (const url of tryUrls) {
                    try {
                        const res = await fetch(url);
                        if (res.ok) {
                            related = await res.json();
                            break;
                        }
                    } catch {
                        // continue
                    }
                }
                if (!related) {
                    throw new Error('연관 채널 데이터를 불러오지 못했습니다.');
                }

                // 채널 메타데이터
                const [res0, res1] = await Promise.all([
                    fetch('/channel_with_replays_0.json'),
                    fetch('/channel_with_replays_1.json'),
                ]);

                const arr0 = res0.ok ? await res0.json() : [];
                const arr1 = res1.ok ? await res1.json() : [];
                const all = [...(Array.isArray(arr0) ? arr0 : []), ...(Array.isArray(arr1) ? arr1 : [])];

                if (!aborted) {
                    setRelatedMap(related);
                    setChannels(all);
                    setLoading(false);
                }
            } catch (err) {
                if (!aborted) {
                    setError(err);
                    setLoading(false);
                }
            }
        }

        loadData();
        return () => {
            aborted = true;
        };
    }, []);

    const allRelatedItems = useMemo(() => {
        if (!currentChannelId || !relatedMap) return [];
        const list = relatedMap[currentChannelId];
        if (!Array.isArray(list)) return [];

        // 채널 메타데이터 맵
        const idToChannel = new Map();
        for (const ch of channels) {
            if (ch?.channelId) idToChannel.set(ch.channelId, ch);
        }

        // distance 값을 연관도로 사용 (파일이 내림차순 정렬되어 있어 보임)
        const items = list
            .map((item) => {
                const targetChannel = idToChannel.get(item.target);
                return {
                    id: item.target,
                    similarity: typeof item.distance === 'number' ? item.distance : 0,
                    inter: item.inter,
                    name: targetChannel?.name ?? '',
                    image: targetChannel?.image,
                };
            })
            .filter((x) => x.name);

        return items;
    }, [currentChannelId, relatedMap, channels]);

    // 상위 6개만 (기본 표시용)
    const relatedItems = useMemo(() => {
        return allRelatedItems.slice(0, 6);
    }, [allRelatedItems]);

    // 다이얼로그용 최대 32개
    const dialogItems = useMemo(() => {
        return allRelatedItems.slice(0, 32);
    }, [allRelatedItems]);

    if (loading) return null;
    if (error) return null;
    if (!relatedItems.length) return null;

    return (
        <>
            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/95 p-4 shadow-lg shadow-slate-900/40">
                <Text
                    size="lg"
                    fw={700}
                    mb={6}
                    className="text-slate-100 cursor-pointer hover:text-teal-300 transition-colors"
                    onClick={() => setDialogOpened(true)}
                >
                    연관 채널
                </Text>
                <Grid columns={3} gutter="sm">
                    {relatedItems.map((item) => (
                        <Grid.Col key={item.id} span={1}>
                            <a
                                href={`/channel/${item.id}`}
                                className="block rounded-xl p-2 transition-colors hover:bg-slate-800/40"
                                aria-label={`${item.name} 채널로 이동`}
                            >
                                <Stack gap={6} align="center">
                                    <Tooltip label={`${item.name}`} openDelay={300}>
                                        <Avatar
                                            src={item.image ? `${item.image}?type=f120_120_na` : undefined}
                                            alt={item.name}
                                            radius="xl"
                                            size={64}
                                        >
                                            {item.name.slice(0, 2)}
                                        </Avatar>
                                    </Tooltip>
                                    <Text size="sm" fw={600} className="text-center truncate w-full" title={item.name}>
                                        {item.name}
                                    </Text>
                                    <Badge size="sm" variant="light" color="teal">
                                        연관도 {(item.similarity * 100).toFixed(1)}%
                                    </Badge>
                                </Stack>
                            </a>
                        </Grid.Col>
                    ))}
                </Grid>
            </div>

            <RelatedChannelsDialog
                opened={dialogOpened}
                onClose={() => setDialogOpened(false)}
                items={dialogItems}
            />
        </>
    );
};


