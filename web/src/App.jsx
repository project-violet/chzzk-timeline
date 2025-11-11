import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MapPage from './pages/Map/MapPage.jsx';
import TimelinePage from './pages/Timeline/TimelinePage.jsx';

const MapPinIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M15 10a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M19.5 10c0 4.5-7.5 11.25-7.5 11.25S4.5 14.5 4.5 10a7.5 7.5 0 1115 0z"
    />
  </svg>
);

const ClockIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...props}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);


const StreamerIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...props}>
    <circle cx="12" cy="7.5" r="3.5" strokeWidth="1.5" />
    <path
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 19.5c0-3.037 2.686-5.5 6-5.5s6 2.463 6 5.5"
    />
  </svg>
);

const navItems = [
  { to: '/map', label: '치지직 맵', Icon: MapPinIcon },
  { to: '/timeline', label: '치지직 타임라인', Icon: ClockIcon },
];

const externalLinks = [
  {
    href: 'https://chzzk.naver.com/',
    icon: '/chzzk-icon.png',
    label: '치지직 바로가기',
  },
  {
    href: 'https://github.com/project-violet/chzzk-timeline',
    icon: '/github-mark-white.svg',
    label: 'GitHub 저장소',
  },
];

const App = () => {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const location = useLocation();
  const isTimelinePage = location.pathname.startsWith('/timeline');

  const handleOpenMobileFilter = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('open-streamer-filter'));
  };

  return (
    <div className="min-h-screen text-white">
      <nav className="fixed left-1/2 top-6 z-50 flex -translate-x-[52%] items-center gap-3 rounded-full bg-slate-900/80 px-4 lg:-translate-x-1/2 lg:gap-6 lg:px-8 py-2 lg:py-3 text-sm font-semibold shadow-lg backdrop-blur">
        <div className="flex items-center gap-2.5 lg:gap-6">
          {isTimelinePage ? (
            <button
              type="button"
              onClick={handleOpenMobileFilter}
              className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/80 px-3 text-xs font-semibold text-slate-100 transition hover:bg-slate-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60 whitespace-nowrap lg:hidden"
              aria-label="스트리머 필터 열기"
            >
              <StreamerIcon className="h-5 w-5 text-teal-300" />
              <span>스트리머 필터</span>
            </button>
          ) : null}
          <div className="flex items-center gap-2.5 lg:gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  [
                    'inline-flex items-center justify-center lg:justify-start gap-2 rounded-full px-3 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300/60',
                    isActive ? 'text-teal-300' : 'text-slate-300 hover:text-white',
                  ].join(' ')
                }
              >
                <item.Icon className="h-5 w-5 flex-none" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
        <span className="hidden h-6 w-px bg-slate-700/80 lg:inline-block" aria-hidden />
        <div className="flex items-center gap-3 lg:gap-4">
          {externalLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-slate-800/80"
              aria-label={link.label}
              title={link.label}
            >
              <img
                src={link.icon}
                alt=""
                className="h-5 w-5"
                loading="lazy"
                aria-hidden="true"
              />
            </a>
          ))}
          <button
            type="button"
            onClick={() => setIsInfoOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/70 text-slate-100 transition-colors hover:bg-slate-700/80"
            aria-label="프로젝트 정보 보기"
            title="프로젝트 정보"
          >
            ?
          </button>
        </div>
      </nav>

      {isInfoOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6"
          onClick={() => setIsInfoOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl border border-slate-700/70 bg-slate-900/95 p-8 text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsInfoOpen(false)}
              className="absolute right-4 top-4 rounded-full px-3 py-1 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="정보 창 닫기"
            >
              닫기
            </button>
            <h2 className="text-2xl font-bold text-teal-300">치지직 타임라인</h2>
            <a
              href="https://github.com/project-violet/chzzk-timeline"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-slate-300 underline decoration-teal-400/70 decoration-dashed underline-offset-4 transition-colors hover:text-white"
            >
              https://github.com/project-violet/chzzk-timeline
            </a>
            <div className="mt-6 space-y-2 text-sm text-slate-200">
              <p>치지직 다시보기 정보를 스트리머 별로 타임라인으로 보여줍니다.</p>
              <p>모든 정보는 누구나 접근 가능한 치지직 공개 API를 통해 얻고 있습니다.</p>
              <p>이 프로젝트는 오픈소스이며 누구나 자유롭게 사용할 수 있습니다.</p>
              <p>문의: violet.dev.master@gmail.com</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-screen">
        <Routes>
          <Route path="/" element={<Navigate to="/timeline" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
