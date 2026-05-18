import { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

export function usePager(data, pageSize = PAGE_SIZE_DEFAULT) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  useEffect(() => { setPage(1); }, [data.length, size]);
  const totalPages = Math.max(1, Math.ceil(data.length / size));
  const start      = (page - 1) * size;
  const paged      = size >= PAGE_SIZE_ALL ? data : data.slice(start, start + size);
  return { paged, page, setPage, size, setSize, totalPages, total: data.length };
}

export function Btn({ onClick, color = 'indigo', size = 'md', children, className = '', disabled, ...rest }) {
  const colors = {
    indigo: 'bg-[#079DD9] hover:bg-[#0589c0] text-white',
    green:  'bg-green-600  hover:bg-green-700  text-white',
    red:    'bg-[#F24444] hover:bg-[#d93a3a] text-white',
    yellow: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    gray:   'bg-gray-200   hover:bg-gray-300   text-gray-700',
    orange: 'bg-orange-100 hover:bg-orange-200 text-orange-600',
    blue:   'bg-[#079DD9] hover:bg-[#0589c0] text-white',
  };
  const sizes = { sm: 'px-3 py-1 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={'rounded-lg font-medium transition-colors disabled:opacity-40 ' + colors[color] + ' ' + sizes[size] + ' ' + className}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }) {
  return <div className={'bg-white rounded-xl shadow p-4 md:p-6 ' + className}>{children}</div>;
}

export function SectionTitle({ children }) {
  return <h2 className="text-xl md:text-2xl font-bold text-gray-800">{children}</h2>;
}

export function Pagination({ page, setPage, size, setSize, totalPages, total, paged }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  const showingAll = size >= PAGE_SIZE_ALL;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t mt-2 text-sm text-gray-500">
      <span>
        {showingAll
          ? <span>{t('showing')} {total} {t('items')}</span>
          : <span>{t('page')} {page}/{totalPages} · {paged.length}/{total} {t('items')}</span>}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {!showingAll && (
          <>
            <Btn color="gray" size="sm" onClick={() => setPage(1)}                                disabled={page === 1}>«</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))}          disabled={page === 1}>‹</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(totalPages)}                        disabled={page === totalPages}>»</Btn>
          </>
        )}
        {showingAll
          ? <Btn color="indigo" size="sm" onClick={() => setSize(PAGE_SIZE_DEFAULT)}>{t('show_less')}</Btn>
          : <Btn color="gray"   size="sm" onClick={() => setSize(PAGE_SIZE_ALL)}>{t('show_all')} {total}</Btn>}
      </div>
    </div>
  );
}
export default Pagination;