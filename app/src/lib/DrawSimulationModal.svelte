<script>
  import { 
    simulateDrawForRound, 
    calculateOpponentProbabilities,
    calculateOpponentProbabilitiesMonteCarlo,
    validateDrawState, 
    getNextDrawRound 
  } from './drawSimulation.js';
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  export let teams = [];
  export let allMatches = [];
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  onMount(() => {
    console.log('[DrawSimulationModal] mounted', {
      teamsCount: Array.isArray(teams) ? teams.length : 0,
      allMatchesCount: Array.isArray(allMatches) ? allMatches.length : 0,
      rounds: Array.from(new Set((Array.isArray(allMatches) ? allMatches : []).map(m => m?.round))).sort()
    });
  });

  $: if (isOpen) {
    console.log('[DrawSimulationModal] opened', {
      teamsCount: Array.isArray(teams) ? teams.length : 0,
      allMatchesCount: Array.isArray(allMatches) ? allMatches.length : 0,
      beforeTargetRoundsCount: Array.isArray(allMatches) ? allMatches.filter(m => m?.round < targetRound).length : 0,
      winnersBeforeTargetRound: Array.isArray(allMatches) ? allMatches.filter(m => m?.round < targetRound && m?.winner != null).length : 0
    });
    
    // 当模态框打开时，自动设置为下一个可模拟的轮次
    const nextRound = getNextDrawRound(teams, allMatches);
    if (nextRound <= 5) {
      targetRound = nextRound;
    }
  }

  let isSimulating = false;
  let simulationResult = null;
  let simulationError = null;
  let selectedTeam = '';
  let targetRound = 1; // 用户指定的目标轮次
  let opponentProbabilities = [];

  // 计算可用的轮次选项
  $: availableRounds = (() => {
    const nextRound = getNextDrawRound(teams, allMatches);
    const rounds = [];
    for (let i = 1; i <= Math.min(nextRound, 5); i++) {
      rounds.push(i);
    }
    return rounds;
  })();

  function closeModal() {
    isOpen = false;
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function simulateDraw() {
    isSimulating = true;
    simulationError = null;
    // 不清空之前的结果，允许重复模拟

    try {
      console.log('[simulateDraw] inputs', {
        targetRound,
        allMatchesCount: Array.isArray(allMatches) ? allMatches.length : 0,
        matchesBeforeTargetRound: Array.isArray(allMatches) ? allMatches.filter(m => m?.round < targetRound).length : 0
      });
      const validation = validateDrawState(teams, allMatches);
      if (!validation.isValid) {
        simulationError = validation.error;
        return;
      }

      const result = simulateDrawForRound(teams, allMatches, targetRound);
      console.log('[simulateDraw] result', result);
      
      simulationResult = {
        round: targetRound,
        matches: Array.isArray(result.matches) ? result.matches : []
      };
    } catch (error) {
      simulationError = (error && error.message) ? error.message : '模拟抽签时发生错误';
    } finally {
      isSimulating = false;
    }
  }

  function clearSimulationResult() {
    simulationResult = null;
    simulationError = null;
  }

  function applySimulationResult() {
    if (!simulationResult || !simulationResult.matches) {
      return;
    }
    
    // 发送事件到父组件，传递抽签结果
    dispatch('applyResults', {
      round: simulationResult.round,
      matches: simulationResult.matches
    });
    
    // 应用后关闭模态框
    closeModal();
  }

  function getOpponents() {
    if (!selectedTeam) return;

    try {
      console.log('[getOpponents] inputs', {
        selectedTeam,
        targetRound,
        allMatchesCount: Array.isArray(allMatches) ? allMatches.length : 0,
        matchesBeforeTargetRound: Array.isArray(allMatches) ? allMatches.filter(m => m?.round < targetRound).length : 0
      });

      const validation = validateDrawState(teams, allMatches);
      if (!validation.isValid) {
        opponentProbabilities = [];
        return;
      }

      // 获取可能的对手列表（不计算概率）
      const probabilities = calculateOpponentProbabilities(selectedTeam, teams, allMatches, targetRound);
      
      // 只保留对手名称，不显示概率
      opponentProbabilities = Array.isArray(probabilities) ? probabilities.map(p => ({ opponent: p.opponent })) : [];
    } catch (error) {
      console.error('获取对手列表时发生错误:', error);
      opponentProbabilities = [];
    }
  }

  function handleTeamSelect(event) {
    selectedTeam = event.target.value;
    if (selectedTeam) {
      getOpponents();
    }
  }

  function handleRoundSelect(event) {
    targetRound = parseInt(event.target.value);
    // 清空之前的结果
    simulationResult = null;
    opponentProbabilities = [];
    simulationError = null;
  }

  $: activeTeams = Array.isArray(teams) ? teams : [];
</script>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #eee;
  }

  .modal-header h2 {
    margin: 0;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: #333;
  }

  .modal-body {
    padding: 20px;
  }

  .section {
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid #eee;
  }

  .section:last-child {
    border-bottom: none;
  }

  .section h3 {
    margin: 0 0 10px 0;
    color: #333;
  }

  .section p {
    margin: 0 0 15px 0;
    color: #666;
  }

  .simulate-btn {
    background: #8b5cf6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    display: inline-block;
  }

  .simulate-btn:hover:not(.disabled) {
    background: #7c3aed;
  }

  .simulate-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .round-select {
    width: 150px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .team-select {
    width: 200px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .error-message {
    background: #fee;
    color: #c53030;
    padding: 10px;
    border-radius: 4px;
    margin-top: 10px;
    border: 1px solid #fed7d7;
  }

  .loading {
    color: #666;
    font-style: italic;
    margin-top: 10px;
  }

  .simulation-result {
    margin-top: 15px;
    padding: 15px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .result-header h4 {
    margin: 0;
    color: #333;
  }

  .close-result-btn {
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e2e8f0;
    border-radius: 50%;
    color: #666;
    font-size: 14px;
    transition: all 0.2s;
  }

  .close-result-btn:hover {
    background: #cbd5e0;
    color: #333;
  }

  .round-info {
    margin-top: 8px;
    font-size: 12px;
    color: #666;
  }

  .matches-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .match-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: white;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }

  .team {
    font-weight: 500;
    color: #2d3748;
  }

  .vs {
    color: #666;
    font-size: 12px;
  }

  .format {
    color: #666;
    font-size: 12px;
  }

  .group {
    color: #666;
    font-size: 12px;
  }

  .probability-result {
    margin-top: 15px;
  }

  .probability-result h4 {
    margin: 0 0 10px 0;
    color: #333;
  }

  .opponents-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
    padding: 10px;
    background: white;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }

  .opponent-item {
    color: #2d3748;
    font-weight: 500;
  }

  .apply-result-section {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
  }

  .apply-btn {
    background: #10b981;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    display: inline-block;
    margin-bottom: 8px;
  }

  .apply-btn:hover {
    background: #059669;
  }

  .apply-hint {
    margin: 0;
    color: #666;
    font-size: 12px;
  }
</style>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal-content">
      <div class="modal-header">
        <h2>模拟抽签</h2>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="close-btn" on:click={closeModal}>×</div>
      </div>

      <div class="modal-body">
        <!-- 轮次选择 -->
        <div class="section">
          <h3>选择目标轮次</h3>
          <select class="round-select" bind:value={targetRound} on:change={handleRoundSelect}>
            {#each availableRounds as round}
              <option value={round}>第{round}轮</option>
            {/each}
          </select>
          <p class="round-info">当前可模拟轮次：第1轮 - 第{Math.max(...availableRounds)}轮</p>
        </div>

        <!-- 模拟抽签部分 -->
        <div class="section">
          <h3>模拟抽签</h3>
          <p>根据当前战绩状态，模拟第 {targetRound} 轮的对战抽签结果</p>
          
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div 
            class="simulate-btn" 
            class:disabled={isSimulating}
            on:click={simulateDraw}
          >
            {isSimulating ? '模拟中...' : '开始模拟'}
          </div>

          {#if simulationError}
            <div class="error-message">
              {simulationError}
            </div>
          {/if}

          {#if simulationResult && simulationResult.matches}
            <div class="simulation-result">
              <div class="result-header">
                <h4>第 {simulationResult.round} 轮抽签结果：</h4>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="close-result-btn" on:click={clearSimulationResult}>
                  ✕
                </div>
              </div>
              <div class="matches-list">
                {#each simulationResult.matches as match}
                  <div class="match-item">
                    <span class="team">{match.teamA || 'TBD'}</span>
                    <span class="vs">vs</span>
                    <span class="team">{match.teamB || 'TBD'}</span>
                    <span class="format">({match.format || 'Bo1'})</span>
                    <span class="group">分组: {match.group || '未知'}</span>
                  </div>
                {/each}
              </div>
              
              <!-- 应用结果按钮 -->
              <div class="apply-result-section">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="apply-btn" on:click={applySimulationResult}>
                  应用到看板
                </div>
                <p class="apply-hint">将抽签结果应用到瑞士轮看板，覆盖对应轮次的TBD比赛</p>
              </div>
            </div>
          {/if}
        </div>

        <!-- 对手查询部分 -->
        <div class="section">
          <h3>对手查询</h3>
          <p>选择队伍，查看其在第 {targetRound} 轮可能遇到的对手</p>
          
          <select class="team-select" on:change={handleTeamSelect}>
            <option value="">请选择队伍</option>
            {#each activeTeams as team}
              <option value={team.name || ''}>{team.name || '未知队伍'}</option>
            {/each}
          </select>

          {#if opponentProbabilities && opponentProbabilities.length > 0}
            <div class="probability-result">
              <h4>{selectedTeam} 在第 {targetRound} 轮的可能对手：</h4>
              <div class="opponents-list">
                {#each opponentProbabilities as item, index}
                  <span class="opponent-item">
                    {item.opponent || '未知'}
                    {#if index < opponentProbabilities.length - 1}、{/if}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}