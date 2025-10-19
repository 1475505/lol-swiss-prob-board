// 数学方式的概率计算模块

import { 
  getTeamRecord, 
  getTeamStatus, 
  groupTeamsByRecord, 
  getPlayedOpponents 
} from './swissLogic.js';

/**
 * 计算单个战队在不同结果下的抽签概率（数学方法）
 * @param {string} teamName - 战队名称
 * @param {Array} teams - 所有战队
 * @param {Array} allMatches - 所有比赛数据
 * @param {number} currentRound - 当前轮次
 * @param {number} targetRound - 目标轮次
 * @param {string} outcome - 'win' 或 'lose'
 * @returns {Array} 对手概率列表
 */
export function calculateTeamDrawProbabilities(teamName, teams, allMatches, currentRound, targetRound, outcome) {
  // 创建假设的比赛结果
  const hypotheticalMatches = createHypotheticalMatches(allMatches, teamName, currentRound, outcome);
  
  // 获取战队在假设结果下的新战绩
  const newRecord = getTeamRecord(teamName, hypotheticalMatches);
  const newStatus = getTeamStatus(newRecord);
  
  // 如果战队被淘汰或晋级，返回特殊状态
  if (newStatus.status !== 'active') {
    return [{
      opponent: newStatus.status === 'qualified' ? '已晋级' : '已淘汰',
      probability: 1.0,
      status: newStatus.status
    }];
  }
  
  // 计算在目标轮次的抽签概率
  return calculateDrawProbabilitiesForRound(teamName, teams, hypotheticalMatches, targetRound);
}

/**
 * 计算两支战队相遇的概率（数学方法）
 * @param {string} teamA - 战队A
 * @param {string} teamB - 战队B
 * @param {Array} teams - 所有战队
 * @param {Array} allMatches - 所有比赛数据
 * @param {number} targetRound - 目标轮次
 * @returns {number} 相遇概率 (0-1)
 */
export function calculateMeetingProbability(teamA, teamB, teams, allMatches, targetRound) {
  // 检查基本条件
  if (!canTeamsMeet(teamA, teamB, teams, allMatches, targetRound)) {
    return 0;
  }
  
  // 获取两队当前战绩
  const recordA = getTeamRecord(teamA, allMatches);
  const recordB = getTeamRecord(teamB, allMatches);
  
  // 计算两队在目标轮次可能的战绩组合
  const possibleRecordsA = getPossibleRecords(teamA, teams, allMatches, targetRound);
  const possibleRecordsB = getPossibleRecords(teamB, teams, allMatches, targetRound);
  
  let totalProbability = 0;
  
  // 遍历所有可能的战绩组合
  for (const scenarioA of possibleRecordsA) {
    for (const scenarioB of possibleRecordsB) {
      // 如果两队在同一战绩组
      if (scenarioA.record === scenarioB.record) {
        const meetingProb = calculateSameGroupMeetingProbability(
          teamA, teamB, teams, allMatches, targetRound, scenarioA.record
        );
        totalProbability += scenarioA.probability * scenarioB.probability * meetingProb;
      }
    }
  }
  
  return Math.min(totalProbability, 1.0);
}

/**
 * 创建假设的比赛结果
 * @param {Array} allMatches - 所有比赛
 * @param {string} teamName - 战队名称
 * @param {number} round - 轮次
 * @param {string} outcome - 结果
 * @returns {Array} 修改后的比赛数据
 */
function createHypotheticalMatches(allMatches, teamName, round, outcome) {
  const matches = [...allMatches];
  
  // 找到该队伍在指定轮次的比赛
  const matchIndex = matches.findIndex(match => 
    match.round === round && 
    (match.teamA === teamName || match.teamB === teamName) &&
    !match.winner
  );
  
  if (matchIndex !== -1) {
    const match = matches[matchIndex];
    const winner = outcome === 'win' ? teamName : 
                  (match.teamA === teamName ? match.teamB : match.teamA);
    
    matches[matchIndex] = {
      ...match,
      winner: winner
    };
  }
  
  return matches;
}

/**
 * 计算战队在指定轮次的抽签概率
 * @param {string} teamName - 战队名称
 * @param {Array} teams - 所有战队
 * @param {Array} matches - 比赛数据
 * @param {number} round - 轮次
 * @returns {Array} 对手概率列表
 */
function calculateDrawProbabilitiesForRound(teamName, teams, matches, round) {
  const teamRecord = getTeamRecord(teamName, matches);
  const teamGroup = `${teamRecord.wins}-${teamRecord.losses}`;
  
  // 按战绩分组
  const groups = groupTeamsByRecord(teams, matches);
  const playedOpponents = getPlayedOpponents(teamName, matches);
  
  const probabilities = [];
  
  // 优先同组配对
  if (groups[teamGroup]) {
    const sameGroupOpponents = groups[teamGroup].filter(team => {
      const status = getTeamStatus(getTeamRecord(team.name, matches));
      return team.name !== teamName && 
             status.status === 'active' && 
             !playedOpponents.includes(team.name);
    });
    
    if (sameGroupOpponents.length > 0) {
      const baseProb = 1.0 / sameGroupOpponents.length;
      
      sameGroupOpponents.forEach(opponent => {
        let adjustedProb = baseProb;
        
        // 考虑地区回避
        const targetTeam = teams.find(t => t.name === teamName);
        const opponentTeam = teams.find(t => t.name === opponent.name);
        
        if (targetTeam && opponentTeam && isSameRegion(targetTeam, opponentTeam)) {
          adjustedProb *= 0.3; // 同地区概率降低
        }
        
        probabilities.push({
          opponent: opponent.name,
          probability: adjustedProb
        });
      });
    }
  }
  
  // 如果同组没有对手，考虑相邻组
  if (probabilities.length === 0) {
    const adjacentGroups = getAdjacentGroups(teamGroup, groups);
    
    adjacentGroups.forEach(groupKey => {
      if (groups[groupKey]) {
        const adjacentOpponents = groups[groupKey].filter(team => {
          const status = getTeamStatus(getTeamRecord(team.name, matches));
          return team.name !== teamName && 
                 status.status === 'active' && 
                 !playedOpponents.includes(team.name);
        });
        
        adjacentOpponents.forEach(opponent => {
          probabilities.push({
            opponent: opponent.name,
            probability: 0.1 / adjacentOpponents.length // 相邻组概率较低
          });
        });
      }
    });
  }
  
  // 归一化概率
  const totalProb = probabilities.reduce((sum, p) => sum + p.probability, 0);
  if (totalProb > 0) {
    probabilities.forEach(p => {
      p.probability = p.probability / totalProb;
    });
  }
  
  return probabilities.sort((a, b) => b.probability - a.probability);
}

/**
 * 检查两队是否可能相遇
 * @param {string} teamA - 战队A
 * @param {string} teamB - 战队B
 * @param {Array} teams - 所有战队
 * @param {Array} matches - 比赛数据
 * @param {number} round - 轮次
 * @returns {boolean}
 */
function canTeamsMeet(teamA, teamB, teams, matches, round) {
  // 检查两队状态
  const statusA = getTeamStatus(getTeamRecord(teamA, matches));
  const statusB = getTeamStatus(getTeamRecord(teamB, matches));
  
  if (statusA.status !== 'active' || statusB.status !== 'active') {
    return false;
  }
  
  // 检查是否已经交过手
  const playedOpponentsA = getPlayedOpponents(teamA, matches);
  if (playedOpponentsA.includes(teamB)) {
    return false;
  }
  
  return true;
}

/**
 * 获取战队在目标轮次的所有可能战绩
 * @param {string} teamName - 战队名称
 * @param {Array} teams - 所有战队
 * @param {Array} matches - 比赛数据
 * @param {number} targetRound - 目标轮次
 * @returns {Array} 可能的战绩及其概率
 */
function getPossibleRecords(teamName, teams, matches, targetRound) {
  const currentRecord = getTeamRecord(teamName, matches);
  // 防止空数组导致 Math.max 返回 -Infinity
  const currentRound = Math.max(0, ...matches.map(m => (m && typeof m === 'object' ? (m.round || 0) : 0)));
  
  // 如果已经到达目标轮次，返回当前战绩
  if (currentRound >= targetRound) {
    return [{
      record: `${currentRecord.wins}-${currentRecord.losses}`,
      probability: 1.0
    }];
  }
  
  // 计算从当前轮次到目标轮次的所有可能路径
  const possibleRecords = [];
  const roundsToPlay = targetRound - currentRound;
  
  // 简化计算：假设每场比赛50%胜率
  for (let wins = 0; wins <= roundsToPlay; wins++) {
    const losses = roundsToPlay - wins;
    const finalWins = currentRecord.wins + wins;
    const finalLosses = currentRecord.losses + losses;
    
    // 计算这种结果的概率（二项分布）
    const probability = binomialProbability(roundsToPlay, wins, 0.5);
    
    possibleRecords.push({
      record: `${finalWins}-${finalLosses}`,
      probability: probability
    });
  }
  
  return possibleRecords;
}

/**
 * 计算同组内两队相遇的概率
 * @param {string} teamA - 战队A
 * @param {string} teamB - 战队B
 * @param {Array} teams - 所有战队
 * @param {Array} matches - 比赛数据
 * @param {number} round - 轮次
 * @param {string} groupRecord - 战绩组
 * @returns {number} 相遇概率
 */
function calculateSameGroupMeetingProbability(teamA, teamB, teams, matches, round, groupRecord) {
  const groups = groupTeamsByRecord(teams, matches);
  
  if (!groups[groupRecord]) {
    return 0;
  }
  
  const groupTeams = groups[groupRecord].filter(team => {
    const status = getTeamStatus(getTeamRecord(team.name, matches));
    return status.status === 'active';
  });
  
  const teamCount = groupTeams.length;
  
  if (teamCount < 2) {
    return 0;
  }
  
  // 简化计算：假设组内随机配对
  return 1 / (teamCount - 1);
}

/**
 * 获取相邻的战绩组
 * @param {string} targetGroup - 目标组
 * @param {Object} groups - 所有组
 * @returns {Array} 相邻组列表
 */
function getAdjacentGroups(targetGroup, groups) {
  const [wins, losses] = targetGroup.split('-').map(Number);
  const adjacentGroups = [];
  
  // 上一组（胜场多1）
  const upperGroup = `${wins + 1}-${losses}`;
  if (groups[upperGroup]) {
    adjacentGroups.push(upperGroup);
  }
  
  // 下一组（负场多1）
  const lowerGroup = `${wins}-${losses + 1}`;
  if (groups[lowerGroup]) {
    adjacentGroups.push(lowerGroup);
  }
  
  return adjacentGroups;
}

/**
 * 检查是否为同地区队伍
 * @param {Object} teamA - 战队A
 * @param {Object} teamB - 战队B
 * @returns {boolean}
 */
function isSameRegion(teamA, teamB) {
  // 简化实现：假设队伍名称包含地区信息
  // 实际应该根据队伍的地区属性判断
  return teamA.region === teamB.region;
}

function combination(n, k) {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  if (k > n / 2) {
    k = n - k;
  }
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

/**
 * 计算二项分布概率
 * @param {number} n - 总次数
 * @param {number} k - 成功次数
 * @returns {number} - 概率
 */
function binomialProbability(n, k, p) {
  return combination(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * @param {any[]} array
 * @param {number} size
 */
function* combinations(array, size) {
  for (let i = 0; i < array.length; i++) {
    if (size === 1) {
      yield [array[i]];
    } else {
      const remaining = combinations(array.slice(i + 1), size - 1);
      for (const next of remaining) {
        yield [array[i], ...next];
      }
    }
  }
}

/**
 * 计算战队的出线概率
 * @param {string} teamName - 战队名称
 * @param {Array} teams - 所有战队
 * @param {Array} matches - 比赛数据
 * @returns {Object} 出线概率信息
 */
export function calculateQualificationProbability(teamName, teams, matches) {
  console.log('[mathematicalProbability] 计算出线概率', {
    teamName,
    teamsCount: teams?.length || 0,
    matchesCount: matches?.length || 0,
    matches: matches?.map(m => ({
      round: m?.round,
      teamA: m?.teamA,
      teamB: m?.teamB,
      winner: m?.winner
    })) || []
  });
  
  const currentRecord = getTeamRecord(teamName, matches);
  console.log('[mathematicalProbability] 当前战绩', { teamName, currentRecord });
  
  const currentStatus = getTeamStatus(currentRecord);
  console.log('[mathematicalProbability] 当前状态', { teamName, currentStatus });
  
  if (currentStatus.status === 'qualified') {
    return { 
      probability: 1.0, 
      status: 'qualified',
      currentRecord: `${currentRecord.wins}-${currentRecord.losses}`
    };
  }
  
  if (currentStatus.status === 'eliminated') {
    return { 
      probability: 0.0, 
      status: 'eliminated',
      currentRecord: `${currentRecord.wins}-${currentRecord.losses}`
    };
  }
  
  // 计算当前已进行的轮次数
  const completedRounds = Math.max(0, currentRecord.wins + currentRecord.losses);
  const remainingRounds = Math.max(0, 5 - completedRounds);
  
  console.log('[mathematicalProbability] 轮次计算', {
    completedRounds,
    remainingRounds,
    currentWins: currentRecord.wins,
    currentLosses: currentRecord.losses
  });
  
  let qualificationProbability = 0;
  
  // 遍历所有可能的胜负组合
  for (let wins = 0; wins <= remainingRounds; wins++) {
    const losses = remainingRounds - wins;
    const finalWins = currentRecord.wins + wins;
    const finalLosses = currentRecord.losses + losses;
    
    // 检查这个战绩是否能出线
    const finalRecord = { wins: finalWins, losses: finalLosses };
    const finalStatus = getTeamStatus(finalRecord);
    
    if (finalStatus.status === 'qualified') {
      const probability = binomialProbability(remainingRounds, wins, 0.5);
      qualificationProbability += probability;
      
      console.log('[mathematicalProbability] 出线场景', {
        wins,
        losses,
        finalWins,
        finalLosses,
        probability,
        cumulativeProbability: qualificationProbability
      });
    }
  }
  
  const result = { 
    probability: qualificationProbability, 
    status: 'active',
    currentRecord: `${currentRecord.wins}-${currentRecord.losses}`
  };
  
  console.log('[mathematicalProbability] 最终出线概率', result);
  return result;
}