// 瑞士轮逻辑处理模块

/**
 * 计算队伍当前战绩
 * @param {string} teamName - 队伍名称
 * @param {Array} matches - 比赛记录
 * @returns {Object} - {wins, losses, record: "2-1"}
 */
export function getTeamRecord(teamName, matches) {
  let wins = 0;
  let losses = 0;
  
  matches.forEach(match => {
    if (match.teamA === teamName || match.teamB === teamName) {
      if (match.winner === teamName) {
        wins++;
      } else if (match.winner && match.winner !== teamName) {
        losses++;
      }
    }
  });
  
  return {
    wins,
    losses,
    record: `${wins}-${losses}`
  };
}

/**
 * 获取队伍已交手过的对手列表
 * @param {string} teamName - 队伍名称
 * @param {Array} matches - 比赛记录
 * @returns {Array} - 已交手的对手名称列表
 */
export function getPlayedOpponents(teamName, matches) {
  const opponents = new Set();
  
  matches.forEach(match => {
    if (match.teamA === teamName) {
      opponents.add(match.teamB);
    } else if (match.teamB === teamName) {
      opponents.add(match.teamA);
    }
  });
  
  return Array.from(opponents);
}

/**
 * 根据战绩分组队伍
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 比赛记录
 * @returns {Object} - 按战绩分组的队伍
 */
export function groupTeamsByRecord(teams, matches) {
  const groups = {};
  
  teams.forEach(team => {
    const record = getTeamRecord(team.name, matches);
    const recordKey = record.record;
    
    if (!groups[recordKey]) {
      groups[recordKey] = [];
    }
    
    groups[recordKey].push({
      ...team,
      ...record
    });
  });
  
  return groups;
}

/**
 * 获取指定轮次的比赛格式（Bo1 或 Bo3）
 * @param {number} round - 轮次
 * @param {string} group - 组别（如 "2-0", "1-1"）
 * @returns {string} - "Bo1" 或 "Bo3"
 */
export function getMatchFormat(round, group) {
  if (round <= 2) return "Bo1";
  
  // 第3轮：2-0 和 0-2 是 Bo3，1-1 是 Bo1
  if (round === 3) {
    return (group === "2-0" || group === "0-2") ? "Bo3" : "Bo1";
  }
  
  // 第4轮和第5轮都是 Bo3
  return "Bo3";
}

/**
 * 检查队伍是否已晋级或淘汰
 * @param {Object} teamRecord - 队伍战绩
 * @returns {Object} - {status: "qualified"/"eliminated"/"active", reason: ""}
 */
export function getTeamStatus(teamRecord) {
  if (teamRecord.wins >= 3) {
    return { status: "qualified", reason: `${teamRecord.record} 晋级` };
  }
  
  if (teamRecord.losses >= 3) {
    return { status: "eliminated", reason: `${teamRecord.record} 淘汰` };
  }
  
  return { status: "active", reason: "" };
}

/**
 * 生成下一轮可能的对阵
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 已完成的比赛
 * @param {number} round - 目标轮次
 * @returns {Array} - 可能的对阵列表
 */
export function generatePossibleMatches(teams, matches, round) {
  const groups = groupTeamsByRecord(teams, matches);
  const possibleMatches = [];
  
  // 只考虑仍在比赛中的队伍
  Object.keys(groups).forEach(recordKey => {
    const teamsInGroup = groups[recordKey].filter(team => {
      const status = getTeamStatus(team);
      return status.status === "active";
    });
    
    if (teamsInGroup.length >= 2) {
      // 生成该组内所有可能的配对
      for (let i = 0; i < teamsInGroup.length; i++) {
        for (let j = i + 1; j < teamsInGroup.length; j++) {
          const teamA = teamsInGroup[i];
          const teamB = teamsInGroup[j];
          
          // 检查是否已经交手过
          const playedOpponents = getPlayedOpponents(teamA.name, matches);
          if (!playedOpponents.includes(teamB.name)) {
            possibleMatches.push({
              round,
              group: recordKey,
              teamA: teamA.name,
              teamB: teamB.name,
              format: getMatchFormat(round, recordKey),
              winner: null
            });
          }
        }
      }
    }
  });
  
  return possibleMatches;
}

/**
 * 获取队伍在指定组别中的可能对手
 * @param {string} teamName - 队伍名称
 * @param {string} group - 组别
 * @param {Array} teams - 所有队伍
 * @param {Array} matches - 已完成的比赛
 * @param {number} round - 当前轮次
 * @returns {Array} - 可能的对手列表
 */
export function getPossibleOpponents(teamName, group, teams, matches, round) {
  const playedOpponents = getPlayedOpponents(teamName, matches);
  const groups = groupTeamsByRecord(teams, matches);
  
  if (!groups[group]) return [];
  
  // 获取同组中的其他活跃队伍
  const possibleOpponents = groups[group].filter(team => {
    const status = getTeamStatus(team);
    return team.name !== teamName && 
           status.status === "active" && 
           !playedOpponents.includes(team.name);
  });
  
  return possibleOpponents;
}

/**
 * 验证比赛配对是否有效
 * @param {string} teamA - 队伍A
 * @param {string} teamB - 队伍B
 * @param {Array} matches - 已完成的比赛
 * @param {Array} currentRoundMatches - 当前轮次已配对的比赛
 * @returns {boolean} - 是否有效
 */
export function isValidMatchup(teamA, teamB, matches, currentRoundMatches = []) {
  // 检查是否已经交手过
  const playedOpponents = getPlayedOpponents(teamA, matches);
  if (playedOpponents.includes(teamB)) return false;
  
  // 检查当前轮次是否已经被安排
  const teamAlreadyScheduled = currentRoundMatches.some(match => 
    match.teamA === teamA || match.teamB === teamA ||
    match.teamA === teamB || match.teamB === teamB
  );
  
  return !teamAlreadyScheduled;
}