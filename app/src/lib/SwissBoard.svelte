<script>
  import { onMount } from 'svelte';
  import { 
    getTeamRecord, 
    groupTeamsByRecord, 
    getPossibleOpponents,
    getTeamStatus
  } from './swissLogic.js';
  import { 
    simulateDrawForRound,
    calculateOpponentProbabilities,
    validateDrawState,
    getNextDrawRound
  } from './drawSimulation.js';
  import DrawSimulationModal from './DrawSimulationModal.svelte';
  import ProbabilityAnalysisModal from './ProbabilityAnalysisModal.svelte';

  
  let teams = [];
  
  // 维护3个独立的比赛容器list
  let completedMatches = []; // 1. JSON获取的真实数据，winner不为null的
  let incompleteMatches = []; // 2. JSON获取的真实数据，winner为null的，支持用户指定胜者
  let tbdMatches = []; // 3. 缺失的比赛数据，由TBD vs TBD填充，支持用户选择对手和胜者
  
  // 概率设置相关状态
  let matchProbabilities = new Map(); // 存储每场比赛的概率设置
  let showProbabilityModal = false;
  let currentProbabilityMatch = null;
  let tempProbabilityA = 50; // 临时概率值
  
  // 模拟抽签弹窗状态
  let showDrawModal = false;
  let showProbabilityAnalysisModal = false;
  
  // 按轮次组织比赛数据 - 依赖所有比赛容器以确保响应式更新
  $: roundsData = generateRoundsData(teams, completedMatches, incompleteMatches, tbdMatches);
  
  // 响应式聚合所有比赛，供模态框使用 - 直接依赖三个数组变量
  $: allMatchesForModal = [...completedMatches, ...incompleteMatches, ...tbdMatches];
  
  // 调试日志：监控 allMatchesForModal 的变化
  $: if (allMatchesForModal) {
    console.log('[SwissBoard] allMatchesForModal updated', {
      totalCount: allMatchesForModal.length,
      completedCount: completedMatches.length,
      incompleteCount: incompleteMatches.length,
      tbdCount: tbdMatches.length,
      rounds: Array.from(new Set(allMatchesForModal.map(m => m?.round))).sort(),
      withWinners: allMatchesForModal.filter(m => m?.winner != null).length
    });
  }
  
  // 安全获取对象属性
  function safeGet(obj, prop, defaultValue = '') {
    return obj && typeof obj === 'object' && prop in obj ? obj[prop] : defaultValue;
  }
  
  // 获取所有比赛的合并列表
  function getAllMatches() {
    return [...completedMatches, ...incompleteMatches, ...tbdMatches];
  }
  
  // 获取比赛的实际胜者
  function getMatchWinner(match) {
    return safeGet(match, 'winner');
  }
  
  function getMatchTeam(match, position) {
    return safeGet(match, position);
  }

  // 获取比赛的唯一标识符
  function getMatchId(match) {
    // 支持直接传入字符串ID
    if (typeof match === 'string') {
      return match;
    }
    const id = safeGet(match, 'id');
    if (id) return id;
    const round = safeGet(match, 'round');
    const group = safeGet(match, 'group');
    const teamA = safeGet(match, 'teamA');
    const teamB = safeGet(match, 'teamB');
    return `${round}_${group}_${teamA}_${teamB}`;
  }

  // 获取比赛的概率设置
  function getMatchProbability(match) {
    const matchId = getMatchId(match);
    return matchProbabilities.get(matchId) || { teamA: 50, teamB: 50 };
  }

  // 设置比赛概率
  function setMatchProbability(match, probabilityA) {
    const matchId = getMatchId(match);
    console.log('[SwissBoard] 设置比赛概率:', {
      matchId,
      probabilityA,
      teamA: getMatchTeam(match, 'teamA'),
      teamB: getMatchTeam(match, 'teamB')
    });
    matchProbabilities.set(matchId, {
      teamA: probabilityA,
      teamB: 100 - probabilityA
    });
    matchProbabilities = new Map(matchProbabilities); // 触发响应式更新
    console.log('[SwissBoard] 概率设置完成，当前所有概率:', Array.from(matchProbabilities.entries()));
  }

  // 打开概率设置弹窗
  function openProbabilityModal(match) {
    if (!canSetProbability(match)) return;
    
    currentProbabilityMatch = match;
    const currentProb = getMatchProbability(match);
    tempProbabilityA = currentProb.teamA;
    showProbabilityModal = true;
  }

  // 响应式变量，用于强制重新渲染样式
  let styleUpdateTrigger = 0;
  
  // 保存概率设置
  function saveProbability() {
    if (currentProbabilityMatch) {
      setMatchProbability(currentProbabilityMatch, Number(tempProbabilityA));
      
      // 强制触发响应式更新以重新渲染样式
      // 通过重新赋值数组来触发Svelte的响应式系统
      incompleteMatches = [...incompleteMatches];
      tbdMatches = [...tbdMatches];
      completedMatches = [...completedMatches];
      
      // 增加样式更新触发器
      styleUpdateTrigger++;
      
      console.log('[SwissBoard] 概率保存后强制重新渲染', {
        matchId: getMatchId(currentProbabilityMatch),
        newProbability: Number(tempProbabilityA),
        totalProbabilities: matchProbabilities.size,
        styleUpdateTrigger
      });
    }
    showProbabilityModal = false;
    currentProbabilityMatch = null;
  }

  // 取消概率设置
  function cancelProbability() {
    showProbabilityModal = false;
    currentProbabilityMatch = null;
  }

  // 检查是否可以设置概率
  function canSetProbability(match) {
    // 已确定胜者的比赛不能设置概率
    if (getMatchWinner(match)) return false;
    
    // 队伍未确定的比赛不能设置概率
    const teamA = getMatchTeam(match, 'teamA');
    const teamB = getMatchTeam(match, 'teamB');
    if (teamA === 'TBD' || teamB === 'TBD') return false;
    
    return true;
  }
  
  // 生成TBD比赛容器
  function generateTBDMatches(teams, existingMatches) {
    const tbdList = [];
    
    for (let round = 1; round <= 5; round++) {
      const expectedGroups = getExpectedGroups(round);
      const existingRoundMatches = existingMatches.filter(m => safeGet(m, 'round') === round);
      
      expectedGroups.forEach(groupInfo => {
        const group = String(safeGet(groupInfo, 'group'));
        const existingGroupMatches = existingRoundMatches.filter(m => safeGet(m, 'group') === group);
        const neededMatches = safeGet(groupInfo, 'expectedMatches', 0) - existingGroupMatches.length;
        
        for (let i = 0; i < neededMatches; i++) {
          tbdList.push({
            id: `tbd_${round}_${group}_${i}`,
            round: round,
            group: group,
            teamA: 'TBD',
            teamB: 'TBD',
            winner: null,
            format: "未抽签",
            isTBD: true
          });
        }
      });
    }
    
    return tbdList;
  }
  
  onMount(async () => {
    console.log('[SwissBoard] onMount starting...');
    try {
      // Fetch data from public directory with proper base path handling
      const basePath = import.meta.env.BASE_URL || '/';
      const fetchUrl = `${basePath}matches.json`.replace(/\/+/g, '/');
      console.log('[SwissBoard] fetching from:', fetchUrl);
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch matches.json: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log('[SwissBoard] fetched data:', data);
      
      teams = Array.isArray(safeGet(data, 'teams')) ? safeGet(data, 'teams') : [];
      const originalMatches = Array.isArray(safeGet(data, 'rounds')) ? safeGet(data, 'rounds') : [];
      
      console.log('[SwissBoard] onMount loaded data', {
        teamsCount: teams.length,
        originalMatchesCount: originalMatches.length,
        originalMatchesRounds: Array.from(new Set(originalMatches.map(m => m?.round))).sort()
      });
      
      // 分离已完成和未完成的比赛
      completedMatches = originalMatches.filter(match => safeGet(match, 'winner') !== null);
      incompleteMatches = originalMatches.filter(match => safeGet(match, 'winner') === null);
      
      console.log('[SwissBoard] matches separated', {
        completedCount: completedMatches.length,
        incompleteCount: incompleteMatches.length
      });
      
      // 生成TBD比赛容器
      tbdMatches = generateTBDMatches(teams, originalMatches);
      
      console.log('[SwissBoard] TBD matches generated', {
        tbdCount: tbdMatches.length
      });
      
    } catch (error) {
      console.error('[SwissBoard] Failed to load matches data:', error);
    }
  });
  
  function generateRoundsData(teams, completedMatches, incompleteMatches, tbdMatches) {
    const rounds = [];
    const allMatches = [...completedMatches, ...incompleteMatches, ...tbdMatches];
    
    for (let round = 1; round <= 5; round++) {
      const roundMatches = allMatches.filter(m => safeGet(m, 'round') === round);
      const groups = {};
      
      // 组织比赛按组别
      roundMatches.forEach(match => {
        const group = safeGet(match, 'group');
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(match);
      });
      
      rounds.push({
        round,
        groups: Object.keys(groups).sort((a, b) => {
          // 按胜者多的开始排序 (2-0, 1-1, 0-2)
          const getWins = (record) => parseInt(record.split('-')[0]);
          const getLosses = (record) => parseInt(record.split('-')[1]);
          
          const winsA = getWins(a);
          const winsB = getWins(b);
          const lossesA = getLosses(a);
          const lossesB = getLosses(b);
          
          // 首先按胜场数降序排序
          if (winsA !== winsB) {
            return winsB - winsA;
          }
          
          // 胜场数相同时，按负场数升序排序
          return lossesA - lossesB;
        }).map(groupKey => ({
          name: groupKey,
          matches: groups[groupKey]
        }))
      });
    }
    
    return rounds;
  }
  
  function getExpectedGroups(round) {
    if (round === 1) {
      return [{ group: '0-0', expectedMatches: 8 }];
    }
    
    if (round === 2) {
      return [
        { group: '1-0', expectedMatches: 4 },
        { group: '0-1', expectedMatches: 4 }
      ];
    }
    
    if (round === 3) {
      return [
        { group: '2-0', expectedMatches: 2 },
        { group: '1-1', expectedMatches: 4 },
        { group: '0-2', expectedMatches: 2 }
      ];
    }
    
    if (round === 4) {
      return [
        { group: '2-1', expectedMatches: 3 },
        { group: '1-2', expectedMatches: 3 }
      ];
    }
    
    if (round === 5) {
      return [
        { group: '2-2', expectedMatches: 3 }
      ];
    }
    
    return [];
  }
  
  function handleTeamSelect(match, position, teamName) {
    // 找到对应的比赛容器并更新
    const matchContainer = findMatchContainer(match);
    if (matchContainer) {
      matchContainer.match[position] = teamName;
      
      // 触发响应式更新
      if (matchContainer.type === 'incomplete') {
        incompleteMatches = [...incompleteMatches];
      } else if (matchContainer.type === 'tbd') {
        tbdMatches = [...tbdMatches];
      }
    }
  }
  
  // 查找比赛所属的容器
  function findMatchContainer(match) {
    // 首先检查incomplete matches
    let foundMatch = incompleteMatches.find(m => matchesEqual(m, match));
    if (foundMatch) {
      return { type: 'incomplete', match: foundMatch };
    }
    
    // 然后检查TBD matches
    foundMatch = tbdMatches.find(m => matchesEqual(m, match));
    if (foundMatch) {
      return { type: 'tbd', match: foundMatch };
    }
    
    return null;
  }
  
  // 比较两个比赛是否相等
  function matchesEqual(match1, match2) {
    if (safeGet(match1, 'id') && safeGet(match2, 'id')) {
      return safeGet(match1, 'id') === safeGet(match2, 'id');
    }
    
    return safeGet(match1, 'round') === safeGet(match2, 'round') &&
           safeGet(match1, 'group') === safeGet(match2, 'group') &&
           safeGet(match1, 'teamA') === safeGet(match2, 'teamA') &&
           safeGet(match1, 'teamB') === safeGet(match2, 'teamB');
  }
  
  // 检查比赛是否可编辑
  function isMatchEditable(match) {
    // 已完成的比赛不可编辑
    const isCompleted = completedMatches.some(m => matchesEqual(m, match));
    if (isCompleted) return false;
    
    // 未完成的比赛和TBD比赛都可编辑
    return incompleteMatches.some(m => matchesEqual(m, match)) || 
           tbdMatches.some(m => matchesEqual(m, match));
  }

  function handleWinnerSelect(match, winner) {
    // 获取当前显示的队伍名称
    const currentTeamA = getMatchTeam(match, 'teamA');
    const currentTeamB = getMatchTeam(match, 'teamB');
    
    // 检查是否可以选择胜者（队伍A和队伍B都不是TBD）
    if (currentTeamA === 'TBD' || currentTeamB === 'TBD') {
      return; // 如果有队伍未确定，不能选择胜者
    }
    
    // 检查比赛是否可编辑
    if (!isMatchEditable(match)) {
      return;
    }
    
    // 找到对应的比赛容器并更新胜者
    const matchContainer = findMatchContainer(match);
    if (matchContainer) {
      const currentWinner = safeGet(matchContainer.match, 'winner');
      if (currentWinner === winner) {
        // 如果点击的是当前胜者，则取消选择
        matchContainer.match.winner = null;
      } else {
        // 否则设置新的胜者
        matchContainer.match.winner = winner;
      }
      
      // 触发响应式更新
      if (matchContainer.type === 'incomplete') {
        incompleteMatches = [...incompleteMatches];
      } else if (matchContainer.type === 'tbd') {
        tbdMatches = [...tbdMatches];
      }
    }
  }
  
  function getAvailableTeams(match, position) {
    const otherPosition = position === 'teamA' ? 'teamB' : 'teamA';
    const otherTeam = getMatchTeam(match, otherPosition);
    const currentRound = safeGet(match, 'round');
    const currentGroup = safeGet(match, 'group');
    
    // 获取所有比赛数据
    const allMatches = getAllMatches();
    
    // 如果对手还是TBD，返回所有可能的队伍
    if (otherTeam === 'TBD') {
      // 获取该组别中所有可能的队伍
      const groups = groupTeamsByRecord(teams, allMatches.filter(m => safeGet(m, 'round') < currentRound));
      const groupTeams = groups[currentGroup] || [];
      
      // 过滤掉当前轮次已经出现的队伍
      const currentRoundTeams = getCurrentRoundTeams(currentRound, allMatches);
      
      return groupTeams.filter(team => !currentRoundTeams.has(safeGet(team, 'name')));
    }
    
    // 如果对手已确定，获取该对手的可能对手
    const possibleOpponents = getPossibleOpponents(
      otherTeam,
      currentGroup,
      teams,
      allMatches.filter(m => safeGet(m, 'round') < currentRound),
      currentRound
    );
    
    // 过滤掉当前轮次已经出现的队伍和已经交手过的队伍
    const currentRoundTeams = getCurrentRoundTeams(currentRound, allMatches);
    const previousOpponents = getPreviousOpponents(otherTeam, allMatches.filter(m => safeGet(m, 'round') < currentRound));
    
    return possibleOpponents.filter(team => {
      const teamName = safeGet(team, 'name');
      return !currentRoundTeams.has(teamName) && !previousOpponents.has(teamName);
    });
  }
  
  // 获取当前轮次已经出现的队伍
  function getCurrentRoundTeams(round, allMatches) {
    const currentRoundTeams = new Set();
    allMatches.filter(m => safeGet(m, 'round') === round).forEach(m => {
      const teamA = getMatchTeam(m, 'teamA');
      const teamB = getMatchTeam(m, 'teamB');
      if (teamA !== 'TBD') currentRoundTeams.add(teamA);
      if (teamB !== 'TBD') currentRoundTeams.add(teamB);
    });
    return currentRoundTeams;
  }
  
  // 获取某队伍之前的对手
  function getPreviousOpponents(teamName, previousMatches) {
    const opponents = new Set();
    previousMatches.forEach(match => {
      const teamA = getMatchTeam(match, 'teamA');
      const teamB = getMatchTeam(match, 'teamB');
      
      if (teamA === teamName && teamB !== 'TBD') {
        opponents.add(teamB);
      } else if (teamB === teamName && teamA !== 'TBD') {
        opponents.add(teamA);
      }
    });
    return opponents;
  }
  
  function getMatchClass(match) {
    let classes = 'border rounded-lg p-2 mb-1.5 w-full relative ';
    
    if (getMatchWinner(match)) {
      classes += 'border-green-500 bg-green-50 ';
    } else if (safeGet(match, 'teamA') !== 'TBD' && safeGet(match, 'teamB') !== 'TBD') {
      classes += 'border-gray-300 bg-white hover:bg-gray-50 ';
    } else {
      classes += 'border-dashed border-gray-300 bg-gray-50 ';
    }
    
    return classes;
  }
  
  function getTeamClass(match, team, isWinner) {
    let classes = 'p-2 rounded cursor-pointer transition-colors relative ';
    
    // 如果比赛不可编辑，移除cursor-pointer并添加禁用样式
    if (!isMatchEditable(match)) {
      classes = classes.replace('cursor-pointer', 'cursor-default opacity-75');
    }
    
    if (isWinner) {
      classes += 'bg-green-200 text-green-800 ';
    } else if (getMatchWinner(match) && !isWinner) {
      classes += 'bg-gray-200 text-gray-600 ';
    } else {
      classes += 'hover:bg-blue-100 ';
      // 如果比赛不可编辑，移除hover效果
      if (!isMatchEditable(match)) {
        classes = classes.replace('hover:bg-blue-100', '');
      }
    }
    
    return classes;
  }

  // 获取队伍的概率背景样式
  function getTeamProbabilityStyle(match, team) {
    // 如果比赛已经有胜者，不显示概率样式
    if (getMatchWinner(match)) {
      return '';
    }
    
    // 如果队伍未确定，不显示概率样式
    const teamA = getMatchTeam(match, 'teamA');
    const teamB = getMatchTeam(match, 'teamB');
    if (teamA === 'TBD' || teamB === 'TBD') {
      return '';
    }
    
    const probability = getMatchProbability(match);
    
    console.log('[SwissBoard] 获取队伍概率背景样式:', {
      team,
      teamA,
      teamB,
      probability,
      matchId: getMatchId(match)
    });
    
    let teamProb = 50;
    if (team === teamA) {
      teamProb = probability.teamA;
    } else if (team === teamB) {
      teamProb = probability.teamB;
    }
    
    console.log('[SwissBoard] 队伍概率计算结果:', {
      team,
      teamProb,
      isTeamA: team === teamA,
      isTeamB: team === teamB
    });
    
    // 如果概率为默认值50%，不设置背景
    if (teamProb === 50) {
      console.log('[SwissBoard] 概率为50%，不设置背景');
      return '';
    }
    
    // 根据概率设置背景色
    let style = '';
    if (teamProb > 50) {
      // 胜率较高的队伍使用淡蓝色背景
      const intensity = (teamProb - 50) / 50; // 0-1 范围
      const alpha = 0.15 + intensity * 0.35; // 0.15-0.5 透明度
      style = `background-color: rgba(59, 130, 246, ${alpha}) !important; border-color: rgba(59, 130, 246, 0.3) !important;`; // 蓝色
    } else {
      // 胜率较低的队伍使用淡红色背景
      const intensity = (50 - teamProb) / 50; // 0-1 范围
      const alpha = 0.15 + intensity * 0.35; // 0.15-0.5 透明度
      style = `background-color: rgba(239, 68, 68, ${alpha}) !important; border-color: rgba(239, 68, 68, 0.3) !important;`; // 红色
    }
    
    console.log('[SwissBoard] 生成的背景样式:', {
      teamProb,
      style,
      intensity: teamProb > 50 ? (teamProb - 50) / 50 : (50 - teamProb) / 50,
      alpha: teamProb > 50 ? 0.15 + ((teamProb - 50) / 50) * 0.35 : 0.15 + ((50 - teamProb) / 50) * 0.35
    });
    return style;
  }

  // 概率推演功能
  function performProbabilityAnalysis() {
    // 获取所有比赛数据
    const allMatches = getAllMatches();
    
    // 找到所有未完成的比赛
    const pendingMatches = allMatches.filter(match => 
      !getMatchWinner(match) && 
      getMatchTeam(match, 'teamA') !== 'TBD' && 
      getMatchTeam(match, 'teamB') !== 'TBD'
    );

    if (pendingMatches.length === 0) {
      alert('没有待推演的比赛');
      return;
    }

    console.log('开始概率推演...');

    // 创建包含概率信息的比赛数据
    const matchesWithProbabilities = allMatches.map(match => {
      const prob = getMatchProbability(match);
      
      if (getMatchWinner(match)) {
        // 已完成的比赛，胜者概率为100%
        return {
          ...match,
          winnerProbability: 1.0
        };
      } else if (getMatchTeam(match, 'teamA') !== 'TBD' && getMatchTeam(match, 'teamB') !== 'TBD') {
        // 未完成但队伍已确定的比赛，使用设置的概率
        return {
          ...match,
          teamAProbability: prob.teamA / 100,
          teamBProbability: prob.teamB / 100
        };
      } else {
        return match;
      }
    });

    // 使用蒙特卡洛方法模拟多种可能的结果
    const simulations = 1000;
    const meetingProbabilities = new Map();
    
    // 获取所有活跃队伍
    const activeTeams = teams.filter(team => {
      const record = getTeamRecord(team.name, allMatches);
      const status = getTeamStatus(record);
      return status.status === 'active';
    });

    // 初始化相遇概率统计
    for (let i = 0; i < activeTeams.length; i++) {
      for (let j = i + 1; j < activeTeams.length; j++) {
        const teamA = activeTeams[i].name;
        const teamB = activeTeams[j].name;
        const key = `${teamA}_vs_${teamB}`;
        meetingProbabilities.set(key, 0);
      }
    }

    // 进行蒙特卡洛模拟
    for (let sim = 0; sim < simulations; sim++) {
      // 模拟当前轮次的所有比赛结果
      const simulatedMatches = [...allMatches];
      
      pendingMatches.forEach(match => {
        const probability = getMatchProbability(match);
        const teamA = getMatchTeam(match, 'teamA');
        const teamB = getMatchTeam(match, 'teamB');
        
        // 根据概率决定胜者
        const random = Math.random();
        const winner = random < (probability.teamA / 100) ? teamA : teamB;
        
        // 更新模拟的比赛结果
        const matchIndex = simulatedMatches.findIndex(m => 
          m.round === match.round && 
          getMatchTeam(m, 'teamA') === teamA && 
          getMatchTeam(m, 'teamB') === teamB
        );
        
        if (matchIndex !== -1) {
          simulatedMatches[matchIndex] = {
            ...simulatedMatches[matchIndex],
            winner: winner
          };
        }
      });

      // 计算下一轮的抽签
      try {
        const nextRound = getNextDrawRound(teams, simulatedMatches);
        const drawResult = simulateDrawForRound(teams, simulatedMatches, nextRound);
        
        // 统计相遇情况
        if (drawResult && drawResult.matches) {
          drawResult.matches.forEach(match => {
            const teamA = match.teamA;
            const teamB = match.teamB;
            
            if (teamA && teamB && teamA !== 'TBD' && teamB !== 'TBD') {
              const key1 = `${teamA}_vs_${teamB}`;
              const key2 = `${teamB}_vs_${teamA}`;
              
              if (meetingProbabilities.has(key1)) {
                meetingProbabilities.set(key1, meetingProbabilities.get(key1) + 1);
              } else if (meetingProbabilities.has(key2)) {
                meetingProbabilities.set(key2, meetingProbabilities.get(key2) + 1);
              }
            }
          });
        }
      } catch (error) {
        // 忽略单次模拟错误
        continue;
      }
    }

    // 转换为概率并显示结果
    const results = [];
    meetingProbabilities.forEach((count, key) => {
      const probabilityPct = Number(((count / simulations) * 100).toFixed(1));
      if (probabilityPct > 0) {
        const [teamA, teamB] = key.split('_vs_');
        results.push({
          teamA,
          teamB,
          probability: probabilityPct
        });
      }
    });

    // 按概率降序排序
    results.sort((a, b) => b.probability - a.probability);

    // 显示结果
    if (results.length > 0) {
      let message = '下一轮抽签概率分析结果：\n\n';
      results.forEach(result => {
        if (result.probability >= 1.0) { // 只显示概率大于等于1%的结果
          message += `${result.teamA} vs ${result.teamB}: ${result.probability}%\n`;
        }
      });
      
      if (message === '下一轮抽签概率分析结果：\n\n') {
        message += '所有队伍相遇概率都低于1%';
      }
      
      alert(message);
    } else {
      alert('无法计算下一轮抽签概率，请检查比赛设置');
    }

    console.log('概率推演完成', results);
  }

  function handleApplyDrawResults(event) {
    const { round, matches } = event.detail;
    
    console.log('[SwissBoard] Applying draw results', { round, matches });
    
    // 找到对应轮次的TBD比赛并替换
    matches.forEach(drawMatch => {
      // 在tbdMatches中找到对应的比赛
      const tbdMatchIndex = tbdMatches.findIndex(tbdMatch => 
        tbdMatch.round === round && 
        tbdMatch.group === drawMatch.group &&
        tbdMatch.teamA === 'TBD' && 
        tbdMatch.teamB === 'TBD'
      );
      
      if (tbdMatchIndex !== -1) {
        // 更新TBD比赛的队伍信息
        tbdMatches[tbdMatchIndex] = {
          ...tbdMatches[tbdMatchIndex],
          teamA: drawMatch.teamA,
          teamB: drawMatch.teamB,
          format: drawMatch.format || 'Bo1'
        };
      }
    });
    
    // 触发响应式更新
    tbdMatches = [...tbdMatches];
    
    console.log('[SwissBoard] Draw results applied successfully');
  }
</script>

<div class="p-6 bg-gray-100 min-h-screen">
  <h1 class="text-3xl font-bold text-center mb-8">LOL S赛瑞士轮概率分析</h1>
  
  <div class="overflow-x-auto">
    <div class="flex gap-3 min-w-max">
      {#each roundsData as roundData}
        <div class="flex-shrink-0 w-32">
          <h2 class="text-sm font-semibold mb-1.5 text-center bg-blue-600 text-white py-1 rounded">
            第{safeGet(roundData, 'round')}轮
          </h2>
          
          {#each safeGet(roundData, 'groups', []) as group}
            <div class="mb-4">
              <h3 class="text-sm font-medium mb-1.5 text-gray-700 border-b pb-1">
                {safeGet(group, 'name')}
              </h3>
              
              {#each safeGet(group, 'matches', []) as match}
                <div class={getMatchClass(match)}>
                  <div class="text-xs text-gray-500 mb-1">
                    {safeGet(match, 'format')}
                  </div>
                  
                  <!-- 队伍A -->
                  <div class={getTeamClass(match, getMatchTeam(match, 'teamA'), getMatchWinner(match) === getMatchTeam(match, 'teamA'))}
                       style="{getTeamProbabilityStyle(match, getMatchTeam(match, 'teamA'))} {styleUpdateTrigger ? '' : ''}"
                       role="button"
                       tabindex="0"
                       on:click={() => isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamA'))}
                       on:keydown={(e) => e.key === 'Enter' && isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamA'))}>
                    {#if getMatchTeam(match, 'teamA') === 'TBD'}
                      <select class="w-full bg-transparent border-none outline-none text-sm"
                              on:change={(e) => handleTeamSelect(match, 'teamA', e.target.value)}>
                        <option value="TBD">TBD..</option>
                        {#each getAvailableTeams(match, 'teamA') as team}
                          <option value={safeGet(team, 'name')}>{safeGet(team, 'name')}</option>
                        {/each}
                      </select>
                    {:else}
                      <div class="flex justify-between items-center text-sm">
                        <span class="truncate">{getMatchTeam(match, 'teamA')}</span>
                        {#if canSetProbability(match)}
                          <button 
                            class="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                            on:click|stopPropagation={() => openProbabilityModal(match)}
                            title="设置胜率">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  
                  <!-- 队伍B -->
                  <div class={getTeamClass(match, getMatchTeam(match, 'teamB'), getMatchWinner(match) === getMatchTeam(match, 'teamB'))}
                       style="{getTeamProbabilityStyle(match, getMatchTeam(match, 'teamB'))} {styleUpdateTrigger ? '' : ''}"
                       role="button"
                       tabindex="0"
                       on:click={() => isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamB'))}
                       on:keydown={(e) => e.key === 'Enter' && isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamB'))}>
                    {#if getMatchTeam(match, 'teamB') === 'TBD'}
                      <select class="w-full bg-transparent border-none outline-none text-sm"
                              on:change={(e) => handleTeamSelect(match, 'teamB', e.target.value)}>
                        <option value="TBD">TBD..</option>
                        {#each getAvailableTeams(match, 'teamB') as team}
                          <option value={safeGet(team, 'name')}>{safeGet(team, 'name')}</option>
                        {/each}
                      </select>
                    {:else}
                      <div class="flex justify-between items-center text-sm">
                        <span class="truncate">{getMatchTeam(match, 'teamB')}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  
  <!-- 模拟抽签按钮 -->
  <div class="mt-8 text-center space-x-4">
    <button 
      class="bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 transition-colors font-semibold"
      on:click={() => showDrawModal = true}
    >
      模拟抽签
    </button>
    
    <button 
      class="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
      on:click={() => showProbabilityAnalysisModal = true}
    >
      概率推演
    </button>
  </div>

  <!-- 队伍状态总览 -->
  <div class="mt-6 bg-white rounded-lg p-6">
    <h2 class="text-xl font-semibold mb-4">队伍状态</h2>
    <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
      {#each teams as team}
        {@const allMatches = getAllMatches()}
        {@const record = getTeamRecord(safeGet(team, 'name'), allMatches)}
        {@const status = getTeamStatus(record)}
        <div class="p-2 rounded border text-sm {safeGet(status, 'status') === 'qualified' ? 'bg-green-100 border-green-300' : 
                                        safeGet(status, 'status') === 'eliminated' ? 'bg-red-100 border-red-300' : 
                                        'bg-gray-100 border-gray-300'}">
          <div class="font-semibold truncate">{safeGet(team, 'name')}</div>
          <div class="text-xs font-medium">{safeGet(record, 'record')}</div>
          {#if safeGet(status, 'reason')}
            <div class="text-xs {safeGet(status, 'status') === 'qualified' ? 'text-green-600' : 'text-red-600'}">
              {safeGet(status, 'reason')}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- 模拟抽签弹窗 -->
<DrawSimulationModal 
  bind:isOpen={showDrawModal}
  {teams}
  allMatches={allMatchesForModal}
  on:close={() => showDrawModal = false}
  on:applyResults={handleApplyDrawResults}
/>

<!-- 概率分析弹窗 -->
<ProbabilityAnalysisModal 
  bind:isOpen={showProbabilityAnalysisModal}
  {teams}
  allMatches={allMatchesForModal}
  {getMatchProbability}
  on:close={() => showProbabilityAnalysisModal = false}
/>

<!-- 概率设置弹窗 -->
{#if showProbabilityModal && currentProbabilityMatch}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">设置比赛胜率</h3>
      
      <div class="mb-4">
        <div class="text-sm text-gray-600 mb-2">
          {getMatchTeam(currentProbabilityMatch, 'teamA')} vs {getMatchTeam(currentProbabilityMatch, 'teamB')}
        </div>
        
        <div class="space-y-4">
          <div>
            <label for="probA" class="block text-sm font-medium text-gray-700 mb-2">
              {getMatchTeam(currentProbabilityMatch, 'teamA')} 胜率: {tempProbabilityA}%
            </label>
            <input 
              id="probA"
              type="range" 
              min="0" 
              max="100" 
              bind:value={tempProbabilityA}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          
          <div>
            <p class="block text-sm font-medium text-gray-700 mb-2">
              {getMatchTeam(currentProbabilityMatch, 'teamB')} 胜率: {100 - Number(tempProbabilityA)}%
            </p>
            <div class="w-full h-2 bg-gray-200 rounded-lg relative" aria-label="{getMatchTeam(currentProbabilityMatch, 'teamB')} 胜率条">
              <div 
                class="h-full bg-blue-500 rounded-lg transition-all duration-200"
                style="width: {100 - Number(tempProbabilityA)}%"
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex justify-end space-x-3">
        <button 
          class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          on:click={cancelProbability}
        >
          取消
        </button>
        <button 
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          on:click={saveProbability}
        >
          保存
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
    background-position: right 0.5rem center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
    padding-right: 2.5rem;
  }
</style>