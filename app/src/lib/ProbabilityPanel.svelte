<script>
  import { calculateQualificationProbabilities } from './probabilityCalculator.js';
  
  export let teams = [];
  export let matches = [];
  
  let probabilities = [];
  let isCalculating = false;
  let showAdvanced = false;
  let customWinRates = {};
  
  // 计算概率
  async function calculateProbabilities() {
    if (teams.length === 0) return;
    
    isCalculating = true;
    try {
      probabilities = await calculateQualificationProbabilities(teams, matches, customWinRates);
    } catch (error) {
      console.error('Error calculating probabilities:', error);
    } finally {
      isCalculating = false;
    }
  }
  
  // 重置胜率设置
  function resetWinRates() {
    customWinRates = {};
    calculateProbabilities();
  }
  
  // 更新自定义胜率
  function updateWinRate(teamA, teamB, rate) {
    const key = `${teamA}-${teamB}`;
    if (rate === 50) {
      delete customWinRates[key];
    } else {
      customWinRates[key] = rate / 100;
    }
  }
  
  // 安全获取对象属性
  function safeGet(obj, prop, defaultValue = '') {
    return obj && typeof obj === 'object' && prop in obj ? obj[prop] : defaultValue;
  }
  
  // 当数据变化时重新计算
  $: if (teams.length > 0 && matches.length > 0) {
    calculateProbabilities();
  }
</script>

<div class="bg-white rounded-lg shadow-lg p-6">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-800">出线概率分析</h2>
    <div class="flex gap-2">
      <button 
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        on:click={calculateProbabilities}
        disabled={isCalculating}
      >
        {isCalculating ? '计算中...' : '重新计算'}
      </button>
      <button 
        class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        on:click={() => showAdvanced = !showAdvanced}
      >
        高级设置
      </button>
    </div>
  </div>
  
  {#if showAdvanced}
    <div class="mb-6 p-4 bg-gray-50 rounded-lg">
      <h3 class="text-lg font-semibold mb-3">自定义对阵胜率</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each teams as teamA}
          {#each teams as teamB}
            {#if safeGet(teamA, 'name') !== safeGet(teamB, 'name')}
              <div class="flex items-center gap-2">
                <span class="text-sm">{safeGet(teamA, 'name')} vs {safeGet(teamB, 'name')}:</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value="50"
                  class="flex-1"
                  on:input={(e) => updateWinRate(safeGet(teamA, 'name'), safeGet(teamB, 'name'), parseInt(e.target.value))} />
                <span class="text-sm w-12">50%</span>
              </div>
            {/if}
          {/each}
        {/each}
      </div>
      <button 
        class="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        on:click={resetWinRates}>
        重置胜率
      </button>
    </div>
  {/if}
  
  {#if isCalculating}
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <p class="mt-2 text-gray-600">正在计算概率...</p>
    </div>
  {:else if Object.keys(probabilities).length > 0}
    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b-2 border-gray-200">
            <th class="text-left py-3 px-4">队伍</th>
            <th class="text-left py-3 px-4">赛区</th>
            <th class="text-left py-3 px-4">当前战绩</th>
            <th class="text-left py-3 px-4">状态</th>
            <th class="text-left py-3 px-4">出线概率</th>
            <th class="text-left py-3 px-4">淘汰概率</th>
            <th class="text-left py-3 px-4">可能战绩</th>
          </tr>
        </thead>
        <tbody>
          {#each getTeamsByProbability() as team}
            <tr class="border-b border-gray-100 hover:bg-gray-50">
              <td class="py-3 px-4 font-semibold">{team.name}</td>
              <td class="py-3 px-4 text-gray-600">{team.zone}</td>
              <td class="py-3 px-4 font-mono">{team.currentRecord.record}</td>
              <td class="py-3 px-4">
                <span class="px-2 py-1 rounded text-xs font-semibold {getStatusColor(team.status.status)}">
                  {team.status.status === 'qualified' ? '已晋级' : 
                   team.status.status === 'eliminated' ? '已淘汰' : '进行中'}
                </span>
              </td>
              <td class="py-3 px-4">
                <span class="px-2 py-1 rounded font-semibold {getProbabilityColor(team.qualificationProbability)}">
                  {team.qualificationProbability}%
                </span>
              </td>
              <td class="py-3 px-4">
                <span class="px-2 py-1 rounded font-semibold {getProbabilityColor(team.eliminationProbability)}">
                  {team.eliminationProbability}%
                </span>
              </td>
              <td class="py-3 px-4">
                <div class="flex flex-wrap gap-1">
                  {#each Object.entries(team.finalRecords || {}) as [record, probability]}
                    <span class="px-2 py-1 bg-gray-200 rounded text-xs">
                      {record}: {probability}%
                    </span>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    
    <!-- 概率分布图表 -->
    <div class="mt-8">
      <h3 class="text-lg font-semibold mb-4">出线概率分布</h3>
      <div class="space-y-2">
        {#each getTeamsByProbability() as team}
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm font-semibold">{team.name}</div>
            <div class="flex-1 bg-gray-200 rounded-full h-6 relative">
              <div 
                class="bg-gradient-to-r from-blue-500 to-green-500 h-6 rounded-full transition-all duration-500"
                style="width: {team.qualificationProbability}%"
              ></div>
              <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
                {team.qualificationProbability}%
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="text-center py-8 text-gray-500">
      <p>等待数据加载...</p>
    </div>
  {/if}
</div>

<style>
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: #ddd;
    border-radius: 2px;
    outline: none;
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
  }
  
  input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }
</style>