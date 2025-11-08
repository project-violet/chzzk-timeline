import WebSocket from 'ws';
import * as db from './db.js';

const scrapingChannels = new Set();

export async function scanChannels() {
  let lives = await fetchLivesPages(process.env.MIN_LIVE_USER);

  lives = lives.filter((live) => live.adult === false);

  lives = await sequentialMap(lives, async (live) => {
    const { followerCount } = await fetchChannel(live.channel.channelId);
    const { chatChannelId } = await fetchLiveDetail(live.channel.channelId);
    return { ...live, chatChannelId, channel: { ...live.channel, followerCount } };
  });
  lives = lives.filter((live) => live.channel.followerCount !== undefined);
  lives = lives.filter((live) => live.chatChannelId !== undefined);

  lives.forEach((live) => db.insertChannel(live.channel));

  // lives = lives.filter((live) => !scrapingChannels.has(live.channel.channelId));

  // lives.forEach((live) => scrapeChats(live));
}

function log(...args) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  console.log(now, ...args);
}
async function sequentialMap(array, asyncCallback) {
  return array.reduce(async (accPromise, item) => {
    const acc = await accPromise;
    const result = await asyncCallback(item);
    return [...acc, result];
  }, Promise.resolve([]));
}

async function fetchLives(next) {
  const url = next
    ? `https://api.chzzk.naver.com/service/v1/lives?size=50&sortType=POPULAR&concurrentUserCount=${next.concurrentUserCount}&liveId=${next.liveId}`
    : 'https://api.chzzk.naver.com/service/v1/lives?size=50&sortType=POPULAR';

  const json = await fetch(url, { headers: { 'User-Agent': 'Mozilla' } }).then((res) => res.json());
  return { lives: json.content.data, next: json.content.page.next };
}
async function fetchLivesPages(minUser) {
  const validLives = [];
  let lives, next, filteredLives;
  do {
    ({ lives, next } = await fetchLives(next));
    filteredLives = lives.filter((live) => live.concurrentUserCount >= minUser);
    validLives.push(...filteredLives);
  } while (lives.length === filteredLives.length);
  return validLives;
}
async function fetchLiveDetail(channelId) {
  const url = `https://api.chzzk.naver.com/service/v3/channels/${channelId}/live-detail`;
  try {
    const json = await fetch(url, { headers: { 'User-Agent': 'Mozilla' } }).then((res) => res.json());
    // TypeError: Cannot destructure property 'chatChannelId' of '(intermediate value)' as it is undefined. 에러 발생
    return json.content ?? {};
  } catch (e) {
    log('fetchLiveDetail() Fetch Error!', e);
    return {};
  }
}
async function fetchChannel(channelId) {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla' } });
    const json = await res.json()
    if (json?.content === undefined) {
      log('fetchChannel() JSON Error!', json);
      return {};
    }
    return json.content;
  }
  catch (e) {
    log('fetchChannel() Parse Error!', e);
    return {};
  }
}

const WS_MSG = {
  INIT: (cid) => ({
    ver: '3',
    cmd: 100,
    svcid: 'game',
    cid: `${cid}`,
    tid: 1,
    bdy: {
      uid: null,
      devType: 2001,
      accTkn: null,
      auth: 'READ',
      libVer: null,
      osVer: null,
      devName: null,
      locale: null,
      timezone: null
    },
  }),
  PING: {
    ver: 3,
    cmd: 0,
  },
  PONG: {
    ver: 3,
    cmd: 10000,
  },
}
function scrapeChats(live) {
  const ws = new WebSocket('wss://kr-ss1.chat.naver.com/chat');

  const interval = setInterval(async () => {
    const { openLive } = await fetchChannel(live.channel.channelId);
    if (!openLive) return ws.close();
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(WS_MSG.PING));
  }, 20 * 1000);

  ws.on('error', log);

  ws.on('open', () => {
    ws.send(JSON.stringify(WS_MSG.INIT(live.chatChannelId)));
    scrapingChannels.add(live.channel.channelId)
    log('Opened!', live.channel.channelId, scrapingChannels.size);
  });

  ws.on('close', () => {
    clearInterval(interval);
    scrapingChannels.delete(live.channel.channelId);
    log('Closed!', live.channel.channelId, scrapingChannels.size);
  });

  ws.on('message', (data) => {
    const { cmd, bdy } = JSON.parse(data.toString('utf8'));
    if (cmd === 0) return ws.send(JSON.stringify(WS_MSG.PONG));
    else if (cmd === 93101) {
      bdy.forEach((chat) => {
        db.insertChat({ channelId: live.channel.channelId, userId: chat.uid });
      });
    }
  });
}
