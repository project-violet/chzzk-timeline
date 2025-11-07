import { useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';

export function Sidebar({ data, selectedChannel, handleChannelSearch }) {
  if (!data) return null;

  const relatedChannels = data.links
    .filter((link) => link.source.name === selectedChannel || link.target.name === selectedChannel)
    .map((link) => {
      const channel = (link.source.name === selectedChannel) ? link.target : link.source;
      return { ...channel, similarity: link.distance, count: link.inter };
    });


  return (
    <div className='absolute top-0 left-0 m-4 flex flex-col w-[calc(100%-2rem)] gap-4 dark:text-white sm:w-80'>
      <input value={selectedChannel} onChange={handleChannelSearch} type='search' list='channels' placeholder='스트리머 검색' className='w-full border-3 border-gray-300 text-xl p-2 outline-0 bg-white focus:border-[#00FFA3] dark:bg-gray-600' />
      <datalist id='channels'>
        {data.nodes.map((node) => (
          <option key={node.id} value={node.name}></option>
        ))}
      </datalist>
      {(relatedChannels.length > 0) ? (<RelatedChannels relatedChannels={relatedChannels} />) : null}
    </div>
  );
}

const columnHelper = createColumnHelper();
const columns = [
  {
    id: 'index',
    header: '#',
    enableSorting: false,
    cell: ({ row, table }) => (table.getSortedRowModel().flatRows.findIndex((flatRow) => flatRow.id === row.id) || 0) + 1,
    meta: { width: 'w-[15%]' },
  },
  columnHelper.accessor('name', {
    header: '채널명',
    enableSorting: false,
    meta: { width: 'w-[35%]' },
  }),
  columnHelper.accessor('similarity', {
    header: '유사도',
    cell: (info) => (info.getValue() * 100).toFixed(2) + '%',
    meta: { width: 'w-[25%]' },
  }),
  columnHelper.accessor('count', {
    header: '중복수',
    meta: { width: 'w-[25%]' },
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

  return (
    <div className='w-full border-3 p-2 border-gray-300 bg-white dark:bg-gray-600 hidden sm:block'>
      <table className='table-fixed w-full'>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>{headerGroup.headers.map((header) => {
              if (!header.column.getCanSort()) {
                return <th key={header.id} className={`p-1 text-left text-[0.8rem] ${header.column.columnDef.meta.width}`}>{header.column.columnDef.header}</th>
              }
              else if (header.column.getIsSorted()) {
                const handler = () => setSorting([{ id: header.column.id, desc: true }]);
                return <th key={header.id} className={`p-1 text-left text-[0.8rem] cursor-pointer ${header.column.columnDef.meta.width}`} onClick={handler}>{header.column.columnDef.header}🔽</th>
              }
              else {
                const handler = () => setSorting([{ id: header.column.id, desc: true }]);
                return <th key={header.id} className={`p-1 text-left text-[0.8rem] cursor-pointer ${header.column.columnDef.meta.width}`} onClick={handler}>{header.column.columnDef.header}</th>
              }
            }
            )}</tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className='border-t'>{row.getVisibleCells().map((cell) => (
              <td key={cell.id} className='p-1 whitespace-nowrap overflow-hidden overflow-ellipsis'>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
      <div className='flex items-center gap-4'>
        <button
          className='border rounded p-1 disabled:brightness-50'
          onClick={() => table.firstPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {'<<'}
        </button>
        <button
          className='border rounded p-1 disabled:brightness-50'
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {'<'}
        </button>
        <div>{pagination.pageIndex + 1} / {table.getPageCount()}</div>
        <button
          className='border rounded p-1 disabled:brightness-50'
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {'>'}
        </button>
        <button
          className='border rounded p-1 disabled:brightness-50'
          onClick={() => table.lastPage()}
          disabled={!table.getCanNextPage()}
        >
          {'>>'}
        </button>
      </div>
    </div>
  );
}
