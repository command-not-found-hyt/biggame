'use strict';

/* ============================================================
   环形殖民地 — data definitions
   ============================================================ */

const CELLS = 28;

const TERRAINS = {
  forest: {
    id: 'forest', name: '氧蕨舱', color: '#a8cf5a', dark: '#5f8a35',
    walk: { type: 'bounty', power: 0.08, cells: 6 },
    walkText: '踩过：金币 +8% · 6 格'
  },
  meadow: {
    id: 'meadow', name: '苔藓槽', color: '#7fb249', dark: '#44622c',
    walk: { type: 'heal', power: 2, cells: 5 },
    walkText: '踩过：每格回 2 血 · 5 格'
  },
  rock: {
    id: 'rock', name: '矿岩箱', color: '#8d9a9a', dark: '#4e5c5c',
    walk: { type: 'ironwall', power: 0.08, cells: 6 },
    walkText: '踩过：减伤 +8% · 6 格'
  },
  lake: {
    id: 'lake', name: '冷却池', color: '#63d6cc', dark: '#2a8f8a',
    walk: { type: 'fleet', power: 0.10, cells: 8 },
    walkText: '踩过：移速 +10% · 8 格'
  }
};

const BUILDINGS = {
  barracks: { id: 'barracks', name: '休眠舱', color: '#f0b23c', dark: '#a97718' },
  forge:    { id: 'forge',    name: '熔炼炉', color: '#df6b3f', dark: '#8f3f26' },
  tower:    { id: 'tower',    name: '观测塔', color: '#9a83d4', dark: '#5f4d96' },
  shrine:   { id: 'shrine',   name: '制氧机', color: '#a8cf5a', dark: '#5f8a35' }
};

/* Building + terrain sharing one cell (one on the road, one on the roadside). */
const COMBOS = {
  barracks: {
    forest: { type: 'minion', id: 'archer' },
    meadow: { type: 'minion', id: 'spearman' },
    rock:   { type: 'minion', id: 'guard' },
    lake:   { type: 'minion', id: 'sailor' }
  },
  forge: {
    rock:   { type: 'minion', id: 'iron' },
    forest: { type: 'minion', id: 'hunter' },
    meadow: { type: 'minion', id: 'knight' },
    lake:   { type: 'buff', id: 'temper', buff: 'strength', power: 0.16, cells: 10, label: '淬火' }
  },
  tower: {
    lake:   { type: 'minion', id: 'frost' },
    forest: { type: 'minion', id: 'treant' },
    rock:   { type: 'minion', id: 'golem' },
    meadow: { type: 'minion', id: 'wind' }
  },
  shrine: {
    forest: { type: 'buff', id: 'gale',   buff: 'haste',    power: 0.18, cells: 10, label: '疾风' },
    meadow: { type: 'buff', id: 'harvest',buff: 'bounty',   power: 0.20, cells: 10, label: '丰饶' },
    rock:   { type: 'buff', id: 'bulwark',buff: 'ironwall', power: 0.16, cells: 10, label: '铁壁' },
    lake:   { type: 'buff', id: 'spring', buff: 'heal',     power: 4,    cells: 10, label: '清流' }
  }
};

const COMBO_FALLBACK = { type: 'militia' };

/* Three-tile synergies.
   Key format: "buildings.join('+')|terrains.join('+')", both sorted.
   A cell must be filled on all three slots for these to trigger. */
const TRIPLE_COMBOS = {
  'barracks+tower|forest': { type:'minion', id:'ranger' },
  'barracks+forge|meadow': { type:'minion', id:'paladin' },
  'barracks+shrine|rock':  { type:'minion', id:'guardian' },
  'forge+tower|lake':      { type:'minion', id:'frostgolem' },
  'barracks+forge|rock':   { type:'minion', id:'lavab' },
  'shrine+tower|lake':     { type:'minion', id:'tidepriest' },
  'barracks+tower|meadow': { type:'minion', id:'windrider' },
  'barracks+tower|lake':   { type:'minion', id:'tidearcher' },
  'barracks|forest+lake':  { type:'minion', id:'wildhunter' },
  'forge|meadow+rock':     { type:'minion', id:'earthguard' },
  'tower|forest+lake':     { type:'minion', id:'naturemage' },
  'forge+shrine|forest':   { type:'buff', buff:'haste',      power:0.30, cells:12, label:'生态增益' },
  'forge+shrine|meadow':   { type:'buff', buff:'strength',   power:0.30, cells:12, label:'军械过载' },
  'shrine+tower|forest':   { type:'buff', buff:'bounty',     power:0.35, cells:12, label:'数据丰收' },
  'shrine|forest+meadow':  { type:'buff', buff:'heal',       power:6,    cells:12, label:'循环再生' }
};

function tripleKeyFor(buildings, terrains) {
  if (buildings.length === 2 && terrains.length === 1) {
    return buildings.slice().sort().join('+') + '|' + terrains[0];
  }
  if (buildings.length === 1 && terrains.length === 2) {
    return buildings[0] + '|' + terrains.slice().sort().join('+');
  }
  return null;
}

const MINIONS = {
  militia:  { id:'militia',  name:'维修机',   dmg:3,  rate:1.0,  range:2.4, color:'#8a9a96', art:'sword' },
  archer:   { id:'archer',   name:'射钉机', dmg:4,  rate:1.5,  range:4.4, color:'#63d6cc', art:'bow' },
  spearman: { id:'spearman', name:'钻探机',   dmg:8,  rate:0.95, range:2.4, color:'#df6b3f', art:'spear' },
  guard:    { id:'guard',    name:'护盾机',   dmg:4,  rate:0.85, range:2.2, color:'#8ea3c4', art:'shield', aura:0.08 },
  sailor:   { id:'sailor',   name:'冷却机',   dmg:6,  rate:1.2,  range:3.2, color:'#4f8fae', art:'spear' },
  iron:     { id:'iron',     name:'焊装机',   dmg:12, rate:0.7,  range:2.4, color:'#7d8a88', art:'hammer' },
  hunter:   { id:'hunter',   name:'采集机',   dmg:7,  rate:1.35, range:4.2, color:'#a8cf5a', art:'bow' },
  knight:   { id:'knight',   name:'切割机',   dmg:10, rate:0.85, range:2.4, color:'#9a83d4', art:'sword' },
  frost:    { id:'frost',    name:'冷冻机', dmg:5,  rate:1.1,  range:4.2, color:'#63c9d6', art:'magic', slow:0.35 },
  treant:   { id:'treant',   name:'氧蕨机',   dmg:8,  rate:0.7,  range:2.6, color:'#6fae5a', art:'club' },
  golem:    { id:'golem',    name:'起重臂', dmg:11, rate:0.75, range:2.4, color:'#9a9a8a', art:'hammer' },
  wind:     { id:'wind',     name:'通风机', dmg:4,  rate:2.3,  range:4.0, color:'#7fd6c8', art:'magic' },
  // triple-synergy minions
  ranger:     { id:'ranger',     name:'巡检机', dmg:10, rate:1.4,  range:5.0, color:'#4f8f6a', art:'bow' },
  paladin:    { id:'paladin',    name:'重装臂', dmg:15, rate:0.8,  range:2.6, color:'#c9a06a', art:'shield', aura:0.06 },
  guardian:   { id:'guardian',   name:'护盾臂', dmg:7,  rate:1.0,  range:2.4, color:'#63d6cc', art:'shield', aura:0.09 },
  frostgolem: { id:'frostgolem', name:'低温臂', dmg:16, rate:0.75, range:2.8, color:'#63c9d6', art:'hammer', slow:0.3 },
  lavab:      { id:'lavab',      name:'熔炉臂', dmg:17, rate:0.8,  range:2.4, color:'#ef6a5b', art:'hammer' },
  tidepriest: { id:'tidepriest', name:'输液机', dmg:6,  rate:1.6,  range:4.2, color:'#4f8fae', art:'magic' },
  windrider:  { id:'windrider',  name:'巡风机',   dmg:10, rate:1.4,  range:3.0, color:'#8fae7a', art:'sword' },
  tidearcher: { id:'tidearcher', name:'冷凝机', dmg:8,  rate:1.7,  range:4.6, color:'#5fb8c4', art:'bow' },
  wildhunter: { id:'wildhunter', name:'采样机', dmg:9,  rate:1.4,  range:4.6, color:'#6fae8a', art:'bow' },
  earthguard: { id:'earthguard', name:'地基机', dmg:12, rate:0.9,  range:2.4, color:'#9a9a8a', art:'shield', aura:0.05 },
  naturemage: { id:'naturemage', name:'生态机', dmg:9,  rate:1.2,  range:4.4, color:'#6fae5a', art:'magic', slow:0.2 }
};

const BUFFDEFS = {
  strength: { name:'淬火', color:'#ef6a5b', icon:'sword',  fmt: p => '伤害 +' + Math.round(p*100) + '%' },
  haste:    { name:'疾风', color:'#f0b23c', icon:'wind',   fmt: p => '攻速 +' + Math.round(p*100) + '%' },
  bounty:   { name:'丰饶', color:'#e0a72c', icon:'coin',   fmt: p => '金币 +' + Math.round(p*100) + '%' },
  ironwall: { name:'铁壁', color:'#8ea3c4', icon:'shield', fmt: p => '减伤 +' + Math.round(p*100) + '%' },
  heal:     { name:'清流', color:'#63d6cc', icon:'drop',   fmt: p => '每格回 ' + p + ' 血' },
  fleet:    { name:'轻风', color:'#63c9d6', icon:'boot',   fmt: p => '移速 +' + Math.round(p*100) + '%' }
};

/* ---------------- SKILL TREE ---------------- */
const SKILL_BRANCHES = [
  { id:'power',   name:'力量', code:'P', tint:'#ef6a5b', blurb:'更硬、更快、更能打', costMult:1.00 },
  { id:'fortune', name:'财富', code:'F', tint:'#e0a72c', blurb:'钱从每一只怪物身上掉', costMult:1.15 },
  { id:'craft',   name:'工艺', code:'C', tint:'#63d6cc', blurb:'让摆下的每一格更值钱', costMult:1.00 },
  { id:'survive', name:'生存', code:'S', tint:'#8ea3c4', blurb:'活着回来，钱才归你', costMult:1.10 },
  { id:'time',    name:'时间', code:'T', tint:'#b08ae0', blurb:'把整座殖民地的节奏拨快', costMult:1.20 }
];

function trimStat(v) {
  return String(Number(Number(v).toFixed(2)));
}

const STAT_DEFS = {
  maxHp:          { label:'最大生命', glyph:'心', prefix:'心脉', per:5,   fmt:v => '+' + trimStat(v) + ' 生命' },
  dmgPct:         { label:'伤害',     glyph:'拳', prefix:'拳锋', per:4,   fmt:v => '+' + trimStat(v) + '% 伤害' },
  critPct:        { label:'暴击率',   glyph:'暴', prefix:'暴击', per:2,   fmt:v => '暴击率 +' + trimStat(v) + '%' },
  critDmgPct:     { label:'暴击伤害', glyph:'重', prefix:'重击', per:6,   fmt:v => '暴击伤害 +' + trimStat(v) + '%' },
  attackSpeedPct: { label:'攻速',     glyph:'疾', prefix:'连击', per:3,   fmt:v => '+' + trimStat(v) + '% 攻速' },
  goldPct:        { label:'金币',     glyph:'币', prefix:'回收', per:5,   fmt:v => '+' + trimStat(v) + '% 金币' },
  cardChancePct:  { label:'掉牌率',   glyph:'牌', prefix:'嗅觉', per:2,   fmt:v => '+' + trimStat(v) + '% 掉牌率' },
  startCards:     { label:'开局手牌', glyph:'包', prefix:'备货', per:1,   fmt:v => '开局 +' + trimStat(v) + ' 张牌' },
  handSize:       { label:'手牌上限', glyph:'囊', prefix:'行囊', per:1,   fmt:v => '手牌上限 +' + trimStat(v) },
  valueGainPct:   { label:'结算金币', glyph:'溢', prefix:'溢价', per:4,   fmt:v => '结算金币 +' + trimStat(v) + '%' },
  minionPct:      { label:'无人机伤害', glyph:'兵', prefix:'机兵', per:5, fmt:v => '+' + trimStat(v) + '% 无人机伤害' },
  splashPct:      { label:'溅射',     glyph:'鸣', prefix:'溅射', per:4,   fmt:v => '+' + trimStat(v) + '% 溅射' },
  minionCap:      { label:'无人机上限', glyph:'编', prefix:'编队', per:1, fmt:v => '无人机上限 +' + trimStat(v) },
  craftPct:       { label:'联动效果', glyph:'手', prefix:'巧手', per:3,   fmt:v => '+' + trimStat(v) + '% 联动效果' },
  persistCells:   { label:'buff 持续', glyph:'香', prefix:'续航', per:1,  fmt:v => 'buff +' + trimStat(v) + ' 格' },
  buffPowerPct:   { label:'buff 效果', glyph:'幅', prefix:'增幅', per:2,  fmt:v => '+' + trimStat(v) + '% buff 效果' },
  armorPct:       { label:'减伤',     glyph:'盾', prefix:'装甲', per:2,   fmt:v => '-' + trimStat(v) + '% 受伤' },
  regen:          { label:'每格回血', glyph:'生', prefix:'自愈', per:0.2, fmt:v => '每格回血 +' + trimStat(v) },
  deathKeepPct:   { label:'阵亡保留', glyph:'险', prefix:'保险', per:3,   fmt:v => '阵亡保留 +' + trimStat(v) + '%' },
  offKeepPct:     { label:'撤离保留', glyph:'退', prefix:'撤退', per:3,   fmt:v => '非起点撤离 +' + trimStat(v) + '%' },
  movePct:        { label:'移速',     glyph:'靴', prefix:'步频', per:3,   fmt:v => '+' + trimStat(v) + '% 移速' },
  speedPct:       { label:'全局速度', glyph:'速', prefix:'超频', per:5,   fmt:v => '+' + trimStat(v) + '% 全局速度' },
  recruitPct:     { label:'生成速度', glyph:'鼓', prefix:'快造', per:4,   fmt:v => '+' + trimStat(v) + '% 生成速度' },
  revive:         { label:'免死',     glyph:'屈', prefix:'不屈', per:1,   fmt:() => '每轮免死一次' }
};

const SPECIAL_CAP = { handSize:3, startCards:3, minionCap:4, persistCells:6, speedPct:8 };

const SKILL_NODES = [];
const NODES = {};
const BRANCH_BY_ID = {};
for (const branch of SKILL_BRANCHES) BRANCH_BY_ID[branch.id] = branch;

function registerSkillNode(n) {
  const parent = n.parent ? NODES[n.parent] : null;
  n.depth = parent ? parent.depth + 1 : 0;
  const br = n.branch ? BRANCH_BY_ID[n.branch] : null;
  n.branchName = br ? br.name : '核心';
  n.tint = br ? br.tint : '#8fd0c8';
  if (!n.code && br) n.code = br.code;
  if (!n.code) n.code = 'CORE';
  if (n.kind === 'minor') {
    n.max = 1;
    n.growth = 1;
    n.base = Math.round((8 + n.depth * 5) * (br ? br.costMult : 1));
  }
  SKILL_NODES.push(n);
  NODES[n.id] = n;
  return n;
}

registerSkillNode({
  id:'core', name:'殖民地核心', glyph:'核', desc:'力量、财富、工艺、生存、时间从这里分叉',
  max:1, base:0, growth:1, parent:null, branch:null, kind:'root', stat:null, per:0
});

// 主干上的关键节点：保留旧存档的 id、等级和价格曲线
[
  { id:'vitality',    name:'强健体魄', glyph:'心', desc:'最大生命 +8', max:10, base:10,  growth:1.5,  parent:'core',       branch:'power',   stat:'maxHp',          per:8 },
  { id:'strength',    name:'磨砺拳锋', glyph:'拳', desc:'伤害 +10%', max:10, base:14,  growth:1.55, parent:'vitality',   branch:'power',   stat:'dmgPct',         per:10 },
  { id:'crit',        name:'暴烈拳意', glyph:'暴', desc:'暴击率 +4%', max:8, base:52, growth:1.8,  parent:'strength',   branch:'power',   stat:'critPct',        per:4 },
  { id:'attackSpeed', name:'疾风连击', glyph:'疾', desc:'攻速 +6%', max:8, base:30, growth:1.7,  parent:'strength',   branch:'power',   stat:'attackSpeedPct', per:6 },

  { id:'fortune',     name:'捡漏', glyph:'币', desc:'金币 +12%', max:10, base:12, growth:1.5,  parent:'core',       branch:'fortune', stat:'goldPct',       per:12 },
  { id:'scavenge',    name:'嗅觉', glyph:'鼻', desc:'掉牌率 +6%', max:8, base:16, growth:1.6,  parent:'fortune',    branch:'fortune', stat:'cardChancePct', per:6 },
  { id:'valueGain',   name:'溢价', glyph:'溢', desc:'结算金币 +8%', max:5, base:48, growth:1.85, parent:'fortune',    branch:'fortune', stat:'valueGainPct',  per:8 },
  { id:'startkit',    name:'起点干粮', glyph:'包', desc:'开局多 2 张牌', max:3, base:40, growth:2.2, parent:'scavenge', branch:'fortune', stat:'startCards', per:2 },
  { id:'handSize',    name:'行囊', glyph:'囊', desc:'手牌上限 +1', max:3, base:70, growth:2.2,  parent:'startkit',   branch:'fortune', stat:'handSize',      per:1 },

  { id:'craft',       name:'巧手', glyph:'手', desc:'设备地形效果 +6%', max:10, base:18, growth:1.55, parent:'core',       branch:'craft', stat:'craftPct',     per:6 },
  { id:'minionPower', name:'强化', glyph:'兵', desc:'无人机伤害 +10%', max:10, base:14, growth:1.55, parent:'craft',      branch:'craft', stat:'minionPct',    per:10 },
  { id:'persist',     name:'留香', glyph:'香', desc:'buff 多 2 格', max:6, base:16, growth:1.6,  parent:'craft',      branch:'craft', stat:'persistCells', per:2 },
  { id:'splash',      name:'共鸣', glyph:'鸣', desc:'无人机溅射 +10%', max:5, base:60, growth:1.85, parent:'minionPower', branch:'craft', stat:'splashPct', per:10 },
  { id:'potency',     name:'增幅', glyph:'幅', desc:'联动 buff 效果 +5%', max:8, base:22, growth:1.6, parent:'persist', branch:'craft', stat:'buffPowerPct', per:5 },
  { id:'minionCap',   name:'扩容', glyph:'编', desc:'无人机上限 +2', max:4, base:65, growth:2.0, parent:'splash', branch:'craft', stat:'minionCap', per:2 },

  { id:'armor',       name:'皮实', glyph:'盾', desc:'受伤 -6%', max:6, base:18, growth:1.7,  parent:'core',       branch:'survive', stat:'armorPct',     per:6 },
  { id:'extraction',  name:'撤退学', glyph:'退', desc:'非起点撤离 +10%', max:3, base:45, growth:2.2, parent:'armor', branch:'survive', stat:'offKeepPct', per:10 },
  { id:'regen',       name:'生生不息', glyph:'生', desc:'每格回血 +0.5', max:5, base:40, growth:1.75, parent:'armor', branch:'survive', stat:'regen', per:0.5 },
  { id:'insurance',   name:'保险', glyph:'险', desc:'阵亡多留 10%', max:2, base:60, growth:3, parent:'extraction', branch:'survive', stat:'deathKeepPct', per:10 },
  { id:'revive',      name:'不屈', glyph:'屈', desc:'每轮免死一次', max:1, base:180, growth:3, parent:'regen', branch:'survive', stat:'revive', per:1 },

  { id:'overclock',   name:'超频巡检', glyph:'速', desc:'全局速度 +25%', max:4, base:30, growth:1.9, parent:'core', branch:'time', stat:'speedPct', per:25 },
  { id:'fleet',       name:'轻快脚步', glyph:'靴', desc:'移速 +6%', max:8, base:18, growth:1.6, parent:'overclock', branch:'time', stat:'movePct', per:6 },
  { id:'recruit',     name:'快造', glyph:'鼓', desc:'无人机生成快 8%', max:8, base:20, growth:1.6, parent:'overclock', branch:'time', stat:'recruitPct', per:8 }
].forEach(n => registerSkillNode(Object.assign({ kind:'major' }, n)));

// 每个关键节点都会继续分叉：从核心出发是主枝，主枝上每节都长出小枝，
// 这样 300 个节点是从一个点铺开的整棵树，而不是 5 根光杆上挂 5 团叶子。
const NODE_THEMES = {
  vitality:    ['maxHp','dmgPct'],
  strength:    ['dmgPct','critDmgPct'],
  crit:        ['critPct','critDmgPct'],
  attackSpeed: ['attackSpeedPct','dmgPct'],

  fortune:     ['goldPct','cardChancePct'],
  scavenge:    ['cardChancePct','goldPct'],
  valueGain:   ['valueGainPct','goldPct'],
  startkit:    ['startCards','cardChancePct'],
  handSize:    ['handSize','startCards'],

  craft:       ['craftPct','buffPowerPct'],
  minionPower: ['minionPct','splashPct'],
  persist:     ['persistCells','buffPowerPct'],
  splash:      ['splashPct','minionPct'],
  potency:     ['buffPowerPct','craftPct'],
  minionCap:   ['minionCap','minionPct'],

  armor:       ['armorPct','regen'],
  extraction:  ['offKeepPct','deathKeepPct'],
  regen:       ['regen','armorPct'],
  insurance:   ['deathKeepPct','offKeepPct'],
  revive:      ['armorPct','regen'],

  overclock:   ['speedPct','attackSpeedPct'],
  fleet:       ['movePct','speedPct'],
  recruit:     ['recruitPct','speedPct']
};

const BRANCH_FANS = [
  { branch:'power',   minors:56, fallback:'dmgPct' },
  { branch:'fortune', minors:55, fallback:'goldPct' },
  { branch:'craft',   minors:55, fallback:'craftPct' },
  { branch:'survive', minors:55, fallback:'armorPct' },
  { branch:'time',    minors:55, fallback:'movePct' }
];

const skillSerial = { power:0, fortune:0, craft:0, survive:0, time:0 };
const skillStatUse = {};
const skillChildCount = {};
for (const node of SKILL_NODES) {
  if (node.parent) skillChildCount[node.parent] = (skillChildCount[node.parent] || 0) + 1;
}

function pickSkillStat(theme, fallback, seed) {
  for (let k = 0; k < theme.length; k++) {
    const stat = theme[(seed + k) % theme.length];
    const cap = SPECIAL_CAP[stat];
    if (cap === undefined || (skillStatUse[stat] || 0) < cap) {
      skillStatUse[stat] = (skillStatUse[stat] || 0) + 1;
      return stat;
    }
  }
  skillStatUse[fallback] = (skillStatUse[fallback] || 0) + 1;
  return fallback;
}

// 每个节点最多三个子节点，随机长短不一地生长：
// 有的枝条早早收梢，有的继续往外抽，整棵树才不会长成一个规整的圆盘。
// 每一环有容量上限，外面一圈转得开，才不会挤成一片。
const FAN_MAX_CHILDREN = 3;
const FAN_MAX_DEPTH = 8;
const FAN_RING_CAP = [0, 1, 4, 6, 9, 11, 13, 15, 17];
function fanRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

for (const fan of BRANCH_FANS) {
  const br = BRANCH_BY_ID[fan.branch];
  const rnd = fanRandom(br.code.charCodeAt(0) * 7919 + fan.minors);
  const named = SKILL_NODES.filter(n => n.branch === fan.branch && n.kind === 'major');
  const ringCount = {};
  for (const node of named) ringCount[node.depth] = (ringCount[node.depth] || 0) + 1;
  const queue = named.slice();
  let remaining = fan.minors;
  let guard = 0;
  while (remaining > 0 && queue.length && guard++ < 12000) {
    const parent = queue.splice(Math.floor(rnd() * queue.length), 1)[0];
    const childDepth = parent.depth + 1;
    if (childDepth > FAN_MAX_DEPTH) continue;
    const used = skillChildCount[parent.id] || 0;
    let slots = FAN_MAX_CHILDREN - used;
    const room = (FAN_RING_CAP[childDepth] || 0) - (ringCount[childDepth] || 0);
    slots = Math.min(slots, room);
    if (slots <= 0) continue;
    let take = 1 + (rnd() < 0.62 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);
    take = Math.min(take, slots, remaining);
    const seedNode = parent.kind === 'major' ? parent : NODES[parent.themeSeed];
    const theme = NODE_THEMES[seedNode.id] || [fan.fallback];
    for (let i = 0; i < take; i++) {
      skillSerial[br.id]++;
      const serial = skillSerial[br.id];
      const stat = pickSkillStat(theme, fan.fallback, serial + i);
      const def = STAT_DEFS[stat];
      const code = br.code + '-' + String(serial).padStart(2, '0');
      const node = registerSkillNode({
        id: br.id + '_' + String(serial).padStart(3, '0'),
        name: def.prefix + ' ' + code,
        glyph: def.glyph,
        desc: def.fmt(def.per),
        max: 1, base: 0, growth: 1,
        parent: parent.id,
        branch: br.id,
        kind: 'minor',
        stat,
        per: def.per,
        code,
        themeSeed: seedNode.id
      });
      skillChildCount[parent.id] = (skillChildCount[parent.id] || 0) + 1;
      skillChildCount[node.id] = 0;
      ringCount[childDepth] = (ringCount[childDepth] || 0) + 1;
      queue.push(node);
      remaining--;
    }
    if ((skillChildCount[parent.id] || 0) < FAN_MAX_CHILDREN) queue.push(parent);
  }
}

function nodeCost(node, level) {
  if (node.id === 'core' || node.max <= 1) return node.base;
  return Math.round(node.base * Math.pow(node.growth, level));
}

function nodeEffectText(node, level) {
  const label = node.desc + (node.max > 1 ? ' / 级' : '');
  if (node.id === 'core') return { label: node.desc, total: '起点' };
  if (!level) return { label, total: '未点亮' };
  if (node.id === 'overclock') {
    const mult = 1 + 0.25 * level;
    return { label, total: '全局速度 ×' + trimStat(mult) };
  }
  const def = STAT_DEFS[node.stat];
  return { label, total: def ? def.fmt(node.per * level) : '' };
}

/* ---------------- MONSTERS ---------------- */
const MONSTER_TYPES = {
  slime: { name:'污染团', color:'#5fb8a8', dark:'#2a8f8a', size:0.9, hp:1.0, gold:1.0 },
  bat:   { name:'蚀翼虫', color:'#9a83d4', dark:'#5f4d96', size:0.92, hp:0.85, gold:1.15, fly:true },
  thorn: { name:'尖刺兽', color:'#df6b3f', dark:'#8f3f26', size:1.0, hp:1.3, gold:1.2 },
  boss:  { name:'污染巨兽', color:'#465a62', dark:'#000', size:1.55, hp:7.5, gold:9.0, boss:true },
  mega:  { name:'深核暴君', color:'#2e4048', dark:'#000', size:2.15, hp:18.0, gold:24.0, boss:true, mega:true }
};

const CARD_LIMIT = 8;
const MINION_BASE_CAP = 16;

const DEFAULT_META = () => ({
  version: 1,
  gold: 0,
  nodes: { core: 1 },
  bestLap: 0,
  runs: 0,
  totalGold: 0,
  sound: true
});
