export const CONTENT_TYPES = [
  { value: "promo", label: "宣传片", desc: "品牌形象与核心卖点输出", icon: "🎬" },
  { value: "documentary", label: "微纪录片", desc: "深度故事与人文记录", icon: "🎞️" },
  { value: "short", label: "短视频", desc: "社媒快节奏传播内容", icon: "⚡" },
  { value: "event", label: "活动记录", desc: "现场活动全程跟拍", icon: "📅" }
] as const;

export const AUDIENCES = [
  { value: "family", label: "家庭亲子", desc: "周末微度假家庭客群", icon: "👨‍👩‍👧" },
  { value: "youth", label: "青年游客", desc: "打卡分享型年轻游客", icon: "🧑‍🤝‍🧑" },
  { value: "study", label: "研学团体", desc: "自然教育与学生团体", icon: "🎓" },
  { value: "business", label: "商务考察", desc: "团建与会务接待客群", icon: "💼" }
] as const;

export const DURATIONS = [
  { value: 15, label: "15 秒", desc: "信息流投放" },
  { value: 30, label: "30 秒", desc: "社媒标准版" },
  { value: 60, label: "60 秒", desc: "完整叙事版" },
  { value: 180, label: "3 分钟", desc: "深度长视频" }
] as const;

export const ASPECTS = [
  { value: "16:9", label: "16:9 横屏", desc: "官网 / 大屏 / B站" },
  { value: "9:16", label: "9:16 竖屏", desc: "抖音 / 视频号" },
  { value: "1:1", label: "1:1 方形", desc: "信息流 / 小红书" },
  { value: "4:5", label: "4:5 竖向", desc: "社媒详情页" }
] as const;

export const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((i) => i.value === value)?.label ?? value;
