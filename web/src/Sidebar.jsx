import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';

const GLASS_CARD_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  borderColor: 'rgba(148, 163, 184, 0.28)',
  backdropFilter: 'blur(14px)',
};

export function Sidebar({ data, selectedChannel, handleChannelSearch }) {
  if (!data) return null;

  const nameIdMap = useMemo(
    () => new Map(data.nodes.map((node) => [node.name, node.id])),
    [data]
  );
  const idNameMap = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node.name])),
    [data]
  );

  const selectedChannelId = nameIdMap.get(selectedChannel);

  const relatedChannels = useMemo(() => {
    if (!selectedChannelId) return [];

    const normalizeId = (nodeLike) => {
      if (nodeLike && typeof nodeLike === 'object') {
        return nodeLike.id ?? nodeLike.target ?? nodeLike.source ?? null;
      }
      return nodeLike;
    };

    return data.links
      .map((link) => {
        const sourceId = normalizeId(link.source);
        const targetId = normalizeId(link.target);

        if (sourceId !== selectedChannelId && targetId !== selectedChannelId) return null;

        const neighborId = sourceId === selectedChannelId ? targetId : sourceId;
        const name = idNameMap.get(neighborId);

        if (!neighborId || !name) return null;

        return {
          id: neighborId,
          name,
          similarity: link.distance ?? 0,
          count: link.inter ?? 0,
        };
      })
      .filter(Boolean);
  }, [data.links, idNameMap, selectedChannelId]);

  const containerStyle = {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 20,
    width: 'calc(100% - 32px)',
    maxWidth: '440px',
  };

  return (
    <aside style={containerStyle}>
      <Stack gap="md">
        <Paper radius="xl" shadow="xl" p="lg" withBorder style={GLASS_CARD_STYLE}>
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">
              스트리머 검색
            </Text>
            <TextInput
              value={selectedChannel}
              onChange={handleChannelSearch}
              type="search"
              list="channels"
              placeholder="채널명을 입력하세요"
              leftSection={<span role="img" aria-label="검색" style={{ fontSize: '0.9rem' }}>🔍</span>}
              radius="lg"
              size="md"
              variant="filled"
              autoComplete="off"
            />
            <datalist id='channels'>
              {data.nodes.map((node) => (
                <option key={node.id} value={node.name}></option>
              ))}
            </datalist>
          </Stack>
        </Paper>

        {relatedChannels.length > 0 ? <RelatedChannels relatedChannels={relatedChannels} /> : null}
      </Stack>
    </aside>
  );
}

const columnHelper = createColumnHelper();
const columns = [
  {
    id: 'index',
    header: '#',
    enableSorting: false,
    cell: ({ row, table }) => {
      const flatRows = table.getSortedRowModel().flatRows;
      const rowPosition = flatRows.findIndex((flatRow) => flatRow.id === row.id);
      const index = rowPosition >= 0 ? rowPosition + 1 : row.index + 1;
      return <Text ta="center" fw={600}>{index}</Text>;
    },
    meta: { width: '3.5rem' },
  },
  columnHelper.accessor('name', {
    header: '채널명',
    enableSorting: false,
    cell: (info) => (
      <Text fw={600}>{info.getValue()}</Text>
    ),
    meta: { width: '35%' },
  }),
  columnHelper.accessor('similarity', {
    header: '유사도',
    cell: (info) => {
      const value = Number(info.getValue() ?? 0) * 100;
      return (
        <Badge radius="xl" variant="light" color="teal">
          {value.toFixed(1)}%
        </Badge>
      );
    },
    meta: { width: '30%' },
  }),
  columnHelper.accessor('count', {
    header: '중복수',
    cell: (info) => (
      <Text fw={600}>{Number(info.getValue() ?? 0).toLocaleString()}</Text>
    ),
    meta: { width: '23%' },
  }),
];

function RelatedChannels({ relatedChannels }) {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState([{ id: 'similarity', desc: true }]);

  const table = useReactTable({
    columns,
    data: relatedChannels,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  });

  const totalPages = Math.max(table.getPageCount(), 1);
  const currentPage = Math.min(pagination.pageIndex + 1, totalPages);

  return (
    <Paper radius="xl" shadow="xl" p="lg" withBorder visibleFrom="sm" style={GLASS_CARD_STYLE}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>연관 채널</Title>
            <Text size="xs" c="dimmed">
              총 {relatedChannels.length.toLocaleString()}개의 채널이 연결되어 있습니다.
            </Text>
          </div>
          <Badge color="teal" variant="light" radius="md">
            실시간 분석
          </Badge>
        </Group>

        <ScrollArea h={420} type="auto" offsetScrollbars>
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md" striped>
            <Table.Thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <Table.Tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const width = header.column.columnDef.meta?.width;

                    if (!header.column.getCanSort()) {
                      return (
                        <Table.Th key={header.id} style={{ width, textAlign: header.column.id === 'index' ? 'center' : undefined }}>
                          <Text size="xs" tt="uppercase" fw={600} c="dimmed" ta={header.column.id === 'index' ? 'center' : undefined}>
                            {header.column.columnDef.header}
                          </Text>
                        </Table.Th>
                      );
                    }

                    const sortState = header.column.getIsSorted();
                    const toggleSort = header.column.getToggleSortingHandler();

                    return (
                      <Table.Th key={header.id} style={{ width }}>
                        <UnstyledButton onClick={toggleSort} style={{ width: '100%' }}>
                          <Group justify="space-between" gap="xs">
                            <Text size="xs" tt="uppercase" fw={600} c={sortState ? 'teal.5' : 'dimmed'}>
                              {header.column.columnDef.header}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {sortState === 'desc' ? '▼' : sortState === 'asc' ? '▲' : '↕'}
                            </Text>
                          </Group>
                        </UnstyledButton>
                      </Table.Th>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Thead>
            <Table.Tbody>
              {table.getRowModel().rows.map((row) => (
                <Table.Tr key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const width = cell.column.columnDef.meta?.width;
                    return (
                      <Table.Td key={cell.id} style={{ width, textAlign: cell.column.id === 'index' ? 'center' : undefined }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Group justify="space-between" gap="sm">
          <Text size="xs" c="dimmed">
            페이지 {currentPage} / {totalPages}
          </Text>
          <Group gap="xs">
            <PageButton onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>{'<<'}</PageButton>
            <PageButton onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>{'<'}</PageButton>
            <PageButton onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>{'>'}</PageButton>
            <PageButton onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>{'>>'}</PageButton>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

function PageButton({ children, disabled, onClick }) {
  return (
    <ActionIcon
      variant="light"
      color="gray"
      radius="xl"
      size="md"
      onClick={onClick}
      disabled={disabled}
    >
      <Text size="xs" fw={600}>
        {children}
      </Text>
    </ActionIcon>
  );
}
