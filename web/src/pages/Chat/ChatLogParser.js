/**
 * Chat log 파일을 파싱하여 메시지 배열로 변환
 * 형식: [2025-07-06 20:58:41] 닉네임: 메시지 (해시)
 */
export const parseChatLog = (text) => {
    const lines = text.split('\n');
    const messages = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // [날짜 시간] 닉네임: 메시지 (해시) 형식 파싱
        // 메시지에 괄호가 있을 수 있으므로 마지막 괄호 쌍을 해시로 인식
        const datetimeMatch = trimmed.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+(.+?):\s+(.+?)\s+\((.+)\)$/);
        if (!datetimeMatch) continue;

        const [, datetimeStr, nickname, messageWithPossibleHash, hash] = datetimeMatch;

        // 메시지에서 마지막 해시를 제거 (해시가 메시지 끝에 있을 경우)
        let message = messageWithPossibleHash;
        // 해시가 메시지 안에 포함되어 있을 수 있으므로, 마지막 괄호 쌍 전까지를 메시지로 간주
        const lastParenIndex = messageWithPossibleHash.lastIndexOf('(');
        if (lastParenIndex > 0 && messageWithPossibleHash.endsWith(')')) {
            const possibleHashPart = messageWithPossibleHash.slice(lastParenIndex + 1, -1);
            // 해시는 보통 32자리 16진수이므로 간단히 체크
            if (/^[a-f0-9]{32}$/i.test(possibleHashPart.trim())) {
                message = messageWithPossibleHash.slice(0, lastParenIndex).trim();
            }
        }
        try {
            const timestamp = new Date(datetimeStr.replace(' ', 'T')).getTime();
            messages.push({
                timestamp,
                datetime: datetimeStr,
                nickname,
                message,
                hash,
            });
        } catch (err) {
            console.warn('Failed to parse date:', datetimeStr, err);
        }
    }

    return messages;
};

/**
 * 메시지 배열을 시작 시간 기준으로 상대 시간(초)으로 변환하고 타임라인 데이터 생성
 */
export const createTimelineFromMessages = (messages, startTime, intervalSeconds = 60) => {
    if (!messages || messages.length === 0 || !startTime) {
        return [];
    }

    const startTimestamp = startTime.getTime();
    const timelineMap = new Map();

    // 각 메시지를 시간 구간별로 그룹화
    for (const msg of messages) {
        const relativeSeconds = Math.floor((msg.timestamp - startTimestamp) / 1000);
        if (relativeSeconds < 0) continue;

        const timeBucket = Math.floor(relativeSeconds / intervalSeconds) * intervalSeconds;

        if (!timelineMap.has(timeBucket)) {
            timelineMap.set(timeBucket, 0);
        }
        timelineMap.set(timeBucket, timelineMap.get(timeBucket) + 1);
    }

    // 타임라인 배열로 변환
    const timeline = Array.from(timelineMap.entries())
        .map(([time, count]) => ({ time, count }))
        .sort((a, b) => a.time - b.time);

    return timeline;
};

/**
 * 메시지에서 검색어가 포함된 메시지만 필터링
 */
export const filterMessagesByKeyword = (messages, keyword) => {
    if (!keyword || !keyword.trim()) {
        return messages;
    }

    const lowerKeyword = keyword.toLowerCase().trim();
    return messages.filter((msg) => msg.message.toLowerCase().includes(lowerKeyword));
};

/**
 * 메시지에서 주요 키워드를 추출하고 빈도수에 따라 랭킹을 매김
 */
export const extractTopKeywords = (messages, topN = 20, minLength = 2) => {
    if (!messages || messages.length === 0) {
        return [];
    }

    // 불필요한 단어 필터링 (한 글자, 자주 쓰이는 단어 등)
    const stopWords = new Set([
        '가', '을', '를', '이', '그', '저', '와', '과', '의', '에', '에서', '로', '으로', '도', '만', '은', '는', '다', '요', '어', '아', '네', '음', '응', 'ㅋ', 'ㅎ', 'ㅠ', 'ㅜ', 'ㅇ', 'ㅂ', 'ㅅ', 'ㅈ', 'ㅊ', 'ㅌ', 'ㅍ', 'ㅎ',
        '이', '것', '수', '하', '때', '년', '월', '일', '시', '분', '초', '게', '데', '게', '제', '님', '들'
    ]);

    const wordCount = new Map();
    const wordUsers = new Map(); // 각 단어별로 말한 유저 Set 저장

    // 각 메시지에서 단어 추출
    for (const msg of messages) {
        if (!msg.message || typeof msg.message !== 'string') continue;

        // 한글 단어, 숫자, 영문 단어 추출 (2자 이상)
        const words = msg.message.match(/[\uAC00-\uD7A3]{2,}|\d{2,}|[a-zA-Z]{2,}/g);

        if (!words) continue;

        // 하나의 메시지에서 같은 단어는 한 번만 카운트
        const uniqueWordsInMessage = new Set();

        for (const word of words) {
            const lowerWord = word.toLowerCase();

            // 불필요한 단어 스킵
            if (stopWords.has(lowerWord)) continue;
            if (lowerWord.length < minLength) continue;

            // 이모지나 특수 문자만 있는 경우 스킵
            if (/^[^\w가-힣]*$/.test(word)) continue;

            // 이미 이 메시지에서 카운트한 단어는 스킵
            if (uniqueWordsInMessage.has(lowerWord)) continue;
            uniqueWordsInMessage.add(lowerWord);

            // 빈도수 카운트
            wordCount.set(lowerWord, (wordCount.get(lowerWord) || 0) + 1);

            // 유저 추적
            if (!wordUsers.has(lowerWord)) {
                wordUsers.set(lowerWord, new Set());
            }
            wordUsers.get(lowerWord).add(msg.nickname);
        }
    }

    // 빈도수에 따라 정렬하고 상위 N개 반환
    const sorted = Array.from(wordCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([word, count]) => ({
            word,
            count,
            uniqueUsers: wordUsers.get(word)?.size || 0
        }));

    return sorted;
};

