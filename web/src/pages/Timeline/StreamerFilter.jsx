import { Avatar, Badge, Button, Card, Checkbox, Group, ScrollArea, Stack, Text, TextInput } from '@mantine/core';

const DEFAULT_CARD_HEIGHT = 'calc(100vh - 6rem)';

const getInitials = (name = '') => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.slice(0, 2);
};

export function StreamerFilter({
    filterText,
    onFilterTextChange,
    sidebarChannels,
    selectedChannelIds,
    onToggleChannel,
    onResetFilters,
    isFilterActive,
    selectedCount,
}) {
    return (
        <aside className="sticky top-24 self-start">
            <Card
                radius="xl"
                padding="lg"
                withBorder
                className="flex flex-col border border-slate-800/60 bg-slate-900/70 backdrop-blur"
                style={{ height: DEFAULT_CARD_HEIGHT }}
            >
                <Stack gap="sm" className="h-full">
                    <div>
                        <Text size="sm" fw={700}>
                            스트리머 필터
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>
                            검색하거나 체크해 원하는 스트리머만 타임라인에 표시해 보세요.
                        </Text>
                    </div>

                    <TextInput
                        value={filterText}
                        onChange={(event) => onFilterTextChange(event.currentTarget.value)}
                        placeholder="스트리머 검색"
                        radius="lg"
                        size="sm"
                        variant="filled"
                    />

                    <Group justify="space-between" align="center" gap="xs">
                        <Badge size="sm" radius="lg" variant="light" color={selectedCount ? 'teal' : 'gray'}>
                            선택 {selectedCount.toLocaleString('ko-KR')}명
                        </Badge>
                        <Group gap="xs">
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                radius="lg"
                                onClick={onResetFilters}
                                disabled={!isFilterActive}
                            >
                                필터 초기화
                            </Button>
                        </Group>
                    </Group>

                    <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
                        <Stack gap="xs" pr="sm">
                            {sidebarChannels.length === 0 ? (
                                <div className="flex h-32 items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/40">
                                    <Text size="xs" c="dimmed">
                                        검색 결과가 없습니다.
                                    </Text>
                                </div>
                            ) : (
                                sidebarChannels.map((channel) => {
                                    const id = channel.channelId ?? channel.name;
                                    const followerLabel = Number(channel.follower ?? 0).toLocaleString('ko-KR');
                                    return (
                                        <Checkbox
                                            key={id}
                                            checked={selectedChannelIds.includes(id)}
                                            onChange={() => onToggleChannel(id)}
                                            radius="md"
                                            className="rounded-lg px-2 py-2 transition hover:bg-slate-800/50"
                                            styles={{
                                                input: { cursor: 'pointer' },
                                                label: { width: '100%' },
                                            }}
                                            label={
                                                <Group gap="sm" wrap="nowrap">
                                                    <Avatar src={channel.image} radius="xl" size={32} alt={channel.name}>
                                                        {getInitials(channel.name)}
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <Text size="sm" fw={600} className="truncate">
                                                            {channel.name}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            팔로워 {followerLabel}
                                                        </Text>
                                                    </div>
                                                </Group>
                                            }
                                        />
                                    );
                                })
                            )}
                        </Stack>
                    </ScrollArea>
                </Stack>
            </Card>
        </aside>
    );
}

