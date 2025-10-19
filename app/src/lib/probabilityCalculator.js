// 概率计算模块

import { 
  getTeamRecord, 
  getTeamStatus, 
  generatePossibleMatches,
  groupTeamsByRecord 
} from './swissLogic.js';

/**
 * 蒙特卡洛模拟计算出线概率
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 已完成的比赛
 * @param {number} simulations - 模拟次数
 * @param {Object} winProbabilities - 队伍胜率设置 {teamA_vs_teamB: 0.6}
 * @returns {Object} - 各队伍出线概率
 */
export function calculateQualificationProbabilities(teams, matches, simulations = 10000, winProbabilities = {}) {
  const results = {};
  
  // 初始化结果
  teams.forEach(team => {
    results[team.name] = {
      qualified: 0,
      eliminated: 0,
      finalRecords: {}
    };
  });
  
  // 进行蒙特卡洛模拟
  for (let i = 0; i < simulations; i++) {
    const simulationResult = simulateSwissRounds(teams, matches, winProbabilities);
    
    // 统计结果
    Object.keys(simulationResult).forEach(teamName => {
      const teamResult = simulationResult[teamName];
      const record = `${teamResult.wins}-${teamResult.losses}`;
      
      if (teamResult.status === 'qualified') {
        results[teamName].qualified++;
      } else if (teamResult.status === 'eliminated') {
        results[teamName].eliminated++;
      }
      
      if (!results[teamName].finalRecords[record]) {
        results[teamName].finalRecords[record] = 0;
      }
      results[teamName].finalRecords[record]++;
    });
  }
  
  // 计算概率百分比
  Object.keys(results).forEach(teamName => {
    results[teamName].qualificationProbability = (results[teamName].qualified / simulations * 100).toFixed(1);
    results[teamName].eliminationProbability = (results[teamName].eliminated / simulations * 100).toFixed(1);
    
    // 计算各战绩的概率
    Object.keys(results[teamName].finalRecords).forEach(record => {
      results[teamName].finalRecords[record] = (results[teamName].finalRecords[record] / simulations * 100).toFixed(1);
    });
  });
  
  return results;
}

/**
 * 模拟完整的瑞士轮比赛
 * @param {Array} teams - 队伍列表
 * @param {Array} completedMatches - 已完成的比赛
 * @param {Object} winProbabilities - 胜率设置
 * @returns {Object} - 模拟结果
 */
function simulateSwissRounds(teams, completedMatches, winProbabilities) {
  let currentMatches = [...completedMatches];
  const teamRecords = {};
  
  // 初始化队伍记录
  teams.forEach(team => {
    const record = getTeamRecord(team.name, currentMatches);
    teamRecords[team.name] = {
      ...record,
      status: getTeamStatus(record).status,
      zone: team.zone
    };
  });
  
  // 模拟剩余轮次
  for (let round = getCurrentRound(currentMatches) + 1; round <= 5; round++) {
    const roundMatches = generateRoundMatches(teams, currentMatches, round);
    
    // 模拟每场比赛的结果
    roundMatches.forEach(match => {
      const winner = simulateMatchResult(match.teamA, match.teamB, winProbabilities);
      match.winner = winner;
      currentMatches.push(match);
      
      // 更新队伍记录
      updateTeamRecord(teamRecords, match.teamA, winner === match.teamA);
      updateTeamRecord(teamRecords, match.teamB, winner === match.teamB);
    });
    
    // 检查是否有队伍已经确定晋级或淘汰
    Object.keys(teamRecords).forEach(teamName => {
      const status = getTeamStatus(teamRecords[teamName]);
      teamRecords[teamName].status = status.status;
    });
  }
  
  return teamRecords;
}

/**
 * 获取当前进行到的轮次
 * @param {Array} matches - 比赛记录
 * @returns {number} - 当前轮次
 */
function getCurrentRound(matches) {
  return Math.max(0, ...matches.map(m => m.round));
}

/**
 * 生成指定轮次的比赛
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 已完成的比赛
 * @param {number} round - 轮次
 * @returns {Array} - 该轮次的比赛
 */
function generateRoundMatches(teams, matches, round) {
  const groups = groupTeamsByRecord(teams, matches);
  const roundMatches = [];
  
  Object.keys(groups).forEach(recordKey => {
    const activeTeams = groups[recordKey].filter(team => {
      const status = getTeamStatus(team);
      return status.status === 'active';
    });
    
    // 简单的随机配对（实际应该考虑抽签规则）
    const shuffledTeams = [...activeTeams].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffledTeams.length - 1; i += 2) {
      roundMatches.push({
        round,
        group: recordKey,
        teamA: shuffledTeams[i].name,
        teamB: shuffledTeams[i + 1].name,
        winner: null
      });
    }
  });
  
  return roundMatches;
}

/**
 * 模拟单场比赛结果
 * @param {string} teamA - 队伍A
 * @param {string} teamB - 队伍B
 * @param {Object} winProbabilities - 胜率设置
 * @returns {string} - 获胜队伍
 */
function simulateMatchResult(teamA, teamB, winProbabilities) {
  const matchKey = `${teamA}_vs_${teamB}`;
  const reverseMatchKey = `${teamB}_vs_${teamA}`;
  
  let teamAWinProbability = 0.5; // 默认50%胜率
  
  if (winProbabilities[matchKey]) {
    teamAWinProbability = winProbabilities[matchKey];
  } else if (winProbabilities[reverseMatchKey]) {
    teamAWinProbability = 1 - winProbabilities[reverseMatchKey];
  }
  
  return Math.random() < teamAWinProbability ? teamA : teamB;
}

/**
 * 更新队伍记录
 * @param {Object} teamRecords - 队伍记录对象
 * @param {string} teamName - 队伍名称
 * @param {boolean} won - 是否获胜
 */
function updateTeamRecord(teamRecords, teamName, won) {
  if (won) {
    teamRecords[teamName].wins++;
  } else {
    teamRecords[teamName].losses++;
  }
  teamRecords[teamName].record = `${teamRecords[teamName].wins}-${teamRecords[teamName].losses}`;
}

/**
 * 计算特定情况下的出线概率
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 已完成的比赛
 * @param {Array} hypotheticalMatches - 假设的比赛结果
 * @param {number} simulations - 模拟次数
 * @returns {Object} - 概率结果
 */
export function calculateConditionalProbabilities(teams, matches, hypotheticalMatches, simulations = 5000) {
  const combinedMatches = [...matches, ...hypotheticalMatches];
  return calculateQualificationProbabilities(teams, combinedMatches, simulations);
}

/**
 * 获取队伍的可能最终战绩
 * @param {string} teamName - 队伍名称
 * @param {Array} teams - 队伍列表
 * @param {Array} matches - 已完成的比赛
 * @returns {Array} - 可能的最终战绩列表
 */
export function getPossibleFinalRecords(teamName, teams, matches) {
  const currentRecord = getTeamRecord(teamName, matches);
  const status = getTeamStatus(currentRecord);
  
  if (status.status !== 'active') {
    return [currentRecord.record];
  }
  
  const possibleRecords = [];
  const remainingRounds = 5 - getCurrentRound(matches);
  const maxWins = Math.min(3, currentRecord.wins + remainingRounds);
  const maxLosses = Math.min(3, currentRecord.losses + remainingRounds);
  
  for (let wins = currentRecord.wins; wins <= maxWins; wins++) {
    for (let losses = currentRecord.losses; losses <= maxLosses; losses++) {
      if (wins + losses <= 5 && (wins >= 3 || losses >= 3 || wins + losses === 5)) {
        possibleRecords.push(`${wins}-${losses}`);
      }
    }
  }
  
  return possibleRecords;
}