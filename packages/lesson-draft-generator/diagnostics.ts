import { LessonDraftGenerationError, type DraftDiagnostic } from './types.ts';

// Only fixed local validator messages may leave the module. Never echo input,
// remote response text, exception messages, URLs, headers or credentials.
const validations = new Set([
  '材料必须是单个完整 JSON 对象。',
  '模型材料过长。',
  '课程材料包含未知字段。',
  '不支持的课程材料版本。',
  '需要对象。',
  '文本为空、过长或包含不允许的标记。',
  '数字不在允许范围内。',
  '列表无效或过长。',
  '标识只能包含字母、数字、横线和下划线。',
  '数据嵌套过深。',
  '数据字段无效。',
  '旁白不能为空或带首尾空白。',
  '旁白片段为空或标识重复。',
  '锚点引用未知旁白片段。',
  '语义锚点为空。',
  '语义锚点缺失。',
  '语义锚点不唯一，请指定 occurrence（从 1 开始）。',
  '语义锚点 occurrence 超出范围。',
  '锚点 edge 只能是 start 或 end。',
  'occurrence 必须是短语的正整数序号。',
  '$time 只能用于已支持的动画时间字段。',
  '动画时间字段必须使用 $time 语义锚点，不能预填秒数。',
  '材料包含不支持的事件；章节由旁白片段自动生成。',
  '状态转换缺少 enter 起点。',
  '板书删除动作引用未知内容。',
  '动画标识重复。',
  '板书样式无效。',
  '板书图形无效。',
  '板书图形坐标数量不正确。',
  '事件引用未知动画。',
  '图示节点为空或重复。',
  '图示连线引用未知节点。',
  '图示连线重复。',
  '未注册流程事件或未知节点/连线。',
  '未注册状态转换事件或未知状态/转换。',
  '曲线至少需要两个采样点。',
  '曲线横坐标必须递增。',
  '曲线事件或采样点无效。',
  '坐标轴包含未知字段。',
  '坐标刻度必须非空、递增且不重复。',
  '曲线 grid 必须是布尔值。',
  '数组不能为空。',
  '数组索引必须是整数。',
  '数组窗口边界错误。',
  '未注册的数组动画事件。',
  '材料 id 必须等于 brief.id。',
  '材料片段数量必须等于 brief.segmentCount。',
  '材料使用了备课需求范围外的动画语法。',
  '材料至少需要一条 board.write。',
  '生成材料必须使用全文板书模式。',
  '图示必须安排讲解动作。',
  '每张图示必须配有完整旁白板书。',
  '旁白片段引用未知图示。',
  '图示动作与本段旁白关联不一致。',
  '重点只能选择局部文字。',
  '重点文字范围无效。',
  '重点不能覆盖整句或跨句。',
]);
export function validationDiagnostic(error: unknown): DraftDiagnostic {
  const message = error instanceof Error ? error.message : '';
  return {
    reason: 'validation',
    validationMessage: validations.has(message)
      ? message
      : '材料结构或动画配置不符合协议，请检查输入。',
  };
}
export function formatLessonDraftError(
  error: LessonDraftGenerationError,
): string {
  const diagnostic = error.diagnostic;
  const reasons: Record<DraftDiagnostic['reason'], string> = {
    http: '模型接口返回 HTTP 错误',
    timeout: '模型请求超时',
    network: '模型网络请求或响应读取失败',
    truncated: '模型输出被 token 上限截断',
    refused: '模型拒绝生成或被安全策略拦截',
    'non-text': '模型返回工具调用或非文本内容',
    'empty-output': '模型没有返回材料文本',
    'invalid-response': '模型接口响应不是预期的完整 JSON 结构',
    'response-too-large': '模型接口响应超过大小限制',
    validation: '材料校验失败',
    aborted: '材料生成已取消',
  };
  const reason =
    diagnostic && Object.hasOwn(reasons, diagnostic.reason)
      ? reasons[diagnostic.reason]
      : '材料生成失败，未提供安全的具体原因';
  const status = diagnostic?.httpStatus;
  const http =
    diagnostic?.reason === 'http' &&
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? `（HTTP ${status}）`
      : '';
  const hints: Record<number, string> = {
    400: '检查模型 ID 和请求参数。',
    401: '检查 API Key 是否有效。',
    402: '检查供应商账户余额。',
    403: '检查模型权限或访问限制。',
    404: '检查 API 根地址及模型 ID。',
    429: '检查额度或限流，不自动重试。',
  };
  const hint = http
    ? (hints[status!] ?? '检查供应商服务状态，不自动重试。')
    : '';
  const validation =
    diagnostic?.reason === 'validation'
      ? `：${validations.has(diagnostic.validationMessage ?? '') ? diagnostic.validationMessage : '材料结构或动画配置不符合协议，请检查输入。'}`
      : '';
  return `${error.code}：${reason}${http}${validation}。${hint}已尝试 ${Number.isInteger(error.attempts) && error.attempts >= 0 && error.attempts <= 3 ? error.attempts : 0} 次模型请求。`;
}
