import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import MapPage from './pages/Map/MapPage.jsx';
import TimelinePage from './pages/Timeline/TimelinePage.jsx';

const navItems = [
  { to: '/map', label: '치지직 맵' },
  { to: '/timeline', label: '치지직 타임라인' },
];

const App = () => {
  return (
    <div className="min-h-screen text-white">
      <nav className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 items-center gap-6 rounded-full bg-slate-900/80 px-8 py-3 text-sm font-semibold shadow-lg backdrop-blur">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'transition-colors',
                isActive ? 'text-teal-300' : 'text-slate-300 hover:text-white',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="relative min-h-screen">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
