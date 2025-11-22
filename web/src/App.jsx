import { useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MapPage from './pages/Map/MapPage.jsx';
import TimelinePage from './pages/Timeline/TimelinePage.jsx';
import ChatPage from './pages/Chat/ChatPage.jsx';
import AllVideosPage from './pages/Static/AllVideosPage.jsx';
import ChannelPage from './pages/Channel/ChannelPage.jsx';
import LiveChatPage from './pages/LiveChat/LiveChatPage.jsx';

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

const ChatBubbleIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...props}>
    <path
      d="M7 17L5 21L9 19H17C18.6569 19 20 17.6569 20 16V8C20 6.34315 18.6569 5 17 5H7C5.34315 5 4 6.34315 4 8V16C4 17.6569 5.34315 19 7 19H9"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9 11H15" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 8H13" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const navItems = [
  { to: '/map', label: '지직 맵', Icon: MapPinIcon },
  { to: '/timeline', label: '지직 타임라인', Icon: ClockIcon },
  { to: '/live-chat', label: 'Live Chat', Icon: ChatBubbleIcon },
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

      <div className="relative min-h-screen">
        <Routes>
          <Route path="/" element={<Navigate to="/live-chat" replace />} />
          <Route path="/live-chat" element={<LiveChatPage />} />
        </Routes>
      </div>

    </div>
  );
};

export default App;
