<script>
  import { onMount } from 'svelte';
  import { 
    getTeamRecord, 
    groupTeamsByRecord, 
    getPossibleOpponents,
    getTeamStatus
  } from './swissLogic.js';

  
  let teams = [];
  
  // 维护3个独立的比赛容器list
  let completedMatches = []; // 1. JSON获取的真实数据，winner不为null的
  let incompleteMatches = []; // 2. JSON获取的真实数据，winner为null的，支持用户指定胜者
  let tbdMatches = []; // 3. 缺失的比赛数据，由TBD vs TBD填充，支持用户选择对手和胜者
  
  // 按轮次组织比赛数据 - 依赖所有比赛容器以确保响应式更新
  $: roundsData = generateRoundsData(teams, completedMatches, incompleteMatches, tbdMatches);
  
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
            format: group,
            isTBD: true
          });
        }
      });
    }
    
    return tbdList;
  }
  
  onMount(async () => {
    try {
      const response = await fetch('/matches.json');
      const data = await response.json();
      teams = Array.isArray(safeGet(data, 'teams')) ? safeGet(data, 'teams') : [];
      const originalMatches = Array.isArray(safeGet(data, 'rounds')) ? safeGet(data, 'rounds') : [];
      
      // 分离已完成和未完成的比赛
      completedMatches = originalMatches.filter(match => safeGet(match, 'winner') !== null);
      incompleteMatches = originalMatches.filter(match => safeGet(match, 'winner') === null);
      
      // 生成TBD比赛容器
      tbdMatches = generateTBDMatches(teams, originalMatches);
      
    } catch (error) {
      console.error('Failed to load matches data:', error);
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
    let classes = 'border rounded-lg p-2 mb-1.5 w-full ';
    
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
    let classes = 'p-2 rounded cursor-pointer transition-colors ';
    
    // 如果比赛不可编辑，移除cursor-pointer并添加禁用样式
    if (!isMatchEditable(match)) {
      classes = classes.replace('cursor-pointer', 'cursor-default opacity-75');
    }
    
    if (isWinner) {
      classes += 'bg-green-200 text-green-800 font-semibold ';
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
                {safeGet(group, 'name')} 组别
              </h3>
              
              {#each safeGet(group, 'matches', []) as match}
                <div class={getMatchClass(match)}>
                  <div class="text-xs text-gray-500 mb-1">
                    {safeGet(match, 'format')}
                  </div>
                  
                  <!-- 队伍A -->
                  <div class={getTeamClass(match, getMatchTeam(match, 'teamA'), getMatchWinner(match) === getMatchTeam(match, 'teamA'))}
                       role="button"
                       tabindex="0"
                       on:click={() => isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamA'))}
                       on:keydown={(e) => e.key === 'Enter' && isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamA'))}>
                    {#if getMatchTeam(match, 'teamA') === 'TBD'}
                      <select class="w-full bg-transparent border-none outline-none text-sm"
                              on:change={(e) => handleTeamSelect(match, 'teamA', e.target.value)}>
                        <option value="TBD">选择...</option>
                        {#each getAvailableTeams(match, 'teamA') as team}
                          <option value={safeGet(team, 'name')}>{safeGet(team, 'name')}</option>
                        {/each}
                      </select>
                    {:else}
                      <div class="flex justify-between items-center text-sm">
                        <span class="truncate">{getMatchTeam(match, 'teamA')}</span>
                      </div>
                    {/if}
                  </div>
                  
                  <!-- 队伍B -->
                  <div class={getTeamClass(match, getMatchTeam(match, 'teamB'), getMatchWinner(match) === getMatchTeam(match, 'teamB'))}
                       role="button"
                       tabindex="0"
                       on:click={() => isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamB'))}
                       on:keydown={(e) => e.key === 'Enter' && isMatchEditable(match) && handleWinnerSelect(match, getMatchTeam(match, 'teamB'))}>
                    {#if getMatchTeam(match, 'teamB') === 'TBD'}
                      <select class="w-full bg-transparent border-none outline-none text-sm"
                              on:change={(e) => handleTeamSelect(match, 'teamB', e.target.value)}>
                        <option value="TBD">选择...</option>
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
  
  <!-- 队伍状态总览 -->
  <div class="mt-8 bg-white rounded-lg p-6">
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