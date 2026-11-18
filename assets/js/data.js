/* 碎页集 — 常量与示例卡片
 * 所有内容都可以在站内编辑或删除。示例卡用相对时间生成，首次打开不会显得陈旧。
 */
(function () {
  'use strict';

  const KINDS = {
    note: { label: '笔记', icon: 'pen', hint: '一条短笔记，记下最值得留下的一两句。' },
    concept: { label: '概念', icon: 'book', hint: '先用自己的话定义它，再翻面核对。' },
    mistake: { label: '错题', icon: 'alert', hint: '这是一张错题卡：先说错因，再说正确思路。' },
    method: { label: '方法', icon: 'bulb', hint: '这张卡讲方法：先回忆步骤，再翻面检查。' },
    quote: { label: '金句', icon: 'quote', hint: '先试着补全下半句，再翻面。' }
  };

  const SUBJECTS = [
    { name: '数学', color: '#3d6f8e' },
    { name: '语文', color: '#a24d3b' },
    { name: '英语', color: '#4d7350' },
    { name: '物理', color: '#66598c' },
    { name: '化学', color: '#a4762f' },
    { name: '生物', color: '#3e7d66' },
    { name: '历史', color: '#8b5e3b' },
    { name: '地理', color: '#3d7b8a' },
    { name: '政治', color: '#8d4f61' },
    { name: '方法', color: '#6f7046' },
    { name: '心态', color: '#9a623d' },
    { name: '其他', color: '#77736a' }
  ];

  const SUBJECT_COLORS = SUBJECTS.reduce(function (map, item) {
    map[item.name] = item.color;
    return map;
  }, {});

  const md = function () {
    return Array.prototype.slice.call(arguments).join('\n');
  };

  // 25 张示例卡：尽量短、有钩子、可复习。
  const SEED = [
    {
      title: '复合函数的定义域，先内后外',
      kind: 'note', subject: '数学', tags: ['数学', '函数', '易错'], ago: 2,
      content: md(
        '求 `f(g(x))` 的定义域，要同时满足两件事：',
        '',
        '1. `x` 在内层 `g(x)` 的定义域里；',
        '2. `g(x)` 落在外层 `f(u)` 的定义域里。',
        '',
        '**口诀：先内后外，取交集。**'
      )
    },
    {
      title: '基本不等式，先验「一正二定三相等」',
      kind: 'method', subject: '数学', tags: ['数学', '不等式', '易错'], ago: 5,
      content: md(
        '用 `a + b ≥ 2√(ab)` 前，先检查三件事：',
        '',
        '- **一正**：`a`、`b` 都为正；',
        '- **二定**：和或积为定值；',
        '- **三相等**：等号能否取到。',
        '',
        '漏掉「三相等」，最值可能根本取不到。'
      )
    },
    {
      title: '圆锥曲线联立，别漏判别式',
      kind: 'mistake', subject: '数学', tags: ['数学', '圆锥曲线', '错题'], ago: 9,
      content: md(
        '直线与圆锥曲线联立，消元后得到一元二次方程，先写 `Δ > 0`，再用韦达定理。',
        '',
        '两个常见坑：',
        '1. 设 `y = kx + m` 时，忘记讨论斜率不存在；',
        '2. 算出 `x1 + x2` 后，忘记回代求 `y`。',
        '',
        '**防错提醒：先定范围，再算关系，最后代回。**'
      )
    },
    {
      title: '数学不是看会，是算会',
      kind: 'quote', subject: '数学', tags: ['数学', '金句', '刷题'], ago: 13,
      content: '看懂答案，只完成了一半；\n合上答案，从空白处算出来，才算真的会。\n\n**今天多算一遍，考场上少慌一次。**'
    },
    {
      title: '《劝学》里最狠的一句',
      kind: 'quote', subject: '语文', tags: ['语文', '文言文', '金句'], ago: 17,
      content: md(
        '> 不积跬步，无以至千里；不积小流，无以成江海。',
        '',
        '—— 荀子《劝学》',
        '',
        '**用法**：写积累、坚持、量变到质变时，比空喊「努力」更有画面。'
      )
    },
    {
      title: '议论文分论点，用「并列 + 递进」搭骨架',
      kind: 'method', subject: '语文', tags: ['语文', '作文', '结构'], ago: 22,
      content: md(
        '三个分论点不要原地打转，至少让它们往前推一步：',
        '',
        '- **是什么**：先界定问题；',
        '- **为什么**：讲原因与意义；',
        '- **怎么办**：落到行动与边界。',
        '',
        '每段开头用同一个句式，阅卷老师一眼就能看到骨架。'
      )
    },
    {
      title: '虚拟语气：与过去事实相反',
      kind: 'note', subject: '英语', tags: ['英语', '语法', '虚拟语气'], ago: 27,
      content: md(
        '结构：`If + had done, would/could/might have done`。',
        '',
        '`If I had reviewed the notes, I would have passed.`',
        '',
        '**记忆钩子**：事情已经过去，条件句用「过去的过去」，主句用「本可以」。'
      )
    },
    {
      title: 'affect 是动词，effect 是名词',
      kind: 'note', subject: '英语', tags: ['英语', '词汇', '易混'], ago: 32,
      content: md(
        '**affect** `v.` 影响；**effect** `n.` 影响、效果。',
        '',
        '`Social media affects our mood.`',
        '`It has a huge effect on us.`',
        '',
        '例外：`effect` 作动词时意为「实现、造成」，考试很少考。'
      )
    },
    {
      title: 'recommend 后面的从句用 (should) do',
      kind: 'mistake', subject: '英语', tags: ['英语', '语法', '错题'], ago: 38,
      content: md(
        '`recommend / suggest / advise / insist / demand` 后的宾语从句，常用虚拟语气：',
        '',
        '`He recommended that we (should) start early.`',
        '',
        '**别写成** `recommended us to start`；recommend 不接不定式作宾补。'
      )
    },
    {
      title: 'address 不只是「地址」',
      kind: 'concept', subject: '英语', tags: ['英语', '词汇', '熟词僻义'], ago: 44,
      content: md(
        '`address` 作动词还有两个高频意思：',
        '',
        '1. **处理、应对**：`address the problem`；',
        '2. **发表演讲**：`address the audience`。',
        '',
        '阅读里看到 `address an issue`，别翻译成「给问题写地址」。'
      )
    },
    {
      title: '楞次定律：增反减同，来拒去留',
      kind: 'note', subject: '物理', tags: ['物理', '电磁学', '口诀'], ago: 50,
      content: md(
        '感应电流的磁场，总要**阻碍**引起它的磁通量变化。',
        '',
        '- 磁通量增加 → 感应磁场反向；',
        '- 磁通量减少 → 感应磁场同向。',
        '',
        '**口诀：增反减同，来拒去留。**'
      )
    },
    {
      title: '电场线不是粒子的运动轨迹',
      kind: 'concept', subject: '物理', tags: ['物理', '电场', '易错'], ago: 57,
      content: md(
        '电场线描述的是**电场的方向和强弱**，不是带电粒子的运动轨迹。',
        '',
        '只有当粒子初速度为零、且电场线是直线时，轨迹才可能与电场线重合。',
        '',
        '**看轨迹想受力，看电场线想场强。**'
      )
    },
    {
      title: '勒夏特列原理：只「减弱」不「消除」',
      kind: 'concept', subject: '化学', tags: ['化学', '平衡', '原理'], ago: 64,
      content: md(
        '改变影响平衡的一个条件，平衡向**减弱这种改变**的方向移动。',
        '',
        '注意关键词：减弱，不是抵消。',
        '',
        '例如加压，平衡向气体分子数减少的方向移动，但新平衡时压强仍比原来大。'
      )
    },
    {
      title: '电解池阴阳极，先看电子流向',
      kind: 'mistake', subject: '化学', tags: ['化学', '电化学', '错题'], ago: 71,
      content: md(
        '电解池中：',
        '',
        '- **阳极**接电源正极，发生氧化；',
        '- **阴极**接电源负极，发生还原。',
        '',
        '**口诀：阳氧阴还。**',
        '',
        '先看电子流向，再判断离子移动，不要和原电池混淆。'
      )
    },
    {
      title: 'ATP 是「零钱」，不是「存款」',
      kind: 'concept', subject: '生物', tags: ['生物', '代谢', '类比'], ago: 78,
      content: md(
        'ATP 是**直接能源物质**，含量少、转化快；长期储能靠脂肪和糖原。',
        '',
        '**类比**：',
        '- ATP = 口袋里的零钱；',
        '- 糖原 = 银行卡；',
        '- 脂肪 = 定期存款。',
        '',
        '零钱最好用，但不能把全部家当都换成零钱。'
      )
    },
    {
      title: '光合色素怎么记？',
      kind: 'note', subject: '生物', tags: ['生物', '光合作用', '口诀'], ago: 85,
      content: md(
        '叶绿素 a/b 主要吸收**红光和蓝紫光**；类胡萝卜素主要吸收**蓝紫光**。',
        '',
        '纸层析顺序（从上到下）：',
        '**胡萝卜素 → 叶黄素 → 叶绿素 a → 叶绿素 b**。',
        '',
        '**口诀：胡黄 ab。**'
      )
    },
    {
      title: '一条线串起晚清四次应对',
      kind: 'note', subject: '历史', tags: ['历史', '晚清', '时间线'], ago: 92,
      content: md(
        '洋务运动（器物）→ 戊戌变法（制度）→ 清末新政（制度）→ 辛亥革命（政体）。',
        '',
        '**记忆钩子**：先学造枪炮，再学改制度，最后直接换政体。',
        '',
        '答「近代化探索」题时，这条线能迅速搭起框架。'
      )
    },
    {
      title: '历史不是背年份，是找因果',
      kind: 'method', subject: '历史', tags: ['历史', '方法', '因果'], ago: 100,
      content: md(
        '看到一个大事件，先问四句话：',
        '',
        '1. 它之前积压了什么矛盾？',
        '2. 直接导火索是什么？',
        '3. 各方分别得到了什么、失去了什么？',
        '4. 它把后来的历史推向了哪里？',
        '',
        '**年份是路标，因果才是路。**'
      )
    },
    {
      title: '季风成因：海陆热力性质差异',
      kind: 'concept', subject: '地理', tags: ['地理', '气候', '季风'], ago: 108,
      content: md(
        '最主要的原因：**海陆热力性质差异**。',
        '',
        '夏季陆地升温快，形成低压，风从海洋吹向陆地；冬季相反。',
        '',
        '南亚西南季风还叠加了**气压带、风带的季节移动**，答题时别只写海陆差异。'
      )
    },
    {
      title: '矛盾普遍性寓于特殊性之中',
      kind: 'concept', subject: '政治', tags: ['政治', '哲学', '矛盾'], ago: 116,
      content: md(
        '**普遍性寓于特殊性之中**，并通过特殊性表现出来；特殊性也离不开普遍性。',
        '',
        '做题时看到「共性 / 个性」「一般 / 个别」，先想这一对关系。',
        '',
        '**别写反**：不是特殊性寓于普遍性。'
      )
    },
    {
      title: '费曼学习法：讲给 12 岁的人听',
      kind: 'method', subject: '方法', tags: ['方法', '学习', '费曼'], ago: 124,
      content: md(
        '四步：',
        '',
        '1. 选一个概念，写下你已知的全部；',
        '2. 假装讲给一个 12 岁的人听，不许用行话；',
        '3. 卡住的地方，就是漏洞，回去补；',
        '4. 再讲一遍，直到顺得像故事。',
        '',
        '**能讲明白，才是真明白。**'
      )
    },
    {
      title: '间隔重复：1-3-7-15 天',
      kind: 'method', subject: '方法', tags: ['方法', '记忆', '复习'], ago: 132,
      content: md(
        '学完当天、第 3 天、第 7 天、第 15 天各复习一次。',
        '',
        '每次不要重读全文，先**遮住答案回忆**，想不起来再看。',
        '',
        '**复习的关键不是「再看一遍」，而是「再想一次」。**'
      )
    },
    {
      title: '错题本只记三件事',
      kind: 'method', subject: '方法', tags: ['方法', '错题', '效率'], ago: 140,
      content: md(
        '别抄整道题，只写：',
        '',
        '1. **错因**：知识漏洞 / 审题 / 计算 / 时间；',
        '2. **正确思路**：第一步该想什么；',
        '3. **防错提醒**：下次看到什么信号要警惕。',
        '',
        '错题本不是书法练习，是给自己的预警系统。'
      )
    },
    {
      title: '你不需要很厉害才能开始',
      kind: 'quote', subject: '心态', tags: ['金句', '心态', '开始'], ago: 149,
      content: '你不需要很厉害才能开始，\n但你需要开始，才会很厉害。\n\n**先做五分钟，剩下的交给惯性。**'
    },
    {
      title: '焦虑的反义词是具体',
      kind: 'quote', subject: '心态', tags: ['金句', '心态', '行动'], ago: 158,
      content: md(
        '焦虑的反义词是具体。',
        '',
        '把「我要考好」改写成：',
        '「今晚 8 点，做完这 10 道题，再对答案。」',
        '',
        '**越具体，越不慌。**'
      )
    }
  ];

  window.SuiData = {
    KINDS: KINDS,
    SUBJECTS: SUBJECTS,
    SUBJECT_COLORS: SUBJECT_COLORS,
    SEED: SEED
  };
})();
