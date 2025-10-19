<script>
  import { createEventDispatcher } from 'svelte';
  import { 
    getTeamRecord, 
    getTeamStatus, 
    groupTeamsByRecord, 
    getPlayedOpponents 
  } from './swissLogic.js';
  import { 
    getNextDrawRound,
    calculateOpponentProbabilities
  } from './drawSimulation.js';
  import { 
    calculateTeamDrawProbabilities,
    calculateMeetingProbability as mathCalculateMeetingProbability,
    calculateQualificationProbability
  } from './mathematicalProbability.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  export let isOpen = false;
  /** @type {Team[]} */
  export let teams = [];
  export let allMatches = [];
  export let getMatchProbability = null;

  /**
   * @typedef {Object} Team
   * @property {string} name
   * @property {string} region
   */

  /**
   * @typedef {Object} OpponentProb
   * @property {string} opponent
   * @property {number} probability
   * @property {string} [status]
   */

  /**
   * @typedef {Object} Scenario
   * @property {number} probability
   * @property {string} nextRecord
   * @property {OpponentProb[]} opponents
   */

  /**
   * @typedef {Object} Result
   * @property {string} scenario
   * @property {OpponentProb[]} probabilities
   */

  /**
   * @typedef {Object} AnalysisResults
   * @property {string} [teamName]
   * @property {string} [currentRecord]
   * @property {Scenario} [winScenario]
   * @property {Scenario} [lossScenario]
   * @property {OpponentProb[]} [summary]
   * @property {object} [qualificationProbability]
   * @property {Result[]} [results]
   */

  onMount(() => {
    console.log('[ProbabilityAnalysisModal] mounted', {
      teamsCount: Array.isArray(teams) ? teams.length : 0,
      allMatchesCount: Array.isArray(allMatches) ? allMatches.length : 0,
      rounds: Array.from(new Set((Array.isArray(allMatches) ? allMatches : []).map(m => m?.round))).sort()
    });
  });

  let selectedTeamA = '';
  let selectedTeamB = '';
  let probabilityRound = 2;
  let predictionRound = 3;
  let analysisMode = 'single'; // 'single' or 'pair'
  let isCalculating = false;
  /** @type {AnalysisResults | null} */
  let analysisResults = null;
  let results = []; // used for pair analysis

  // 获取可用的轮次选项 - 修复响应式更新问题
  $: availableRounds = (() => {
    console.log('[ProbabilityAnalysisModal] 计算可用轮次', {
      teamsExists: !!teams,
      allMatchesExists: !!allMatches,
      teamsLength: teams?.length || 0,
      allMatchesLength: allMatches?.length || 0
    });
    
    const rounds = [];
    if (!teams || !allMatches || teams.length === 0 || allMatches.length === 0) {
      // 如果数据还没加载，提供默认轮次选项
      for (let i = 2; i <= 5; i++) rounds.push(i);
      console.log('[ProbabilityAnalysisModal] 使用默认轮次', rounds);
      return rounds;
    }
    
    try {
      // 找到最大的不包含TBD对手的轮次
      let maxValidRound = 1;
      
      for (let round = 2; round <= 5; round++) {
        const roundMatches = allMatches.filter(match => match.round === round);
        const hasTBD = roundMatches.some(match => 
          match.teamA === 'TBD' || match.teamB === 'TBD'
        );
        
        if (!hasTBD && roundMatches.length > 0) {
          maxValidRound = round;
        } else if (hasTBD) {
          // 一旦遇到有TBD的轮次，就停止
          break;
        }
      }
      
      // 生成可用轮次列表
      for (let i = 2; i <= maxValidRound; i++) {
        rounds.push(i);
      }
      
      console.log('[ProbabilityAnalysisModal] 计算得到轮次', {
        maxValidRound,
        rounds,
        allRoundsDetail: [2, 3, 4, 5].map(r => ({
          round: r,
          matches: allMatches.filter(m => m.round === r),
          hasTBD: allMatches.filter(m => m.round === r).some(m => m.teamA === 'TBD' || m.teamB === 'TBD')
        }))
      });
    } catch (error) {
      console.error('[ProbabilityAnalysisModal] 计算轮次出错', error);
      // 出错时使用默认轮次
      for (let i = 2; i <= 5; i++) rounds.push(i);
    }
    
    return rounds;
  })();
  
  // 获取活跃的队伍列表 - 使用函数调用以确保数据获取的一致性
  /** @type {Team[]} */
  $: activeTeams = getActiveTeams();

  // 预测轮次自动为概率轮次+1
  $: predictionRound = probabilityRound + 1;

  // 当概率轮次改变时，重新计算活跃队伍并重置选择
  $: if (probabilityRound) {
    console.log('[ProbabilityAnalysisModal] 概率轮次改变', {
      newProbabilityRound: probabilityRound,
      predictionRound: probabilityRound + 1
    });

    // 重新计算活跃队伍，但尽量保留用户选择
    activeTeams = getActiveTeams();
    const activeNames = activeTeams.map(t => t && t.name).filter(Boolean);
    if (selectedTeamA && !activeNames.includes(selectedTeamA)) selectedTeamA = '';
    if (selectedTeamB && !activeNames.includes(selectedTeamB)) selectedTeamB = '';
    analysisResults = null;
  }

  // 当弹窗打开时，自动设置默认轮次并重置选择
  let initialized = false;

  $: if (isOpen && !initialized) {
    console.log('[ProbabilityAnalysisModal] 弹窗首次打开', {
      teamsCount: teams?.length || 0,
      allMatchesCount: allMatches?.length || 0,
      currentProbabilityRound: probabilityRound
    });
    
    if (teams && teams.length > 0 && allMatches && allMatches.length > 0) {
      if (availableRounds.length > 0) {
        probabilityRound = Math.max(...availableRounds);
      }
      
      initialized = true;
      analysisResults = null;
    }
  }

  // 当弹窗关闭时，重置初始化标记
  $: if (!isOpen && initialized) {
    initialized = false;
  }

  function getAvailableRounds() {
    // 这个函数现在被上面的响应式语句替代，保留以防其他地方调用
    const rounds = [];
    if (!teams || !allMatches) {
      for (let i = 2; i <= 5; i++) rounds.push(i);
      return rounds;
    }
    const nextRound = getNextDrawRound(teams, allMatches);
    const maxRound = Math.min(nextRound, 5);
    for (let i = 2; i <= maxRound; i++) {
      rounds.push(i);
    }
    return rounds;
  }

  function getActiveTeams() {
    console.log('[ProbabilityAnalysisModal] getActiveTeams 调用', {
      teamsExists: !!teams,
      allMatchesExists: !!allMatches,
      probabilityRound,
      teamsLength: teams?.length || 0,
      allMatchesLength: allMatches?.length || 0
    });
    
    if (!teams || !allMatches) {
      console.log('[ProbabilityAnalysisModal] teams 或 allMatches 为空');
      return [];
    }
    
    // 获取在概率轮次之前（包含当前轮次）的有效比赛
    const validMatches = allMatches.filter(match => 
      match.round <= probabilityRound && 
      match.winner && 
      match.winner !== null &&
      match.teamA !== 'TBD' && 
      match.teamB !== 'TBD'
    );
    
    console.log('[ProbabilityAnalysisModal] 有效比赛过滤结果', {
      totalMatches: allMatches.length,
      validMatches: validMatches.length,
      probabilityRound,
      allMatchesDetail: allMatches.map(m => ({
        round: m.round,
        teamA: m.teamA,
        teamB: m.teamB,
        winner: m.winner
      })),
      validMatchesDetail: validMatches.map(m => ({
        round: m.round,
        teamA: m.teamA,
        teamB: m.teamB,
        winner: m.winner
      }))
    });
    
    // 过滤出仍然活跃的队伍
    const activeTeams = teams.filter(team => {
      const record = getTeamRecord(team.name, validMatches);
      const status = getTeamStatus(record);
      return status.status === 'active';
    });
    
    console.log('[ProbabilityAnalysisModal] 活跃队伍过滤结果', {
      totalTeams: teams.length,
      activeTeams: activeTeams.length,
      activeTeamNames: activeTeams.map(t => t.name)
    });
    
    return activeTeams;
  }

  function closeModal() {
    isOpen = false;
    selectedTeamA = '';
    selectedTeamB = '';
    analysisResults = null;
  }

  async function performAnalysis() {
    if (!selectedTeamA && analysisMode === 'single') {
      alert('请选择要分析的战队');
      return;
    }

    if ((!selectedTeamA || !selectedTeamB) && analysisMode === 'pair') {
      alert('请选择两支战队');
      return;
    }

    isCalculating = true;
    analysisResults = null;

    try {
      calculateProbabilities();
    } catch (error) {
      console.error('概率分析错误:', error);
      alert('概率分析失败，请检查设置');
    } finally {
      isCalculating = false;
    }
  }

  // 计算概率
  function calculateProbabilities() {
    if (!selectedTeamA) return;
    
    if (analysisMode === 'single') {
      // 单队分析模式 - 使用新的枚举逻辑
      const singleTeamResult = calculateTeamProbabilitiesWithEnumeration(
        selectedTeamA, teams, allMatches, probabilityRound, predictionRound
      );
      analysisResults = singleTeamResult;
    } else {
      // 双队分析模式
      if (selectedTeamB) {
        const meetingProb = mathCalculateMeetingProbability(
          selectedTeamA, selectedTeamB, teams, allMatches, predictionRound
        );
        
        results = [{
          scenario: `${selectedTeamA} vs ${selectedTeamB}`,
          probabilities: [{
            opponent: selectedTeamB,
            probability: meetingProb,
            status: 'meeting'
          }]
        }];
        analysisResults = { results }; // Keep old structure for now
      }
    }
    
    // 计算出线概率
    if (selectedTeamA) {
      const qualificationInfo = calculateQualificationProbability(selectedTeamA, teams, allMatches);
      if (analysisResults) {
        analysisResults.qualificationProbability = qualificationInfo;
      } else {
        analysisResults = { qualificationProbability: qualificationInfo };
      }
    }
  }

  /**
   * 使用枚举方法计算战队概率
   * @param {string} teamName - 战队名称
   * @param {Array} teams - 所有战队
   * @param {Array} allMatches - 所有比赛数据
   * @param {number} currentRound - 当前轮次
   * @param {number} targetRound - 目标轮次
   * @returns {Object} 分析结果
   */
  function calculateTeamProbabilitiesWithEnumeration(teamName, teams, allMatches, currentRound, targetRound) {
    console.log('[ProbabilityAnalysisModal] 开始枚举计算', {
      teamName, currentRound, targetRound
    });

    // 获取当前轮次的所有比赛
    const allCurrentRoundMatches = allMatches.filter(match => 
      match.round === currentRound && 
      match.teamA !== 'TBD' && 
      match.teamB !== 'TBD'
    );

    // 找到该战队在本轮的比赛
    const teamMatchThisRound = allCurrentRoundMatches.find(m => m.teamA === teamName || m.teamB === teamName);

    // 获取用于枚举的未确定结果的比赛
    const undecidedMatches = allCurrentRoundMatches.filter(match => !match.winner);

    // 获取战队当前战绩
    const matchesBeforeCurrentRound = allMatches.filter(m => m.round < currentRound && m.winner);
    const currentRecord = getTeamRecord(teamName, matchesBeforeCurrentRound);
    const currentRecordStr = `${currentRecord.wins}-${currentRecord.losses}`;

    // 枚举所有可能的比赛结果组合
    const allPossibilities = enumerateAllPossibilities(undecidedMatches);
     
    // 计算每种可能性的概率
    const possibilitiesWithProbabilities = allPossibilities.map(possibility => {
      const probability = calculatePossibilityProbability(possibility, undecidedMatches);
      return { matches: possibility, probability };
    });

    let winPossibilities = [];
    let losePossibilities = [];

    if (teamMatchThisRound && teamMatchThisRound.winner) {
      // 如果本轮比赛结果已定
      if (teamMatchThisRound.winner === teamName) {
        winPossibilities = possibilitiesWithProbabilities;
      } else {
        losePossibilities = possibilitiesWithProbabilities;
      }
    } else if (teamMatchThisRound) {
      // 如果本轮比赛结果未定
      winPossibilities = possibilitiesWithProbabilities.filter(p => 
        getTeamOutcomeInPossibility(p, teamName) === 'win'
      );
      losePossibilities = possibilitiesWithProbabilities.filter(p => 
        getTeamOutcomeInPossibility(p, teamName) === 'lose'
      );
    } else {
      // 如果本轮没有该战队的比赛，则胜负场景都为空
    }

    const winTotalProbability = winPossibilities.reduce((sum, p) => sum + p.probability, 0);
    const loseTotalProbability = losePossibilities.reduce((sum, p) => sum + p.probability, 0);

    const winOpponentProbsRaw = calculateDrawProbabilitiesForPossibilities(
      winPossibilities, teamName, teams, allMatches, targetRound
    );
    const loseOpponentProbsRaw = calculateDrawProbabilitiesForPossibilities(
      losePossibilities, teamName, teams, allMatches, targetRound
    );

    const winOpponentProbsNormalized = winOpponentProbsRaw.map(p => ({
        ...p,
        probability: winTotalProbability > 0 ? p.probability / winTotalProbability : 0
    })).sort((a, b) => b.probability - a.probability);

    const loseOpponentProbsNormalized = loseOpponentProbsRaw.map(p => ({
        ...p,
        probability: loseTotalProbability > 0 ? p.probability / loseTotalProbability : 0
    })).sort((a, b) => b.probability - a.probability);

    // 综合概率
    const summaryMap = new Map();
    winOpponentProbsRaw.forEach(p => summaryMap.set(p.opponent, (summaryMap.get(p.opponent) || 0) + p.probability));
    loseOpponentProbsRaw.forEach(p => summaryMap.set(p.opponent, (summaryMap.get(p.opponent) || 0) + p.probability));
    const summary = Array.from(summaryMap.entries()).map(([opponent, probability]) => ({ opponent, probability }))
        .sort((a, b) => b.probability - a.probability);

    return {
      teamName,
      currentRecord: currentRecordStr,
      winScenario: {
        probability: winTotalProbability,
        nextRecord: `${currentRecord.wins + 1}-${currentRecord.losses}`,
        opponents: winOpponentProbsNormalized,
      },
      lossScenario: {
        probability: loseTotalProbability,
        nextRecord: `${currentRecord.wins}-${currentRecord.losses + 1}`,
        opponents: loseOpponentProbsNormalized,
      },
      summary,
    };
  }

  /**
   * 枚举所有可能的比赛结果组合
   * @param {Array} matches - 比赛列表
   * @returns {Array} 所有可能的结果组合
   */
  function enumerateAllPossibilities(matches) {
    if (matches.length === 0) return [[]];
    
    const possibilities = [];
    const totalCombinations = Math.pow(2, matches.length);
    
    for (let i = 0; i < totalCombinations; i++) {
      const possibility = [];
      for (let j = 0; j < matches.length; j++) {
        const match = matches[j];
        const teamAWins = (i >> j) & 1;
        possibility.push({
          ...match,
          winner: teamAWins ? match.teamA : match.teamB
        });
      }
      possibilities.push(possibility);
    }
    
    return possibilities;
  }

  /**
   * @typedef {Object} MatchProb
   * @property {number} teamA
   * @property {number} teamB
   */

  /**
   * 计算某种可能性的概率
   * @param {Array<Object>} possibility - 比赛结果组合
   * @param {Array<Object>} originalMatches - 原始比赛数据
   * @returns {number} 概率值
   */
  function calculatePossibilityProbability(possibility, originalMatches) {
    let totalProbability = 1.0;
    
    possibility.forEach(match => {
      // 获取比赛的概率设置 - 需要从父组件传递getMatchProbability函数
      // 暂时使用默认50%概率
      const matchProb = getMatchProbabilityForAnalysis(match);
      const winnerProb = /** @type {string} */ (match.winner) === match.teamA ? 
        matchProb.teamA / 100 : matchProb.teamB / 100;
      totalProbability *= winnerProb;
    });
    
    return totalProbability;
  }

  /**
    * 获取比赛的概率设置（用于分析）
    * @param {Object} match - 比赛对象
    * @returns {MatchProb} 概率设置
    */
   function getMatchProbabilityForAnalysis(match) {
     // 使用传入的getMatchProbability函数，如果没有则返回默认值
     if (getMatchProbability && typeof getMatchProbability === 'function') {
       return getMatchProbability(match);
     }
     return { teamA: 50, teamB: 50 };
   }

  /**
   * 根据结果类型过滤可能性
   * @param {Array} possibilities - 所有可能性
   * @param {string} teamName - 战队名称
   * @param {string} outcome - 结果类型
   * @returns {Array} 过滤后的可能性
   */
  function filterPossibilitiesByOutcome(possibilities, teamName, outcome) {
    if (outcome === 'both') {
      return possibilities;
    }
    
    return possibilities.filter(possibility => {
      const teamOutcome = getTeamOutcomeInPossibility(possibility, teamName);
      return teamOutcome === outcome;
    });
  }

  /**
   * 获取战队在某种可能性中的结果
   * @param {Object} possibility - 可能性对象
   * @param {string} teamName - 战队名称
   * @returns {string} 'win', 'lose', 或 'none'
   */
  function getTeamOutcomeInPossibility(possibility, teamName) {
    const teamMatch = possibility.matches.find(match => 
      match.teamA === teamName || match.teamB === teamName
    );
    
    if (!teamMatch) return 'none';
    
    return teamMatch.winner === teamName ? 'win' : 'lose';
  }

  /**
   * 为一组可能性计算抽签概率
   * @param {Array} possibilities - 可能性列表
   * @param {string} teamName - 战队名称
   * @param {Array} teams - 所有战队
   * @param {Array} allMatches - 所有比赛
   * @param {number} targetRound - 目标轮次
   * @returns {Array} 对手概率列表
   */
  function calculateDrawProbabilitiesForPossibilities(possibilities, teamName, teams, allMatches, targetRound) {
    const opponentProbabilities = new Map();
    
    possibilities.forEach(possibility => {
      // 创建包含这种可能性结果的比赛数据
      const hypotheticalMatches = [...allMatches];
      
      // 更新当前轮次的比赛结果
      possibility.matches.forEach(possibilityMatch => {
        const matchIndex = hypotheticalMatches.findIndex(match =>
          match.round === possibilityMatch.round &&
          match.group === possibilityMatch.group &&
          match.teamA === possibilityMatch.teamA &&
          match.teamB === possibilityMatch.teamB
        );
        
        if (matchIndex !== -1) {
          hypotheticalMatches[matchIndex] = { ...hypotheticalMatches[matchIndex], winner: possibilityMatch.winner };
        }
      });

      // 检查战队状态
      const teamRecord = getTeamRecord(teamName, hypotheticalMatches);
      const teamStatus = getTeamStatus(teamRecord);
      
      if (teamStatus.status !== 'active') {
        // 战队已晋级或淘汰
        const statusKey = teamStatus.status === 'qualified' ? '已晋级' : '已淘汰';
        const currentProb = opponentProbabilities.get(statusKey) || 0;
        opponentProbabilities.set(statusKey, currentProb + possibility.probability);
      } else {
        // 计算抽签概率
         const drawProbs = calculateOpponentProbabilities(teamName, teams, hypotheticalMatches, targetRound);
        
        drawProbs.forEach(drawProb => {
          const currentProb = opponentProbabilities.get(drawProb.opponent) || 0;
          opponentProbabilities.set(drawProb.opponent, currentProb + possibility.probability * drawProb.probability);
        });
      }
    });

    // 转换为数组格式并排序
    const result = Array.from(opponentProbabilities.entries()).map(([opponent, probability]) => ({
      opponent,
      probability
    })).sort((a, b) => b.probability - a.probability);

    console.log('[ProbabilityAnalysisModal] 最终抽签概率', result);
    
    return result;
  }

  function safeGet(obj, prop, defaultValue = '') {
    return obj && typeof obj === 'object' && prop in obj ? obj[prop] : defaultValue;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <!-- 标题栏 -->
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-800">概率推演分析</h2>
          <button 
            class="text-gray-500 hover:text-gray-700 text-2xl"
            on:click={closeModal}
          >
            ×
          </button>
        </div>

        <!-- 设置区域 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <!-- 轮次设置 -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">轮次设置</h3>
            
            <div>
              <label for="probability-round" class="block text-sm font-medium text-gray-700 mb-2">
                概率轮次（当前轮次）
              </label>
              <select 
                id="probability-round"
                bind:value={probabilityRound}
                class="w-full p-2 border border-gray-300 rounded-md"
              >
                {#each availableRounds as round}
                  <option value={round}>第 {round} 轮</option>
                {/each}
              </select>
            </div>

            <div>
              <label for="prediction-round" class="block text-sm font-medium text-gray-700 mb-2">
                预测轮次（目标轮次）
              </label>
              <div class="w-full p-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700">
                第 {predictionRound} 轮
              </div>
            </div>
          </div>

          <!-- 分析模式设置 -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">分析模式</h3>
            
            <div class="space-y-2">
              <label class="flex items-center">
                <input 
                  type="radio" 
                  bind:group={analysisMode} 
                  value="single"
                  class="mr-2"
                />
                单队分析（查看一支队伍的抽签概率）
              </label>
              <label class="flex items-center">
                <input 
                  type="radio" 
                  bind:group={analysisMode} 
                  value="pair"
                  class="mr-2"
                />
                双队分析（查看两队相遇概率）
              </label>
            </div>

            {#if analysisMode === 'single'}
              <div>
                <label for="team-a" class="block text-sm font-medium text-gray-700 mb-2">
                  选择战队
                </label>
                <select 
                  id="team-a"
                  bind:value={selectedTeamA}
                  class="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">请选择战队</option>
                  {#each activeTeams as team}
                    <option value={team.name}>{team.name}</option>
                  {/each}
                </select>
              </div>

            {:else}
              <div>
                <label for="team-a-pair" class="block text-sm font-medium text-gray-700 mb-2">
                  战队 A
                </label>
                <select 
                  id="team-a-pair"
                  bind:value={selectedTeamA}
                  class="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">请选择战队 A</option>
                  {#each activeTeams as team}
                    <option value={team.name}>{team.name}</option>
                  {/each}
                </select>
              </div>

              <div>
                <label for="team-b" class="block text-sm font-medium text-gray-700 mb-2">
                  战队 B
                </label>
                <select 
                  id="team-b"
                  bind:value={selectedTeamB}
                  class="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">请选择战队 B</option>
                  {#each activeTeams as team}
                    <option value={team.name}>{team.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex justify-center mb-6 flex-col items-center">
          <button 
            class="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold disabled:opacity-50"
            on:click={performAnalysis}
            disabled={isCalculating}
          >
            {isCalculating ? '分析中...' : '开始分析'}
          </button>
          <p class="text-xs text-gray-500 mt-2">未指定胜者的比赛将按50%的默认概率计算。</p>
        </div>

        <!-- 结果显示区域 -->
        {#if analysisResults}
          <div class="border-t pt-6">
            <h3 class="text-lg font-semibold mb-4">分析结果</h3>
            


            {#if analysisResults.teamName}
              <div class="mb-4">
                <h4 class="text-xl font-bold mb-3">{analysisResults.teamName} ({analysisResults.currentRecord})</h4>

                <!-- Win Scenario -->
                <div class="mb-4 p-4 border rounded-lg bg-green-50">
                  <h5 class="font-semibold text-lg mb-2 text-green-800">
                    若胜利 
                    <span class="font-normal text-gray-700">
                      {#if analysisResults.winScenario.probability === 0}
                        (不可能发生)
                      {:else}
                        ({(analysisResults.winScenario.probability * 100).toFixed(1)}%, 战绩 {analysisResults.winScenario.nextRecord})
                      {/if}
                    </span>
                  </h5>
                  {#if analysisResults.winScenario.opponents.length > 0}
                    <div class="space-y-1">
                      {#each analysisResults.winScenario.opponents as prob}
                        <div class="flex justify-between items-center text-sm">
                          <span>碰到 <span class="font-semibold">{prob.opponent}</span> 的概率</span>
                          <span class="font-bold text-green-700">{(prob.probability * 100).toFixed(1)}%</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-gray-600 text-sm">没有可能的对手。</p>
                  {/if}
                </div>

                <!-- Loss Scenario -->
                <div class="mb-4 p-4 border rounded-lg bg-red-50">
                  <h5 class="font-semibold text-lg mb-2 text-red-800">
                    若失败 
                    <span class="font-normal text-gray-700">
                      {#if analysisResults.lossScenario.probability === 0}
                        (不可能发生)
                      {:else}
                        ({(analysisResults.lossScenario.probability * 100).toFixed(1)}%, 战绩 {analysisResults.lossScenario.nextRecord})
                      {/if}
                    </span>
                  </h5>
                  {#if analysisResults.lossScenario.opponents.length > 0}
                    <div class="space-y-1">
                      {#each analysisResults.lossScenario.opponents as prob}
                        <div class="flex justify-between items-center text-sm">
                          <span>碰到 <span class="font-semibold">{prob.opponent}</span> 的概率</span>
                          <span class="font-bold text-red-700">{(prob.probability * 100).toFixed(1)}%</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-gray-600 text-sm">没有可能的对手。</p>
                  {/if}
                </div>

                <!-- Summary -->
                <div class="p-4 border rounded-lg bg-gray-100">
                  <h5 class="font-semibold text-lg mb-2 text-gray-800">综合来说</h5>
                  {#if analysisResults.summary.length > 0}
                    <div class="space-y-1">
                      {#each analysisResults.summary as prob}
                        <div class="flex justify-between items-center text-sm">
                          <span>碰到 <span class="font-semibold">{prob.opponent}</span> 的概率</span>
                          <span class="font-bold text-blue-700">{(prob.probability * 100).toFixed(1)}%</span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-gray-600 text-sm">无法计算综合概率。</p>
                  {/if}
                </div>
              </div>
            {:else if analysisResults.results}
              <!-- Fallback for pair analysis -->
              {#each analysisResults.results as result}
                <div class="mb-6 p-4 border rounded-lg">
                  <h4 class="font-semibold text-lg mb-3">{result.scenario}</h4>
                  
                  {#if result.probabilities && result.probabilities.length > 0}
                    <div class="space-y-2">
                      {#each result.probabilities as prob}
                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span class="font-medium">{prob.opponent}</span>
                          <span class="text-blue-600 font-semibold">
                            {(prob.probability * 100).toFixed(2)}%
                          </span>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-gray-500">暂无数据</p>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if analysisResults.qualificationProbability}
              <div class="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 class="font-semibold text-blue-800">
                  五五开出线概率
                  <span class="text-sm font-normal text-gray-600">（接下来轮次的比赛都是50%胜率的出线概率）</span>
                </h4>
                <p class="text-blue-700 mt-2">
                  {selectedTeamA} 当前战绩：{analysisResults.qualificationProbability.currentRecord || '未知'}
                </p>
                <p class="text-blue-700 font-bold mt-1">
                  理论出线概率：{(analysisResults.qualificationProbability.probability * 100).toFixed(1)}%
                </p>
              </div>
            {/if}
          </div>
        {/if}
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