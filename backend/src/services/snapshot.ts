/**
 * 冻结摘要（frozen snapshot）生成器。
 * 在项目创建事务内生成并持久化，之后脚本页只读展示，不再随草稿变化。
 */

export interface OutlineSection {
  key: string;
  title: string;
  startSec: number;
  endSec: number;
  note: string;
}

export interface FrozenSnapshot {
  version: 1;
  frozenAt: string;
  title: string;
  contentType: string;
  contentTypeLabel: string;
  audience: string;
  audienceLabel: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
  outline: OutlineSection[];
  productionNotes: string[];
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  promo: "宣传片",
  documentary: "微纪录片",
  short: "短视频",
  event: "活动记录"
};

export const AUDIENCE_LABELS: Record<string, string> = {
  family: "家庭亲子",
  youth: "青年游客",
  study: "研学团体",
  business: "商务考察"
};

const ASPECT_NOTES: Record<string, string> = {
  "16:9": "横屏宽画幅，适合大屏投放与官网嵌入，注意左右留白构图",
  "9:16": "竖屏移动端优先，主体居中偏上，字幕避开底部交互区",
  "1:1": "方形社媒画幅，主体居中，适合信息流投放",
  "4:5": "竖向社媒画幅，兼顾信息流与详情页展示"
};

const AUDIENCE_TONE: Record<string, string> = {
  family: "语气温暖、节奏舒缓，突出安全与亲子互动场景",
  youth: "节奏明快、转场紧凑，突出打卡点与社交分享点",
  study: "信息密度适中，穿插知识点字幕与讲解留白",
  business: "画面稳重、数据化表达，突出配套与接待能力"
};

export function buildSnapshot(input: {
  title: string;
  contentType: string;
  audience: string;
  durationSec: number;
  aspectRatio: string;
  brief: string;
}): FrozenSnapshot {
  const d = input.durationSec;
  // 三段式结构：开场 20% / 主体 65% / 收尾 15%，按总时长换算时间码。
  const opening = Math.max(1, Math.round(d * 0.2));
  const closing = Math.max(1, Math.round(d * 0.15));
  const body = Math.max(1, d - opening - closing);

  const outline: OutlineSection[] = [
    {
      key: "opening",
      title: "开场 · 氛围建立",
      startSec: 0,
      endSec: opening,
      note: `以标志性景观空镜开场，${AUDIENCE_TONE[input.audience] ?? "建立整体基调"}`
    },
    {
      key: "body",
      title: "主体 · 内容展开",
      startSec: opening,
      endSec: opening + body,
      note: `围绕「${input.title}」展开 2-3 个核心场景，${ASPECT_NOTES[input.aspectRatio] ?? ""}`
    },
    {
      key: "closing",
      title: "收尾 · 行动号召",
      startSec: opening + body,
      endSec: d,
      note: "品牌落版 + 开放信息 + 引导关注/预约"
    }
  ];

  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    title: input.title,
    contentType: input.contentType,
    contentTypeLabel: CONTENT_TYPE_LABELS[input.contentType] ?? input.contentType,
    audience: input.audience,
    audienceLabel: AUDIENCE_LABELS[input.audience] ?? input.audience,
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    brief: input.brief,
    outline,
    productionNotes: [
      ASPECT_NOTES[input.aspectRatio] ?? "",
      AUDIENCE_TONE[input.audience] ?? "",
      `总时长 ${input.durationSec}s，按 ${CONTENT_TYPE_LABELS[input.contentType] ?? input.contentType} 节奏控制单场镜头长度`
    ].filter(Boolean)
  };
}
