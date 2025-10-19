// 抽签模拟和概率计算逻辑

import { 
  getTeamRecord, 
  groupTeamsByRecord, 
  getPlayedOpponents, 
  getTeamStatus,
  getMatchFormat 
} from './swissLogic.js';

/**
 * 获取第一轮的抽签池配置
 * TODO: 第1轮抽签暂不支持（涉及种子设定）
 * @param {Array} teams - 队伍列表
 * @returns {Object} - {pool1: Array, pool2: Array, pool3: Array}
 */
export function getFirstRoundPools(teams) {
  // TODO: 需要根据实际种子设定来分池，而不是简单按顺序切分
  // 根据规则：池1 5队、池2 6队、池3 5队
  // 目前只有16支队伍，需要调整分池逻辑
  const pool1 = teams.slice(0, 5);  // 前5队为Pool1
  const pool2 = teams.slice(5, 11); // 中6队为Pool2  
  const pool3 = teams.slice(11, 16); // 后5队为Pool3
  
  return { pool1, pool2, pool3 };
}

/**
 * 检查两队是否来自同一赛区（用于回避规则）
 * @param {Object} teamA - 队伍A
 * @param {Object} teamB - 队伍B
 * @returns {boolean} - 是否同赛区
 */
export function isSameRegion(teamA, teamB) {
  return teamA.region === teamB.region;
}

/**
 * 模拟第一轮抽签
 * TODO: 第1轮抽签暂不支持（涉及种子设定）
 * @param {Array} teams - 队伍列表
 * @returns {Array} - 比赛列表
 */
export function simulateFirstRoundDraw(teams) {
  // TODO: 第1轮抽签需要考虑种子设定，暂时禁用
  throw new Error('第1轮抽签暂不支持（涉及种子设定）');
  
  // 以下代码保留作为参考，但暂时不使用
  /*
  // 过滤掉已晋级或淘汰的队伍（虽然第一轮通常不会有这种情况）
  const activeTeams = teams.filter(team => {
    // 第一轮时所有队伍都应该是活跃的，但为了保险起见还是检查一下
    return true; // 第一轮所有队伍都参与
  });
  
  const { pool1, pool2, pool3 } = getFirstRoundPools(activeTeams);
  const matches = [];
  
  // Pool1 vs Pool3 的配对
  const pool1Copy = [...pool1];
  const pool3Copy = [...pool3];
  
  // 随机打乱
  for (let i = pool1Copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool1Copy[i], pool1Copy[j]] = [pool1Copy[j], pool1Copy[i]];
  }
  
  for (let i = pool3Copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool3Copy[i], pool3Copy[j]] = [pool3Copy[j], pool3Copy[i]];
  }
  
  // 尝试配对，避免同赛区
  const used1 = new Set();
  const used3 = new Set();
  
  for (let i = 0; i < pool1Copy.length; i++) {
    if (used1.has(i)) continue;
    
    for (let j = 0; j < pool3Copy.length; j++) {
      if (used3.has(j)) continue;
      
      const team1 = pool1Copy[i];
      const team3 = pool3Copy[j];
      
      // 如果不是同赛区，或者没有其他选择，则配对
      if (!isSameRegion(team1, team3) || 
          (pool1Copy.length - used1.size <= pool3Copy.length - used3.size)) {
        matches.push({
          teamA: team1.name,
          teamB: team3.name,
          round: 1,
          group: '0-0',
          format: getMatchFormat(1, '0-0')
        });
        used1.add(i);
        used3.add(j);
        break;
      }
    }
  }

  // Pool2 内部配对
  const pool2Copy = [...pool2];
  for (let i = pool2Copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool2Copy[i], pool2Copy[j]] = [pool2Copy[j], pool2Copy[i]];
  }
  
  for (let i = 0; i < pool2Copy.length; i += 2) {
    if (i + 1 < pool2Copy.length) {
      const teamA = pool2Copy[i];
      const teamB = pool2Copy[i + 1];
      
      // 尝试避免同赛区
      if (i + 2 < pool2Copy.length && isSameRegion(teamA, teamB)) {
        // 尝试与下一队交换
        const teamC = pool2Copy[i + 2];
        if (!isSameRegion(teamA, teamC)) {
          pool2Copy[i + 1] = teamC;
          pool2Copy[i + 2] = teamB;
        }
      }
      
      matches.push({
        teamA: pool2Copy[i].name,
        teamB: pool2Copy[i + 1].name,
        round: 1,
        group: '0-0',
        format: getMatchFormat(1, '0-0')
      });
    }
  }
  
  return matches;
  */
}

/**
 * 模拟后续轮次的抽签
 * @param {Array} teams - 队伍列表
 * @param {Array} previousMatches - 之前的比赛记录
 * @param {number} round - 轮次
 * @returns {Array} - 比赛列表
 */
export function simulateRoundDraw(teams, previousMatches, round) {
  const matches = [];
  
  // 按战绩分组
  const groups = groupTeamsByRecord(teams, previousMatches);
  
  // 为每个分组生成对阵
  Object.keys(groups).forEach(groupKey => {
    const groupTeams = groups[groupKey];
    if (groupTeams.length < 2) return;
    
    // 过滤掉已晋级或淘汰的队伍
    const activeTeams = groupTeams.filter(team => {
      const teamRecord = getTeamRecord(team.name, previousMatches);
      const teamStatus = getTeamStatus(teamRecord);
      return teamStatus.status === 'active';
    });
    
    if (activeTeams.length < 2) return;
    
    // 获取每队的已对阵对手
    const teamsWithOpponents = activeTeams.map(team => ({
      ...team,
      playedOpponents: getPlayedOpponents(team.name, previousMatches)
    }));
    
    // 随机配对算法：先随机打乱队伍顺序，然后进行配对
    const availableTeams = [...teamsWithOpponents];
    
    // 随机打乱队伍顺序
    for (let i = availableTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableTeams[i], availableTeams[j]] = [availableTeams[j], availableTeams[i]];
    }
    
    while (availableTeams.length >= 2) {
      const teamA = availableTeams.shift();
      
      // 找到所有没有对阵过的对手
      const validOpponents = [];
      for (let i = 0; i < availableTeams.length; i++) {
        const teamB = availableTeams[i];
        if (!teamA.playedOpponents.includes(teamB.name)) {
          validOpponents.push({ team: teamB, index: i });
        }
      }
      
      let opponentIndex = -1;
      if (validOpponents.length > 0) {
        // 从有效对手中随机选择一个
        const randomValidOpponent = validOpponents[Math.floor(Math.random() * validOpponents.length)];
        opponentIndex = randomValidOpponent.index;
      } else if (availableTeams.length > 0) {
        // 如果没有未对阵的对手，随机选择一个可用的
        opponentIndex = Math.floor(Math.random() * availableTeams.length);
      }
      
      if (opponentIndex >= 0) {
        const teamB = availableTeams.splice(opponentIndex, 1)[0];
        
        matches.push({
          teamA: teamA.name,
          teamB: teamB.name,
          round: round,
          group: groupKey,
          format: getMatchFormat(round, groupKey)
        });
      }
    }
  });
  
  return matches;
}

/**
 * 模拟完整的抽签结果
 * @param {Array} teams - 队伍列表
 * @param {Array} allMatches - 所有比赛数据
 * @param {number} targetRound - 目标轮次
 * @returns {Object} - 抽签结果 {matches: Array}
 */
export function simulateDrawForRound(teams, allMatches, targetRound) {
  // 获取有效的比赛数据（包括用户在界面上设置的胜者）
  const validMatches = allMatches.filter(match => 
    match.round < targetRound && 
    match.winner && 
    match.winner !== null &&
    match.teamA !== 'TBD' && 
    match.teamB !== 'TBD'
  );
  
  let matches;
  if (targetRound === 1) {
    matches = simulateFirstRoundDraw(teams);
  } else {
    matches = simulateRoundDraw(teams, validMatches, targetRound);
  }
  
  return { matches };
}

/**
 * 计算两队在指定轮次相遇的概率
 * @param {string} teamA - 队伍A名称
 * @param {string} teamB - 队伍B名称
 * @param {Array} teams - 所有队伍
 * @param {Array} completedMatches - 已完成的比赛
 * @param {number} round - 目标轮次
 * @param {number} simulations - 模拟次数（默认1000次）
 * @returns {number} - 相遇概率（0-1之间）
 */
export function calculateMeetingProbability(teamA, teamB, teams, completedMatches, round, simulations = 1000) {
  let meetingCount = 0;
  
  for (let i = 0; i < simulations; i++) {
    const drawResult = simulateDrawForRound(teams, completedMatches, round);
    
    // 检查这次抽签中两队是否相遇
    const meeting = drawResult.matches.some(match => 
      (match.teamA === teamA && match.teamB === teamB) ||
      (match.teamA === teamB && match.teamB === teamA)
    );
    
    if (meeting) {
      meetingCount++;
    }
  }
  
  return meetingCount / simulations;
}

/**
 * 计算指定队伍在指定轮次遇到各个对手的概率（数学方法）
 * @param {string} teamName - 队伍名称
 * @param {Array} teams - 所有队伍数据
 * @param {Array} allMatches - 所有比赛数据
 * @param {number} round - 目标轮次
 * @returns {Array} 对手概率列表
 */
export function calculateOpponentProbabilities(teamName, teams, allMatches, round) {
  // 获取有效的比赛（目标轮次之前且有胜者的比赛）
  // 这里包括了用户在界面上设置的胜者信息
  const validMatches = allMatches.filter(match => 
    match.round < round && 
    match.winner && 
    match.winner !== null &&
    match.teamA !== 'TBD' && 
    match.teamB !== 'TBD'
  );
  
  // 获取目标队伍的当前战绩和状态
  const targetTeamRecord = getTeamRecord(teamName, validMatches);
  const targetTeamStatus = getTeamStatus(targetTeamRecord);
  
  // 如果队伍已经淘汰或晋级，返回空数组
  if (targetTeamStatus.status !== 'active') {
    return [];
  }
  
  // 按战绩分组所有活跃队伍（使用有效比赛数据）
  const groups = groupTeamsByRecord(teams, validMatches);
  const targetGroup = `${targetTeamRecord.wins}-${targetTeamRecord.losses}`;
  
  // 获取目标队伍已交手的对手
  const playedOpponents = getPlayedOpponents(teamName, validMatches);
  
  // 计算可能的对手及其概率
  const probabilities = [];
  
  // 首先尝试同组配对
  if (groups[targetGroup]) {
    const sameGroupOpponents = groups[targetGroup].filter(team => {
      const teamStatus = getTeamStatus(getTeamRecord(team.name, validMatches));
      return team.name !== teamName && 
             teamStatus.status === 'active' && 
             !playedOpponents.includes(team.name);
    });
    
    if (sameGroupOpponents.length > 0) {
      // 在同组内，每个对手的基础概率相等
      const baseProb = 1.0 / sameGroupOpponents.length;
      
      sameGroupOpponents.forEach(opponent => {
        let adjustedProb = baseProb;
        
        // 考虑地区回避因素
        const targetTeam = teams.find(t => t.name === teamName);
        const opponentTeam = teams.find(t => t.name === opponent.name);
        
        if (targetTeam && opponentTeam && isSameRegion(targetTeam, opponentTeam)) {
          // 同地区队伍配对概率降低
          adjustedProb *= 0.3; // 降低到30%
        }
        
        probabilities.push({
          opponent: opponent.name,
          probability: adjustedProb
        });
      });
    }
  }
  
  // 如果同组没有可配对的对手，考虑相邻组别
  if (probabilities.length === 0) {
    const adjacentGroups = getAdjacentGroups(targetGroup, groups);
    
    adjacentGroups.forEach(groupKey => {
      if (groups[groupKey]) {
        const adjacentOpponents = groups[groupKey].filter(team => {
          const teamStatus = getTeamStatus(getTeamRecord(team.name, validMatches));
          return team.name !== teamName && 
                 teamStatus.status === 'active' && 
                 !playedOpponents.includes(team.name);
        });
        
        adjacentOpponents.forEach(opponent => {
          const targetTeam = teams.find(t => t.name === teamName);
          const opponentTeam = teams.find(t => t.name === opponent.name);
          
          let prob = 1.0 / adjacentOpponents.length * 0.5; // 相邻组概率较低
          
          if (targetTeam && opponentTeam && isSameRegion(targetTeam, opponentTeam)) {
            prob *= 0.3;
          }
          
          probabilities.push({
            opponent: opponent.name,
            probability: prob
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
  
  // 按概率降序排序
  probabilities.sort((a, b) => b.probability - a.probability);
  
  return probabilities;
}

/**
 * 获取相邻的战绩组别
 * @param {string} targetGroup - 目标组别 (如 "2-1")
 * @param {Object} groups - 所有组别
 * @returns {Array} 相邻组别列表
 */
function getAdjacentGroups(targetGroup, groups) {
  const [wins, losses] = targetGroup.split('-').map(Number);
  const adjacentGroups = [];
  
  // 上一个组别（胜场多一场）
  const upperGroup = `${wins + 1}-${losses}`;
  if (groups[upperGroup]) {
    adjacentGroups.push(upperGroup);
  }
  
  // 下一个组别（负场多一场）
  const lowerGroup = `${wins}-${losses + 1}`;
  if (groups[lowerGroup]) {
    adjacentGroups.push(lowerGroup);
  }
  
  return adjacentGroups;
}

/**
 * 计算指定队伍在指定轮次遇到各个对手的概率（蒙特卡洛方法 - 用于验证）
 * @param {string} teamName - 队伍名称
 * @param {Array} teams - 所有队伍数据
 * @param {Array} allMatches - 所有比赛数据
 * @param {number} round - 目标轮次
 * @param {number} simulations - 模拟次数
 * @returns {Array} 对手概率列表
 */
export function calculateOpponentProbabilitiesMonteCarlo(teamName, teams, allMatches, round, simulations = 1000) {
  const opponentCounts = {};
  
  for (let i = 0; i < simulations; i++) {
    try {
      const drawResult = simulateDrawForRound(teams, allMatches, round);
      
      // 找到该队伍的对手
      const match = drawResult.matches.find(match => 
        match.teamA === teamName || match.teamB === teamName
      );
      
      if (match) {
        const opponent = match.teamA === teamName ? match.teamB : match.teamA;
        opponentCounts[opponent] = (opponentCounts[opponent] || 0) + 1;
      }
    } catch (error) {
      // 忽略单次模拟错误，继续下一次
      continue;
    }
  }
  
  // 转换为概率
  const probabilities = Object.keys(opponentCounts).map(opponent => ({
    opponent,
    probability: opponentCounts[opponent] / simulations
  }));
  
  // 按概率降序排序
  probabilities.sort((a, b) => b.probability - a.probability);
  
  return probabilities;
}

/**
 * 验证当前抽签状态
 * @param {Array} teams - 所有队伍数据
 * @param {Array} allMatches - 所有比赛数据
 * @returns {Object} 验证结果
 */
export function validateDrawState(teams, allMatches) {
  const nextRound = getNextDrawRound(teams, allMatches);
  
  // 检查目标轮次之前的所有比赛是否都有结果
  // 这里包括用户在界面上设置的胜者信息
  const previousRoundMatches = allMatches.filter(match => match.round < nextRound);
  
  for (const match of previousRoundMatches) {
    if (!match.winner || match.winner === null || match.teamA === 'TBD' || match.teamB === 'TBD') {
      return {
        isValid: false,
        error: `第${match.round}轮存在未确定的比赛结果，无法进行抽签模拟`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * 获取下一轮需要抽签的轮次
 * @param {Array} teams - 所有队伍数据
 * @param {Array} allMatches - 所有比赛数据
 * @returns {number} 下一轮轮次
 */
export function getNextDrawRound(teams, allMatches) {
  // 获取有效的比赛数据（包括用户在界面上设置的胜者）
  const validMatches = allMatches.filter(match => 
    match.winner && 
    match.winner !== null &&
    match.teamA !== 'TBD' && 
    match.teamB !== 'TBD'
  );
  
  // 按轮次统计已完成的比赛数量
  const roundCompletionStatus = {};
  for (let round = 1; round <= 5; round++) {
    const roundMatches = validMatches.filter(match => match.round === round);
    const expectedMatches = getExpectedMatchesForRound(round);
    roundCompletionStatus[round] = {
      completed: roundMatches.length,
      expected: expectedMatches,
      isComplete: roundMatches.length >= expectedMatches
    };
  }
  
  // 找到第一个未完成的轮次
  for (let round = 1; round <= 5; round++) {
    if (!roundCompletionStatus[round].isComplete) {
      return round;
    }
  }
  
  // 如果所有轮次都完成了，返回下一轮（最多5轮）
  return 6;
}

/**
 * 获取指定轮次预期的比赛数量
 * @param {number} round - 轮次
 * @returns {number} - 预期比赛数量
 */
function getExpectedMatchesForRound(round) {
  // 根据瑞士制规则，每轮的比赛数量
  switch (round) {
    case 1: return 8; // 16队分8场比赛
    case 2: return 8; // 16队分8场比赛
    case 3: return 8; // 16队分8场比赛
    case 4: return 8; // 16队分8场比赛
    case 5: return 8; // 16队分8场比赛
    default: return 8;
  }
}