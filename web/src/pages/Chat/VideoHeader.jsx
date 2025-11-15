import { Badge, Button, Group, Text, Title } from '@mantine/core';

export const VideoHeader = ({ videoInfo, videoData }) => {
    return (
        <div className="flex gap-6 max-sm:flex-col">
            {videoInfo?.replay?.thumbnail ? (
                <img
                    src={videoInfo.replay.thumbnail}
                    alt={videoInfo.replay.title ? `${videoInfo.replay.title} 썸네일` : '비디오 썸네일'}
                    className="h-40 w-64 flex-none rounded-2xl border border-slate-800/60 object-cover shadow-inner shadow-slate-900/40 max-sm:h-40 max-sm:w-full"
                    loading="lazy"
                />
            ) : null}
            <div className="min-w-0 flex-1">
                {videoInfo?.channel?.name ? (
                    <Text size="sm" c="dimmed" fw={600} className="uppercase tracking-wide mb-2">
                        {videoInfo.channel.name}
                    </Text>
                ) : null}
                {videoInfo?.replay?.title ? (
                    <Title order={1} size={32} fw={800} className="text-slate-100 mb-2">
                        {videoInfo.replay.title}
                    </Title>
                ) : (
                    <div>
                        <Text size="xs" c="dimmed" fw={600} className="uppercase tracking-wide mb-2">
                            비디오 ID
                        </Text>
                        <Title order={1} size={32} fw={800} className="text-slate-100">
                            {videoData.videoId}
                        </Title>
                    </div>
                )}
                {videoInfo?.replay?.categoryKo ? (
                    <Badge size="lg" radius="md" variant="light" color="violet" className="inline-flex mb-2">
                        {videoInfo.replay.categoryKo}
                    </Badge>
                ) : null}
                {Array.isArray(videoInfo?.replay?.tags) && videoInfo.replay.tags.length > 0 ? (
                    <Group gap={8} wrap="wrap" mt={4}>
                        {videoInfo.replay.tags
                            .filter(Boolean)
                            .slice(0, 10)
                            .map((tag) => (
                                <Badge key={tag} size="md" radius="md" variant="light" color="gray">
                                    #{tag}
                                </Badge>
                            ))}
                    </Group>
                ) : null}
                {videoInfo?.replay?.videoNo ? (
                    <Group mt={4}>
                        <Button
                            component="a"
                            href={`https://chzzk.naver.com/video/${videoInfo.replay.videoNo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="light"
                            color="teal"
                            radius="lg"
                            size="md"
                            className="mt-2 inline-flex items-center gap-2"
                            leftSection={
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                            }
                        >
                            치지직에서 보기
                        </Button>
                    </Group>
                ) : null}
            </div>
        </div>
    );
};

