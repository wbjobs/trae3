import { useState, useMemo, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task, Node } from '../../shared/types';

type SortDirection = 'asc' | 'desc' | null;

interface SortState<T> {
  key: keyof T | null;
  direction: SortDirection;
}

interface Column<T> {
  key: keyof T | string;
  title: string;
  render?: (value: T[keyof T] | undefined, row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey?: keyof T | ((row: T) => string);
  selectable?: boolean;
  selectedRows?: T[];
  onSelectionChange?: (selected: T[]) => void;
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
  headerClassName?: string;
  rowClassName?: string | ((row: T) => string);
}

function DataTable<T extends object>({
  data,
  columns,
  rowKey = 'id' as keyof T,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  sortable = true,
  pagination = true,
  pageSize = 10,
  emptyMessage = '暂无数据',
  loading = false,
  onRowClick,
  className,
  headerClassName,
  rowClassName,
}: DataTableProps<T>) {
  const [sortState, setSortState] = useState<SortState<T>>({ key: null, direction: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [internalSelected, setInternalSelected] = useState<T[]>([]);

  const selected = selectedRows.length > 0 ? selectedRows : internalSelected;
  const setSelected = onSelectionChange || setInternalSelected;

  const sortedData = useMemo(() => {
    if (!sortState.key || !sortState.direction) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortState.key as keyof T];
      const bValue = b[sortState.key as keyof T];

      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortState.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aStr = String(aValue);
      const bStr = String(bValue);
      return sortState.direction === 'asc'
        ? aStr.localeCompare(bStr, 'zh-CN')
        : bStr.localeCompare(aStr, 'zh-CN');
    });
  }, [data, sortState]);

  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key: keyof T) => {
    if (!sortable) return;

    setSortState((prev) => {
      if (prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return { key: null, direction: null };
    });
  };

  const getRowKey = (row: T): string => {
    if (typeof rowKey === 'function') {
      return rowKey(row);
    }
    return String(row[rowKey] ?? Math.random().toString(36));
  };

  const isRowSelected = (row: T): boolean => {
    const key = getRowKey(row);
    return selected.some((s) => getRowKey(s) === key);
  };

  const handleSelectRow = (row: T) => {
    const key = getRowKey(row);
    const isSelected = isRowSelected(row);

    if (isSelected) {
      setSelected(selected.filter((s) => getRowKey(s) !== key));
    } else {
      setSelected([...selected, row]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === paginatedData.length && paginatedData.length > 0) {
      setSelected([]);
    } else {
      setSelected([...paginatedData]);
    }
  };

  const allSelected = paginatedData.length > 0 && paginatedData.every((row) => isRowSelected(row));
  const someSelected = paginatedData.some((row) => isRowSelected(row)) && !allSelected;

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-hidden rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn(
                'bg-space-800/80 border-b border-space-700',
                headerClassName
              )}>
                {selectable && (
                  <th className="w-12 px-4 py-3">
                    <button
                      onClick={handleSelectAll}
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                        allSelected
                          ? 'bg-cyber-500 border-cyber-500'
                          : someSelected
                          ? 'bg-cyber-500/50 border-cyber-500'
                          : 'border-space-600 hover:border-space-500'
                      )}
                    >
                      {allSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className={cn(
                      'px-4 py-3 text-sm font-semibold text-industrial-300 whitespace-nowrap',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right',
                      column.sortable !== false && sortable && 'cursor-pointer hover:bg-space-700/50',
                      column.width && `w-[${column.width}]`
                    )}
                    onClick={() => column.sortable !== false && handleSort(column.key as keyof T)}
                  >
                    <div className={cn(
                      'flex items-center gap-2',
                      column.align === 'center' && 'justify-center',
                      column.align === 'right' && 'justify-end'
                    )}>
                      <span>{column.title}</span>
                      {column.sortable !== false && sortable && (
                        <span className="text-industrial-500">
                          {sortState.key === column.key ? (
                            sortState.direction === 'asc' ? (
                              <ChevronUp className="w-4 h-4 text-cyber-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-cyber-400" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-4 h-4 opacity-50" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-space-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-2 border-space-600 border-t-cyber-400 rounded-full animate-spin" />
                      <span className="text-sm text-industrial-400">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-12 text-center"
                  >
                    <p className="text-industrial-400">{emptyMessage}</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => {
                  const rowKeyVal = getRowKey(row);
                  const isSelected = isRowSelected(row);
                  const customRowClass = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;

                  return (
                    <tr
                      key={rowKeyVal}
                      className={cn(
                        'transition-colors',
                        isSelected ? 'bg-cyber-900/20' : 'hover:bg-space-800/50',
                        onRowClick && 'cursor-pointer',
                        customRowClass
                      )}
                      onClick={() => onRowClick && onRowClick(row)}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRow(row);
                            }}
                            className={cn(
                              'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                              isSelected
                                ? 'bg-cyber-500 border-cyber-500'
                                : 'border-space-600 hover:border-space-500'
                            )}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        </td>
                      )}
                      {columns.map((column) => {
                        const value = row[column.key as keyof T];
                        return (
                          <td
                            key={String(column.key)}
                            className={cn(
                              'px-4 py-3 text-sm text-industrial-200 whitespace-nowrap',
                              column.align === 'center' && 'text-center',
                              column.align === 'right' && 'text-right'
                            )}
                          >
                            {column.render ? column.render(value, row) : String(value ?? '-')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-space-700 bg-space-800/30">
            <div className="text-sm text-industrial-400">
              共 {sortedData.length} 条记录，当前第 {currentPage} / {totalPages} 页
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  currentPage === 1
                    ? 'text-industrial-600 cursor-not-allowed'
                    : 'text-industrial-300 hover:bg-space-700 hover:text-white'
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      'min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-all',
                      currentPage === pageNum
                        ? 'bg-cyber-600 text-white shadow-lg shadow-cyber-500/20'
                        : 'text-industrial-300 hover:bg-space-700 hover:text-white'
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  currentPage === totalPages
                    ? 'text-industrial-600 cursor-not-allowed'
                    : 'text-industrial-300 hover:bg-space-700 hover:text-white'
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskTable({ data, ...props }: Omit<DataTableProps<Task>, 'columns'>) {
  const columns: Column<Task>[] = [
    { key: 'name', title: '任务名称', sortable: true },
    {
      key: 'status',
      title: '状态',
      sortable: true,
      render: (value) => <span className="text-sm">{String(value)}</span>,
    },
    {
      key: 'progress',
      title: '进度',
      sortable: true,
      render: (value) => `${Number(value) || 0}%`,
      align: 'right',
    },
    {
      key: 'priority',
      title: '优先级',
      sortable: true,
      align: 'center',
    },
    {
      key: 'createdAt',
      title: '创建时间',
      sortable: true,
      render: (value) => {
        const date = value instanceof Date ? value : new Date(String(value));
        return date.toLocaleString('zh-CN');
      },
    },
  ];

  return <DataTable<Task> data={data} columns={columns} {...props} />;
}

export function NodeTable({ data, ...props }: Omit<DataTableProps<Node>, 'columns'>) {
  const columns: Column<Node>[] = [
    { key: 'name', title: '节点名称', sortable: true },
    { key: 'ipAddress', title: 'IP 地址', sortable: true },
    {
      key: 'status',
      title: '状态',
      sortable: true,
      render: (value) => <span className="text-sm">{String(value)}</span>,
    },
    {
      key: 'cpuUsage',
      title: 'CPU',
      sortable: true,
      render: (value) => `${Number(value) || 0}%`,
      align: 'right',
    },
    {
      key: 'memoryUsage',
      title: '内存',
      sortable: true,
      render: (value) => `${Number(value) || 0}%`,
      align: 'right',
    },
    {
      key: 'runningTasks',
      title: '运行任务',
      sortable: true,
      align: 'center',
    },
  ];

  return <DataTable<Node> data={data} columns={columns} {...props} />;
}

export default DataTable;
export type { Column, DataTableProps, SortDirection, SortState };
